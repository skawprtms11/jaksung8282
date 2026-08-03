import { describe, expect, it } from "vitest";
import {
  BOSS_BULLET_SPEED_SCALE,
  ENEMY_CONFIG,
  MAIN_BOSS_SHOT_COUNT,
  MINI_BOSS_SHOT_COUNT,
  MAX_UPGRADE_LEVEL
} from "../src/components/game/sky-pup/constants";

describe("sky pup balance", () => {
  it("caps every upgrade at level 3", () => {
    expect(MAX_UPGRADE_LEVEL).toBe(3);
  });

  it("keeps the main boss near the mini boss base difficulty", () => {
    expect(ENEMY_CONFIG.mainBoss.hp).toBe(ENEMY_CONFIG.miniBoss.hp);
    expect(ENEMY_CONFIG.mainBoss.fire).toBe(ENEMY_CONFIG.miniBoss.fire);
  });

  it("limits boss volleys to one mini-boss shot and three main-boss shots", () => {
    expect(MINI_BOSS_SHOT_COUNT).toBe(1);
    expect(MAIN_BOSS_SHOT_COUNT).toBe(3);
  });

  it("slows boss bullets by 30 percent", () => {
    expect(BOSS_BULLET_SPEED_SCALE).toBe(0.7);
  });
});
