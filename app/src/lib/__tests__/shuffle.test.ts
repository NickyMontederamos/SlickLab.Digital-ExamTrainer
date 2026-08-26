import { describe, expect, it } from "vitest";
import { seededShuffle } from "../shuffle";

describe("seededShuffle", () => {
  it("is deterministic for the same seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = seededShuffle(items, "attempt-1");
    const b = seededShuffle(items, "attempt-1");
    expect(a).toEqual(b);
  });

  it("differs for different seeds (overwhelmingly likely for 8 items)", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = seededShuffle(items, "attempt-1");
    const b = seededShuffle(items, "attempt-2");
    expect(a).not.toEqual(b);
  });

  it("never drops, duplicates, or adds items", () => {
    const items = ["a", "b", "c", "d", "e"];
    const shuffled = seededShuffle(items, "seed");
    expect([...shuffled].sort()).toEqual([...items].sort());
  });

  it("does not mutate the input array", () => {
    const items = [1, 2, 3, 4];
    const original = [...items];
    seededShuffle(items, "seed");
    expect(items).toEqual(original);
  });
});
