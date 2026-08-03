import { BOSS_BULLET_SPEED_SCALE, DIFFICULTY_TIME_SCALE, ENEMY_BULLET_SPEED_SCALE, ENEMY_CONFIG, ENEMY_FIRE_INTERVAL_SCALE, ENEMY_MOVE_SPEED_SCALE, ENEMY_SPAWN_INTERVAL_SCALE, GAME_HEIGHT, GAME_WIDTH, LATE_DIFFICULTY_ACCELERATION, LATE_DIFFICULTY_START_SECONDS, MAIN_BOSS_DIFFICULTY, MAIN_BOSS_SHOT_COUNT, MAX_UPGRADE_LEVEL, MINI_BOSS_SHOT_COUNT, PLAYER_BASE_HP, PLAYER_BASE_SPEED, PLAYER_MAX_HP, PLAYER_MAX_Y, PLAYER_MIN_Y, UPGRADES } from "./constants";
import { ObjectPool } from "./pool";
import { renderScene } from "./renderer";
import { loadGameData, saveGameData } from "./storage";
import { normalizeJoystickInput } from "./controls";
import type { Bullet, Enemy, EnemyKind, EngineCallbacks, GameHud, GameResult, GameStatus, HealItem, ItemKind, Particle, Player, SkyPupVisualAssets, Upgrade, UpgradeKind } from "./types";

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distanceSquared = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const difficultyElapsed = (elapsed: number) => (
  elapsed * DIFFICULTY_TIME_SCALE
  + Math.max(0, elapsed - LATE_DIFFICULTY_START_SECONDS) * LATE_DIFFICULTY_ACCELERATION
);
const createUpgradeLevels = (): Record<UpgradeKind, number> => ({
  fireRate: 0,
  extraShot: 0,
  piercing: 0,
  damage: 0,
  moveSpeed: 0,
  maxHp: 0,
  specialCharge: 0
});

export class SkyPupEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: EngineCallbacks;
  private visualAssets: SkyPupVisualAssets = {};
  private readonly bullets = new ObjectPool<Bullet>(240, () => ({ active: false, friendly: true, x: 0, y: 0, vx: 0, vy: 0, radius: 4, damage: 1, life: 0, pierce: 0, color: "#fff" }));
  private readonly enemies = new ObjectPool<Enemy>(72, () => ({ active: false, kind: "normal", x: 0, y: 0, vx: 0, vy: 0, radius: 16, hp: 1, maxHp: 1, score: 100, fireTimer: 1, age: 0, phase: 0, flash: 0 }));
  private readonly items = new ObjectPool<HealItem>(8, () => ({ active: false, kind: "apple", x: 0, y: 0, vx: -35, age: 0, radius: 18 }));
  private readonly particles = new ObjectPool<Particle>(260, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 2, color: "#fff" }));
  private readonly unlocked = new Set<string>();
  private player: Player = this.createPlayer();
  private status: GameStatus = "idle";
  private frame = 0;
  private lastTime = 0;
  private elapsed = 0;
  private score = 0;
  private kills = 0;
  private bossKills = 0;
  private level = 1;
  private xp = 0;
  private xpTarget = 8;
  private combo = 0;
  private comboTimer = 0;
  private spawnTimer = 0.5;
  private fireTimer = 0;
  private healTimer = 32 + Math.random() * 8;
  private nextMiniBoss = 90;
  private nextMainBoss = 300;
  private special = 0;
  private specialFreeze = 0;
  private specialFlash = 0;
  private shake = 0;
  private lastHudAt = 0;
  private damageTaken = 0;
  private storedBest = 0;
  private moveX = 0;
  private moveY = 0;
  private upgradeLevels = createUpgradeLevels();
  private reducedMotion = false;

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    const stored = loadGameData();
    this.storedBest = stored.bestScore;
    stored.achievements.forEach((id) => this.unlocked.add(id));
    this.emitHud();
    this.draw();
  }

  start() {
    cancelAnimationFrame(this.frame);
    this.bullets.clear(); this.enemies.clear(); this.items.clear(); this.particles.clear();
    this.player = this.createPlayer();
    this.player.invulnerableUntil = performance.now() + 2000;
    this.status = "running"; this.elapsed = 0; this.score = 0; this.kills = 0; this.bossKills = 0;
    this.level = 1; this.xp = 0; this.xpTarget = 8; this.combo = 0; this.comboTimer = 0;
    this.spawnTimer = 0.9; this.fireTimer = 0; this.healTimer = 30 + Math.random() * 10;
    this.nextMiniBoss = 90; this.nextMainBoss = 300; this.special = 0; this.specialFreeze = 0;
    this.specialFlash = 0; this.shake = 0; this.damageTaken = 0; this.lastTime = performance.now(); this.lastHudAt = 0;
    this.moveX = 0; this.moveY = 0;
    this.upgradeLevels = createUpgradeLevels();
    this.emitHud(); this.frame = requestAnimationFrame(this.tick);
  }

  pause() {
    if (this.status !== "running") return;
    this.status = "paused"; cancelAnimationFrame(this.frame); this.emitHud(); this.draw();
  }

  resume() {
    if (this.status !== "paused") return;
    this.status = "running"; this.lastTime = performance.now(); this.emitHud(); this.frame = requestAnimationFrame(this.tick);
  }

  destroy() { cancelAnimationFrame(this.frame); }
  getStatus() { return this.status; }

  setVisualAssets(assets: SkyPupVisualAssets) {
    this.visualAssets = assets;
    this.draw();
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    this.draw();
  }

  setTarget(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.player.targetX = clamp((clientX - rect.left) * (GAME_WIDTH / rect.width), 34, GAME_WIDTH - 34);
    this.player.targetY = clamp((clientY - rect.top) * (GAME_HEIGHT / rect.height), PLAYER_MIN_Y, PLAYER_MAX_Y);
  }

  setJoystick(x: number, y: number) {
    const normalized = normalizeJoystickInput(x, y);
    this.moveX = normalized.x;
    this.moveY = normalized.y;
  }

  releaseJoystick() {
    this.moveX = 0; this.moveY = 0;
    this.player.targetX = this.player.x; this.player.targetY = this.player.y;
  }

  useSpecial() {
    if (this.status !== "running" || this.special < 100) return false;
    this.special = 0; this.specialFreeze = 5; this.specialFlash = 1; this.player.invulnerableUntil = performance.now() + 5000;
    this.bullets.active().forEach((bullet) => { if (!bullet.friendly) bullet.active = false; });
    this.enemies.active().forEach((enemy) => {
      if (enemy.kind !== "miniBoss" && enemy.kind !== "mainBoss") this.defeatEnemy(enemy, true);
      else enemy.hp -= Math.max(10, enemy.maxHp * 0.12);
    });
    this.burst(this.player.x, this.player.y, 40, "#fff5b8");
    this.shake = 14; this.callbacks.onSound("special"); this.emitHud(); return true;
  }

  applyUpgrade(kind: UpgradeKind) {
    if (this.status !== "levelup") return;
    if (this.upgradeLevels[kind] >= MAX_UPGRADE_LEVEL) return;
    if (kind === "fireRate") this.player.fireRate *= 0.82;
    if (kind === "extraShot") this.player.shotCount = Math.min(3, this.player.shotCount + 1);
    if (kind === "piercing") this.player.piercing += 1;
    if (kind === "damage") this.player.damage += 1;
    if (kind === "moveSpeed") this.player.speed *= 1.15;
    if (kind === "maxHp") { this.player.maxHp = Math.min(PLAYER_MAX_HP, this.player.maxHp + 1); this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1); }
    if (kind === "specialCharge") this.player.specialChargeRate *= 1.25;
    this.upgradeLevels[kind] += 1;
    this.player.invulnerableUntil = performance.now() + 1000;
    this.status = "running"; this.lastTime = performance.now(); this.callbacks.onSound("levelup"); this.emitHud(); this.frame = requestAnimationFrame(this.tick);
  }

  private createPlayer(): Player {
    return { x: GAME_WIDTH / 2, y: 500, targetX: GAME_WIDTH / 2, targetY: 500, radius: 21, hp: PLAYER_BASE_HP, maxHp: PLAYER_BASE_HP, invulnerableUntil: 0, speed: PLAYER_BASE_SPEED, fireRate: 0.31, damage: 1, shotCount: 1, piercing: 0, specialChargeRate: 1 };
  }

  private tick = (now: number) => {
    if (this.status !== "running") return;
    const delta = Math.min(0.034, (now - this.lastTime) / 1000 || 0);
    this.lastTime = now; this.elapsed += delta;
    this.updatePlayer(delta); this.updateSpawning(delta); this.updateBullets(delta); this.updateEnemies(delta); this.updateItems(delta); this.updateParticles(delta);
    this.comboTimer -= delta; if (this.comboTimer <= 0) this.combo = 0;
    this.specialFreeze = Math.max(0, this.specialFreeze - delta); this.specialFlash = Math.max(0, this.specialFlash - delta * 1.8); this.shake = Math.max(0, this.shake - delta * 30);
    if (this.elapsed >= 60 && this.damageTaken === 0) this.unlock("noDamage");
    if (now - this.lastHudAt > 90) { this.lastHudAt = now; this.emitHud(); }
    this.draw(); this.frame = requestAnimationFrame(this.tick);
  };

  private updatePlayer(delta: number) {
    if (Math.abs(this.moveX) > 0.01 || Math.abs(this.moveY) > 0.01) {
      this.player.x = clamp(this.player.x + this.moveX * this.player.speed * delta, 30, GAME_WIDTH - 30);
      this.player.y = clamp(this.player.y + this.moveY * this.player.speed * delta, PLAYER_MIN_Y, PLAYER_MAX_Y);
      this.player.targetX = this.player.x; this.player.targetY = this.player.y;
    }
    const dx = this.player.targetX - this.player.x; const dy = this.player.targetY - this.player.y;
    const distance = Math.hypot(dx, dy); const travel = Math.min(distance, this.player.speed * delta);
    if (distance > 0.1) { this.player.x += dx / distance * travel; this.player.y += dy / distance * travel; }
    this.fireTimer -= delta;
    if (this.fireTimer <= 0) { this.firePlayer(); this.fireTimer = this.player.fireRate; }
  }

  private updateSpawning(delta: number) {
    if (this.specialFreeze > 0) return;
    if (this.elapsed >= this.nextMainBoss) { this.spawnEnemy("mainBoss"); this.nextMainBoss += 300; this.callbacks.onSound("boss"); }
    else if (this.elapsed >= this.nextMiniBoss) { this.spawnEnemy("miniBoss"); this.nextMiniBoss += 90; this.callbacks.onSound("boss"); }
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0 && !this.enemies.active().some((enemy) => enemy.kind === "mainBoss")) {
      const scaledElapsed = difficultyElapsed(this.elapsed);
      const difficulty = 1 + scaledElapsed / 75;
      const roll = Math.random();
      const kind: EnemyKind = scaledElapsed < 10
        ? "normal"
        : scaledElapsed < 18
          ? (roll > 0.72 ? "fast" : "normal")
          : scaledElapsed < 25
          ? (roll > 0.84 ? "tank" : roll > 0.55 ? "fast" : "normal")
          : roll > 0.89 ? "tank" : roll > 0.7 ? "tracker" : roll > 0.46 ? "fast" : "normal";
      this.spawnEnemy(kind);
      if (scaledElapsed > 120 && Math.random() < 0.18) this.spawnEnemy(Math.random() > 0.5 ? "normal" : "fast");
      this.spawnTimer = Math.max(0.3, 1.08 / difficulty) * (0.82 + Math.random() * 0.35) * ENEMY_SPAWN_INTERVAL_SCALE;
    }
    this.healTimer -= delta;
    if (this.healTimer <= 0) { this.spawnItem(); this.healTimer = 30 + Math.random() * 10; }
  }

  private spawnEnemy(kind: EnemyKind) {
    const enemy = this.enemies.acquire(); if (!enemy) return;
    const config = ENEMY_CONFIG[kind];
    const difficulty = kind === "mainBoss" ? MAIN_BOSS_DIFFICULTY : 1 + difficultyElapsed(this.elapsed) / 170;
    let spawnX = 48 + Math.random() * (GAME_WIDTH - 96);
    if (this.elapsed < 15 && Math.abs(spawnX - this.player.x) < 70) spawnX = this.player.x < GAME_WIDTH / 2 ? GAME_WIDTH - 58 : 58;
    Object.assign(enemy, { kind, x: spawnX, y: -config.radius - Math.random() * 25, vx: 0, vy: config.speed * difficulty * ENEMY_MOVE_SPEED_SCALE, radius: config.radius, hp: Math.ceil(config.hp * (kind.includes("Boss") ? difficulty : 1)), maxHp: Math.ceil(config.hp * (kind.includes("Boss") ? difficulty : 1)), score: config.score, fireTimer: 0.5 + Math.random() * config.fire, age: 0, phase: Math.random() * TAU, flash: 0 });
    if (kind === "miniBoss" || kind === "mainBoss") enemy.x = GAME_WIDTH / 2;
  }

  private updateEnemies(delta: number) {
    const scaledElapsed = difficultyElapsed(this.elapsed);
    const difficulty = 1 + scaledElapsed / 120;
    for (const enemy of this.enemies.active()) {
      enemy.age += delta; enemy.flash = Math.max(0, enemy.flash - delta * 8); enemy.fireTimer -= delta;
      if (enemy.kind === "tracker") {
        const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        enemy.vx += Math.cos(angle) * 70 * delta; enemy.vx = clamp(enemy.vx, -65, 65);
      } else if (enemy.kind === "fast") enemy.vx = Math.sin(enemy.age * 5 + enemy.phase) * 72;
      else if (enemy.kind === "normal") enemy.vx = Math.sin(enemy.age * 2.3 + enemy.phase) * 28;
      else if (enemy.kind === "tank") enemy.vx = Math.sin(enemy.age * 1.5 + enemy.phase) * 18;
      else {
        if (enemy.y < 105) enemy.vy = 45;
        else { enemy.vy = Math.sin(enemy.age * 1.2) * 12; enemy.vx = Math.sin(enemy.age * 1.7 + enemy.phase) * 48; }
      }
      enemy.x = clamp(enemy.x + enemy.vx * delta, enemy.radius + 8, GAME_WIDTH - enemy.radius - 8); enemy.y += enemy.vy * delta;
      if (enemy.fireTimer <= 0) {
        const attackDifficulty = enemy.kind === "mainBoss" ? MAIN_BOSS_DIFFICULTY : difficulty;
        if (scaledElapsed > 12) this.fireEnemy(enemy, attackDifficulty);
        enemy.fireTimer = scaledElapsed > 12
          ? ENEMY_CONFIG[enemy.kind].fire / attackDifficulty * (0.9 + Math.random() * 0.42) * ENEMY_FIRE_INTERVAL_SCALE
          : 0.35 + Math.random() * 0.3;
      }
      if (enemy.y > GAME_HEIGHT + enemy.radius * 2) enemy.active = false;
      if (distanceSquared(enemy.x, enemy.y, this.player.x, this.player.y) < (enemy.radius + this.player.radius - 5) ** 2) {
        this.damagePlayer();
        if (enemy.kind === "miniBoss" || enemy.kind === "mainBoss") enemy.y -= 48;
        else enemy.active = false;
      }
    }
  }

  private updateBullets(delta: number) {
    for (const bullet of this.bullets.active()) {
      bullet.x += bullet.vx * delta; bullet.y += bullet.vy * delta; bullet.life -= delta;
      if (bullet.life <= 0 || bullet.x < -30 || bullet.x > GAME_WIDTH + 30 || bullet.y < -30 || bullet.y > GAME_HEIGHT + 30) { bullet.active = false; continue; }
      if (bullet.friendly) {
        for (const enemy of this.enemies.active()) {
          if (!bullet.active) break;
          if (distanceSquared(bullet.x, bullet.y, enemy.x, enemy.y) < (bullet.radius + enemy.radius) ** 2) {
            enemy.hp -= bullet.damage; enemy.flash = 1; this.callbacks.onSound("hit");
            if (enemy.hp <= 0) this.defeatEnemy(enemy, false);
            if (bullet.pierce > 0) bullet.pierce -= 1; else bullet.active = false;
          }
        }
      } else if (distanceSquared(bullet.x, bullet.y, this.player.x, this.player.y) < (bullet.radius + this.player.radius - 5) ** 2) {
        bullet.active = false; this.damagePlayer();
      }
    }
  }

  private updateItems(delta: number) {
    for (const item of this.items.active()) {
      item.age += delta; item.x += item.vx * delta;
      if (item.x < -30) item.active = false;
      else if (distanceSquared(item.x, item.y, this.player.x, this.player.y) < (item.radius + this.player.radius) ** 2) {
        item.active = false; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1); this.score += 250; this.burst(item.x, item.y, 18, "#fff3a3"); this.callbacks.onSound("heal"); this.emitHud();
      }
    }
  }

  private updateParticles(delta: number) {
    for (const particle of this.particles.active()) {
      particle.life -= delta; if (particle.life <= 0) { particle.active = false; continue; }
      particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.vy += 22 * delta;
    }
  }

  private firePlayer() {
    const shots = this.player.shotCount; const spread = 0.12;
    for (let i = 0; i < shots; i += 1) {
      const bullet = this.bullets.acquire(); if (!bullet) break;
      const angle = -Math.PI / 2 + (i - (shots - 1) / 2) * spread;
      Object.assign(bullet, { friendly: true, x: this.player.x, y: this.player.y - 25, vx: Math.cos(angle) * 360, vy: Math.sin(angle) * 360, radius: 4.5, damage: this.player.damage, life: 1.8, pierce: this.player.piercing, color: "#ffe66e" });
    }
    this.callbacks.onSound("shoot");
  }

  private fireEnemy(enemy: Enemy, difficulty: number) {
    const boss = enemy.kind === "miniBoss" || enemy.kind === "mainBoss";
    const baseAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    const count = enemy.kind === "miniBoss"
      ? MINI_BOSS_SHOT_COUNT
      : enemy.kind === "mainBoss"
        ? MAIN_BOSS_SHOT_COUNT
        : enemy.kind === "tank" ? 3 : 1;
    for (let i = 0; i < count; i += 1) {
      const spread = count === 1 ? 0 : (i - (count - 1) / 2) * 0.18;
      this.spawnEnemyBullet(enemy, baseAngle + spread, (enemy.kind === "fast" ? 190 : boss ? 145 : 125) * difficulty, boss ? 6 : 5);
    }
  }

  private spawnEnemyBullet(enemy: Enemy, angle: number, speed: number, radius: number) {
    const bullet = this.bullets.acquire(); if (!bullet) return;
    const bossSpeedScale = enemy.kind === "miniBoss" || enemy.kind === "mainBoss" ? BOSS_BULLET_SPEED_SCALE : 1;
    Object.assign(bullet, { friendly: false, x: enemy.x - enemy.radius * 0.65, y: enemy.y, vx: Math.cos(angle) * speed * ENEMY_BULLET_SPEED_SCALE * bossSpeedScale, vy: Math.sin(angle) * speed * ENEMY_BULLET_SPEED_SCALE * bossSpeedScale, radius, damage: 1, life: 5, pierce: 0, color: enemy.kind.includes("Boss") ? "#ff5f8f" : "#69a7ff" });
  }

  private defeatEnemy(enemy: Enemy, fromSpecial: boolean) {
    if (!enemy.active) return;
    enemy.active = false; this.kills += 1; this.combo += 1; this.comboTimer = 2.4;
    const multiplier = this.combo >= 50 ? 4 : this.combo >= 20 ? 3 : this.combo >= 10 ? 2 : this.combo >= 5 ? 1.5 : 1;
    this.score += Math.round(enemy.score * multiplier);
    if (!fromSpecial) this.special = clamp(this.special + 6.5 * this.player.specialChargeRate, 0, 100);
    this.xp += enemy.kind === "miniBoss" ? 10 : enemy.kind === "mainBoss" ? 20 : 1;
    if (enemy.kind === "miniBoss" || enemy.kind === "mainBoss") { this.bossKills += 1; this.unlock("bossKill"); }
    if (this.kills >= 100) this.unlock("kills100"); if (this.kills >= 500) this.unlock("kills500"); if (this.kills >= 1000) this.unlock("kills1000");
    this.burst(enemy.x, enemy.y, enemy.kind.includes("Boss") ? 42 : 13, enemy.kind.includes("Boss") ? "#ffd166" : "#7be0ff");
    this.shake = enemy.kind.includes("Boss") ? 12 : 3; this.callbacks.onSound("explode");
    if (this.xp >= this.xpTarget && this.status === "running") this.openLevelUp();
  }

  private openLevelUp() {
    this.xp -= this.xpTarget; this.level += 1; this.xpTarget = Math.ceil(this.xpTarget * 1.28 + 2);
    this.status = "levelup"; cancelAnimationFrame(this.frame);
    const extraShot = UPGRADES.find((upgrade) => upgrade.kind === "extraShot");
    const regularUpgrades = UPGRADES.filter((upgrade) => (
      upgrade.kind !== "extraShot" && this.upgradeLevels[upgrade.kind] < MAX_UPGRADE_LEVEL
    )).sort(() => Math.random() - 0.5);
    const canLearnExtraShot = this.level % 5 === 0
      && this.player.shotCount < 3
      && this.upgradeLevels.extraShot < MAX_UPGRADE_LEVEL
      && extraShot;
    const choices = canLearnExtraShot
      ? [extraShot, ...regularUpgrades.slice(0, 2)].sort(() => Math.random() - 0.5)
      : regularUpgrades.slice(0, 3);
    if (!choices.length) {
      this.status = "running"; this.lastTime = performance.now(); this.emitHud(); this.frame = requestAnimationFrame(this.tick);
      return;
    }
    const leveledChoices = choices.map((upgrade) => ({
      ...upgrade,
      title: `${upgrade.title} Lv.${this.upgradeLevels[upgrade.kind] + 1}`
    }));
    this.emitHud(); this.callbacks.onLevelUp(leveledChoices);
  }

  private damagePlayer() {
    const now = performance.now(); if (now < this.player.invulnerableUntil || this.specialFreeze > 0) return;
    this.player.hp -= 1; this.damageTaken += 1; this.player.invulnerableUntil = now + 1000; this.combo = 0; this.shake = 10; this.callbacks.onSound("hit"); this.emitHud();
    if (this.player.hp <= 0) this.finishGame();
  }

  private spawnItem() {
    const item = this.items.acquire(); if (!item) return;
    const kinds: ItemKind[] = ["meat", "cookie", "donut", "rice", "apple"];
    Object.assign(item, { kind: kinds[Math.floor(Math.random() * kinds.length)], x: GAME_WIDTH + 30, y: 110 + Math.random() * 420, vx: -42, age: 0, radius: 18 });
  }

  private burst(x: number, y: number, count: number, color: string) {
    for (let i = 0; i < count; i += 1) {
      const particle = this.particles.acquire(); if (!particle) break;
      const angle = Math.random() * TAU; const speed = 35 + Math.random() * 145; const life = 0.3 + Math.random() * 0.55;
      Object.assign(particle, { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: 1.5 + Math.random() * 4, color });
    }
  }

  private finishGame() {
    if (this.status === "gameover") return;
    this.status = "gameover"; cancelAnimationFrame(this.frame); this.callbacks.onSound("gameover");
    const previousBest = this.storedBest; const finalScore = Math.min(999999, Math.floor(this.score));
    if (finalScore > previousBest) { this.storedBest = finalScore; this.unlock("highScore"); }
    const stored = saveGameData({ bestScore: this.storedBest, achievements: Array.from(this.unlocked) });
    const result: GameResult = { score: finalScore, bestScore: stored.bestScore, duration: Math.floor(this.elapsed), level: this.level, kills: this.kills, bossKills: this.bossKills, achievements: stored.achievements };
    this.emitHud(); this.draw(); this.callbacks.onGameOver(result);
  }

  private unlock(id: string) {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id); saveGameData({ achievements: Array.from(this.unlocked) }); this.callbacks.onAchievements([id]);
  }

  private emitHud() {
    const boss = this.enemies.active().find((enemy) => enemy.kind === "mainBoss" || enemy.kind === "miniBoss");
    const hud: GameHud = { status: this.status, score: Math.floor(this.score), bestScore: this.storedBest, hp: this.player.hp, maxHp: this.player.maxHp, special: Math.floor(this.special), elapsed: Math.floor(this.elapsed), level: this.level, combo: this.combo, kills: this.kills, bossName: boss ? (boss.kind === "mainBoss" ? "메인보스" : "미니보스") : "", bossHp: boss?.hp ?? 0, bossMaxHp: boss?.maxHp ?? 0 };
    this.callbacks.onHud(hud);
  }

  private draw() {
    renderScene(this.canvas, { player: this.player, bullets: this.bullets.active(), enemies: this.enemies.active(), items: this.items.active(), particles: this.particles.active(), elapsed: this.elapsed, specialFlash: this.specialFlash, shake: this.shake, reducedMotion: this.reducedMotion }, this.visualAssets);
  }
}

export function formatPlayTime(seconds: number) {
  const minutes = Math.floor(seconds / 60); const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function upgradeTitle(upgrade: Upgrade) { return upgrade.title; }
