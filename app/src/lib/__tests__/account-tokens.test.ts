import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forPlatform } from "../tenant-db";
import { verifyPassword } from "../password";
import {
  consumeAccountToken,
  createInviteToken,
  getAccountTokenInfo,
  InvalidTokenError,
  requestPasswordReset,
} from "../account-tokens";

describe("account-tokens", () => {
  const runId = Math.random().toString(36).slice(2, 10);
  let institution: { id: string };
  let admin: { id: string; role: "INSTITUTION_ADMIN" };
  let invitedUser: { id: string; email: string };
  let activeUser: { id: string; email: string };
  let inactiveUser: { id: string; email: string };

  beforeAll(async () => {
    const platform = forPlatform();
    institution = await platform.institution.create({
      data: { name: `Token Test ${runId}`, slug: `token-test-${runId}` },
    });
    admin = {
      id: (
        await platform.user.create({
          data: { institutionId: institution.id, email: `token-admin-${runId}@test.local`, name: "Admin", role: "INSTITUTION_ADMIN", passwordHash: "x" },
        })
      ).id,
      role: "INSTITUTION_ADMIN",
    };
    invitedUser = await platform.user.create({
      data: { institutionId: institution.id, email: `token-invited-${runId}@test.local`, name: "Invited", role: "STUDENT", passwordHash: "unusable-placeholder" },
    });
    activeUser = await platform.user.create({
      data: { institutionId: institution.id, email: `token-active-${runId}@test.local`, name: "Active", role: "STUDENT", passwordHash: "x" },
    });
    inactiveUser = await platform.user.create({
      data: { institutionId: institution.id, email: `token-inactive-${runId}@test.local`, name: "Inactive", role: "STUDENT", passwordHash: "x", isActive: false },
    });
  });

  afterAll(async () => {
    const platform = forPlatform();
    await platform.accountToken.deleteMany({ where: { institutionId: institution.id } });
    await platform.user.deleteMany({ where: { institutionId: institution.id } });
    await platform.institution.deleteMany({ where: { id: institution.id } });
  });

  it("invite: full round trip sets the password and marks the token used", async () => {
    const token = await createInviteToken(institution.id, admin, invitedUser.id);

    const info = await getAccountTokenInfo(token);
    expect(info.type).toBe("INVITE");
    expect(info.userEmail).toBe(invitedUser.email);

    const result = await consumeAccountToken(token, "a-real-password-123");
    expect(result.type).toBe("INVITE");

    const updated = await forPlatform().user.findUnique({ where: { id: invitedUser.id } });
    expect(await verifyPassword("a-real-password-123", updated!.passwordHash)).toBe(true);
    expect(updated!.sessionsValidAfter).not.toBeNull();

    // Used tokens are refused a second time.
    await expect(consumeAccountToken(token, "another-password-123")).rejects.toThrow(InvalidTokenError);
  });

  it("password reset: issues a token for an active user and rejects nonexistent/inactive emails without distinguishing them", async () => {
    const forActive = await requestPasswordReset(activeUser.email);
    expect(forActive).not.toBeNull();

    const forNonexistent = await requestPasswordReset(`nobody-${runId}@test.local`);
    expect(forNonexistent).toBeNull();

    const forInactive = await requestPasswordReset(inactiveUser.email);
    expect(forInactive).toBeNull();
  });

  it("password reset token actually changes the password when redeemed", async () => {
    const token = await requestPasswordReset(activeUser.email);
    await consumeAccountToken(token!, "brand-new-password-456");

    const updated = await forPlatform().user.findUnique({ where: { id: activeUser.id } });
    expect(await verifyPassword("brand-new-password-456", updated!.passwordHash)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const raw = "expired-token-fixture";
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await forPlatform().accountToken.create({
      data: {
        userId: invitedUser.id,
        institutionId: institution.id,
        type: "PASSWORD_RESET",
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(getAccountTokenInfo(raw)).rejects.toThrow(InvalidTokenError);
    await expect(consumeAccountToken(raw, "whatever-123")).rejects.toThrow(InvalidTokenError);
  });

  it("rejects a token that doesn't exist at all", async () => {
    await expect(getAccountTokenInfo("not-a-real-token")).rejects.toThrow(InvalidTokenError);
  });
});
