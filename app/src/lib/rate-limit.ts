import { forPlatform } from "./tenant-db";

/**
 * DB-backed fixed-window rate limiter, keyed per-email (see auth.ts's
 * `login:${email}` key). Originally an in-memory Map — replaced because
 * this app now runs on Vercel's serverless infrastructure, where each
 * request can land on a different, ephemeral instance with its own
 * process memory. An in-memory counter under that model doesn't actually
 * limit anything: an attacker's requests get spread across instances that
 * don't share state, so most attempts never see a full bucket. See
 * docs/DISASTER_RECOVERY.md for the wider context this was found under.
 *
 * IP-based throttling (defense against spraying many accounts from one
 * source) still isn't implemented — same scope note as before, unchanged
 * by this rewrite.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function checkRateLimit(emailKey: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  const recentAttempts = await forPlatform().loginAttempt.findMany({
    where: { emailKey, occurredAt: { gte: windowStart } },
    orderBy: { occurredAt: "asc" },
  });

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    const oldest = recentAttempts[0];
    const retryAfterSeconds = Math.max(0, Math.ceil((oldest.occurredAt.getTime() + WINDOW_MS - Date.now()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  await forPlatform().loginAttempt.create({ data: { emailKey } });
  return { allowed: true };
}

/** Call on a successful login so a legitimate user isn't punished by earlier failed attempts. */
export async function resetRateLimit(emailKey: string): Promise<void> {
  await forPlatform().loginAttempt.deleteMany({ where: { emailKey } });
}
