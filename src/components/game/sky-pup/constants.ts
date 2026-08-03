import type { EnemyKind, Upgrade } from "./types";

export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 620;
export const PLAYER_MIN_Y = 82;
export const PLAYER_MAX_Y = 560;
export const PLAYER_BASE_HP = 5;
export const PLAYER_MAX_HP = 8;
export const PLAYER_BASE_SPEED = 360;
export const DIFFICULTY_TIME_SCALE = 0.35;
export const LATE_DIFFICULTY_START_SECONDS = 90;
export const LATE_DIFFICULTY_ACCELERATION = 0.15;
export const ENEMY_SPAWN_INTERVAL_SCALE = 1.25;
export const ENEMY_FIRE_INTERVAL_SCALE = 1.25;
export const ENEMY_MOVE_SPEED_SCALE = 0.85;
export const ENEMY_BULLET_SPEED_SCALE = 0.8;

export const ENEMY_CONFIG: Record<EnemyKind, { hp: number; speed: number; radius: number; score: number; fire: number }> = {
  normal: { hp: 1, speed: 72, radius: 16, score: 100, fire: 2.25 },
  fast: { hp: 2, speed: 128, radius: 14, score: 200, fire: 1.45 },
  tank: { hp: 5, speed: 42, radius: 23, score: 500, fire: 2.8 },
  tracker: { hp: 3, speed: 76, radius: 17, score: 300, fire: 1.9 },
  miniBoss: { hp: 40, speed: 28, radius: 40, score: 5000, fire: 1.05 },
  mainBoss: { hp: 120, speed: 20, radius: 54, score: 10000, fire: 0.68 }
};
export const UPGRADES: Upgrade[] = [
  { kind: "fireRate", title: "번개 발사", description: "공격속도 18% 증가" },
  { kind: "extraShot", title: "별빛 탄환", description: "동시에 발사하는 탄환 +1" },
  { kind: "piercing", title: "관통 꼬리", description: "탄환 관통 횟수 +1" },
  { kind: "damage", title: "용기 충전", description: "공격력 +1" },
  { kind: "moveSpeed", title: "바람 발바닥", description: "이동속도 15% 증가" },
  { kind: "maxHp", title: "든든한 간식", description: "최대 체력과 체력 +1" },
  { kind: "specialCharge", title: "히어로 본능", description: "필살기 충전량 25% 증가" }
];

export const ACHIEVEMENT_LABELS: Record<string, string> = {
  kills100: "적 100마리 처치",
  kills500: "적 500마리 처치",
  kills1000: "적 1,000마리 처치",
  noDamage: "60초 노데미지",
  bossKill: "보스 격파",
  highScore: "최고점수 갱신"
};
