import { describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimit } from "../rate-limit";

describe("rate limiter", () => {
  it("allows up to the configured max attempts, then blocks", async () => {
    const key = `test-key-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect((await checkRateLimit(key)).allowed).toBe(true);
    }
    const blocked = await checkRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", async () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(keyA);
    }
    expect((await checkRateLimit(keyA)).allowed).toBe(false);
    expect((await checkRateLimit(keyB)).allowed).toBe(true);
  });

  it("resetRateLimit clears the counter for a key", async () => {
    const key = `test-key-reset-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      await checkRateLimit(key);
    }
    expect((await checkRateLimit(key)).allowed).toBe(false);
    await resetRateLimit(key);
    expect((await checkRateLimit(key)).allowed).toBe(true);
  });
});
