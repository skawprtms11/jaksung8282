export type GameStatus = "idle" | "running" | "paused" | "levelup" | "gameover";
export type EnemyKind = "normal" | "fast" | "tank" | "tracker" | "miniBoss" | "mainBoss";
export type ItemKind = "meat" | "cookie" | "donut" | "rice" | "apple";
export type UpgradeKind = "fireRate" | "extraShot" | "piercing" | "damage" | "moveSpeed" | "maxHp" | "specialCharge";

export type Player = {
  x: number; y: number; targetX: number; targetY: number; radius: number;
  hp: number; maxHp: number; invulnerableUntil: number; speed: number;
  fireRate: number; damage: number; shotCount: number; piercing: number; specialChargeRate: number;
};

export type Bullet = {
  active: boolean; friendly: boolean; x: number; y: number; vx: number; vy: number;
  radius: number; damage: number; life: number; pierce: number; color: string;
};

export type Enemy = {
  active: boolean; kind: EnemyKind; x: number; y: number; vx: number; vy: number;
  radius: number; hp: number; maxHp: number; score: number; fireTimer: number;
  age: number; phase: number; flash: number;
};

export type HealItem = { active: boolean; kind: ItemKind; x: number; y: number; vx: number; age: number; radius: number };
export type Particle = { active: boolean; x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; color: string };

export type GameHud = {
  status: GameStatus; score: number; bestScore: number; hp: number; maxHp: number;
  special: number; elapsed: number; level: number; combo: number; kills: number;
  bossName: string; bossHp: number; bossMaxHp: number;
};

export type GameResult = {
  score: number; bestScore: number; duration: number; level: number;
  kills: number; bossKills: number; achievements: string[];
};

export type SkyPupVisualAssets = {
  background?: HTMLImageElement;
  player?: HTMLImageElement;
};

export type Upgrade = { kind: UpgradeKind; title: string; description: string };

export type EngineCallbacks = {
  onHud: (hud: GameHud) => void;
  onGameOver: (result: GameResult) => void;
  onLevelUp: (options: Upgrade[]) => void;
  onAchievements: (ids: string[]) => void;
  onSound: (name: SoundName) => void;
};

export type SoundName = "shoot" | "hit" | "explode" | "heal" | "boss" | "special" | "gameover" | "levelup";
