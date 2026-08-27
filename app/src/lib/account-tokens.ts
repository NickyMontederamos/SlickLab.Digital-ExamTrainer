import { randomBytes, createHash } from "node:crypto";
import type { AccountTokenType, Role } from "@prisma/client";
import { assertCan } from "./rbac";
import { forPlatform, forTenant } from "./tenant-db";
import { hashPassword } from "./password";
import { AUDIT_ACTIONS, logAudit } from "./audit";

/**
 * Single-use bearer tokens for invite-based account setup and self-service
 * password reset (see AccountToken in schema.prisma). Both flows share one
 * mechanism because they're the same shape end to end: generate a random
 * token, email/hand it to the right person, they visit a link and set a
 * password, done. Splitting them into two parallel implementations would
 * just be the same logic typed twice.
 *
 * Only tokenHash is ever persisted (sha256 of the raw token) — the raw
 * token exists exactly once, in the URL handed back to the caller at
 * creation time. This mirrors password.ts's own posture: a value the
 * system can verify but never needs to read back.
 */

const TOKEN_BYTES = 32;
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — an invite sits in someone's inbox
const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour — a reset is meant to be used right away

export class InvalidTokenError extends Error {
  constructor() {
    super("This link is invalid, expired, or has already been used.");
    this.name = "InvalidTokenError";
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Admin-side: mint an invite for a user who was created with no
 * admin-known password (see inviteUser() in users.ts). Returns the raw
 * token exactly once — the caller is responsible for putting it in a URL
 * and getting it to the invited person (copy/paste today; email once that
 * infrastructure exists, see docs/DISASTER_RECOVERY.md's "what's next"
 * framing).
 */
export async function createInviteToken(institutionId: string, actor: { id?: string; role: Role }, userId: string): Promise<string> {
  assertCan(actor.role, "user", "update");

  const raw = generateRawToken();
  const db = forTenant(institutionId);
  await db.accountToken.create({
    data: {
      userId,
      type: "INVITE",
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    } as never,
  });

  await logAudit({
    institutionId,
    actorUserId: actor.id ?? null,
    action: AUDIT_ACTIONS.userInvite,
    resourceType: "user",
    resourceId: userId,
    result: "SUCCESS",
  });

  return raw;
}

/**
 * Public, unauthenticated: a visitor claims to have forgotten their
 * password for `email`. Deliberately returns the same shape (a token or
 * null, indistinguishable to a caller who doesn't already know the
 * account's state) regardless of whether the email exists, is inactive,
 * or the token was actually issued — the calling route must show the same
 * "if that email has an account, a reset link was sent" message either
 * way, so this endpoint can't be used to enumerate which emails have
 * accounts. Never throws for "no such user" — that would leak the answer
 * through response timing/shape at the call site.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await forPlatform().user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    await logAudit({
      action: AUDIT_ACTIONS.userPasswordResetRequested,
      resourceType: "user",
      result: "DENIED",
      metadata: { email, reason: !user ? "no_such_user" : "inactive" },
    });
    return null;
  }

  const raw = generateRawToken();
  await forPlatform().accountToken.create({
    data: {
      userId: user.id,
      institutionId: user.institutionId,
      type: "PASSWORD_RESET",
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + RESET_EXPIRY_MS),
    } as never,
  });

  await logAudit({
    institutionId: user.institutionId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.userPasswordResetRequested,
    resourceType: "user",
    resourceId: user.id,
    result: "SUCCESS",
  });

  return raw;
}

export interface AccountTokenInfo {
  type: AccountTokenType;
  userName: string;
  userEmail: string;
}

/**
 * Read-only lookup for the token-landing page to decide what to render
 * ("Set up your account" vs "Reset your password") and to reject an
 * expired/used/nonexistent token before showing a form at all, rather than
 * only failing once the visitor submits it.
 */
export async function getAccountTokenInfo(rawToken: string): Promise<AccountTokenInfo> {
  const record = await forPlatform().accountToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new InvalidTokenError();
  }

  return { type: record.type, userName: record.user.name, userEmail: record.user.email };
}

/**
 * Redeems a token: sets the new password and marks the token used, in one
 * transaction so a token can never be partially consumed (used up with no
 * password change, or reused after a crash mid-way). Also stamps
 * sessionsValidAfter — same reasoning as resetUserPassword() in users.ts:
 * if this is a reset because a password leaked, any session issued before
 * the reset must stop working immediately.
 */
export async function consumeAccountToken(rawToken: string, newPassword: string): Promise<AccountTokenInfo> {
  const tokenHash = hashToken(rawToken);
  const record = await forPlatform().accountToken.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new InvalidTokenError();
  }

  const passwordHash = await hashPassword(newPassword);

  await forPlatform().$transaction([
    forPlatform().user.update({
      where: { id: record.userId },
      data: { passwordHash, sessionsValidAfter: new Date() },
    }),
    forPlatform().accountToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await logAudit({
    institutionId: record.institutionId,
    actorUserId: record.userId,
    action: record.type === "INVITE" ? AUDIT_ACTIONS.userInviteAccepted : AUDIT_ACTIONS.userPasswordResetCompleted,
    resourceType: "user",
    resourceId: record.userId,
    result: "SUCCESS",
  });

  return { type: record.type, userName: record.user.name, userEmail: record.user.email };
}
