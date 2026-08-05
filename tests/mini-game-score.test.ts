import { describe, expect, it } from "vitest";
import { clampMiniGameScore, MAX_MINI_GAME_SCORE } from "@/lib/game/score";

describe("mini game score", () => {
  it("supports scores up to 9,999,999", () => {
    expect(MAX_MINI_GAME_SCORE).toBe(9_999_999);
    expect(clampMiniGameScore(9_999_999)).toBe(9_999_999);
  });

  it("clamps scores outside the supported range", () => {
    expect(clampMiniGameScore(10_000_000)).toBe(9_999_999);
    expect(clampMiniGameScore(-1)).toBe(0);
  });
});
