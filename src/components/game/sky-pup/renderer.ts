import { GAME_HEIGHT, GAME_WIDTH } from "./constants";
import type { Bullet, Enemy, HealItem, Particle, Player } from "./types";

const TAU = Math.PI * 2;

type Scene = {
  player: Player; bullets: Bullet[]; enemies: Enemy[]; items: HealItem[]; particles: Particle[];
  elapsed: number; specialFlash: number; shake: number;
};

export function renderScene(canvas: HTMLCanvasElement, scene: Scene) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  if (scene.shake > 0) ctx.translate((Math.random() - 0.5) * scene.shake, (Math.random() - 0.5) * scene.shake);
  drawBackground(ctx, scene.elapsed);
  scene.items.forEach((item) => drawItem(ctx, item));
  scene.bullets.forEach((bullet) => drawBullet(ctx, bullet));
  scene.enemies.forEach((enemy) => drawEnemy(ctx, enemy));
  scene.particles.forEach((particle) => drawParticle(ctx, particle));
  drawDog(ctx, scene.player, scene.elapsed);
  if (scene.specialFlash > 0) {
    ctx.fillStyle = `rgba(255,247,168,${scene.specialFlash * 0.48})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.strokeStyle = `rgba(255,255,255,${scene.specialFlash})`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(scene.player.x, scene.player.y, 36 + (1 - scene.specialFlash) * 410, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, elapsed: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  sky.addColorStop(0, "#8ed8ff");
  sky.addColorStop(0.62, "#dff5ff");
  sky.addColorStop(1, "#f8fdff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,.82)";
  for (let i = 0; i < 5; i += 1) {
    const x = 20 + (i * 91) % 390;
    const y = ((i * 138 + elapsed * (12 + i)) % 760) - 100;
    cloud(ctx, x, y, 0.7 + (i % 2) * 0.22);
  }

  const horizon = 472;
  ctx.fillStyle = "#a7dc8b";
  ctx.beginPath();
  ctx.moveTo(0, horizon + 18);
  for (let x = 0; x <= GAME_WIDTH; x += 24) ctx.lineTo(x, horizon + Math.sin(x * 0.035) * 13);
  ctx.lineTo(GAME_WIDTH, GAME_HEIGHT); ctx.lineTo(0, GAME_HEIGHT); ctx.fill();
  ctx.fillStyle = "#78c76d";
  ctx.fillRect(0, 530, GAME_WIDTH, 90);

  for (let i = 0; i < 4; i += 1) {
    const x = i * 120 - 35;
    drawHouse(ctx, x, 444 + (i % 2) * 15, i % 2 === 0 ? "#ffcf72" : "#f7a9b8");
  }
  for (let i = 0; i < 7; i += 1) {
    const x = i * 68 - 28;
    drawTree(ctx, x, 492 + (i % 2) * 12);
  }
  ctx.fillStyle = "rgba(255,255,255,.34)";
  ctx.fillRect(0, 574, GAME_WIDTH, 8);
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.beginPath();
  ctx.arc(18, 14, 15, 0, Math.PI * 2); ctx.arc(38, 5, 22, 0, Math.PI * 2);
  ctx.arc(63, 14, 17, 0, Math.PI * 2); ctx.roundRect(12, 10, 62, 24, 12); ctx.fill(); ctx.restore();
}

function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.fillRect(x, y, 68, 54);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.lineTo(x + 34, y - 30); ctx.lineTo(x + 74, y + 2); ctx.fill();
  ctx.fillStyle = "#8ac3dc"; ctx.fillRect(x + 10, y + 14, 15, 16); ctx.fillStyle = "#d98a75"; ctx.fillRect(x + 43, y + 20, 15, 34);
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#9a684f"; ctx.fillRect(x + 18, y + 20, 8, 32);
  ctx.fillStyle = "#72c36a"; ctx.beginPath(); ctx.arc(x + 22, y + 14, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.beginPath(); ctx.arc(x + 14, y + 6, 8, 0, Math.PI * 2); ctx.fill();
}

function drawDog(ctx: CanvasRenderingContext2D, player: Player, elapsed: number) {
  const bob = Math.sin(elapsed * 9) * 2.5;
  ctx.save(); ctx.translate(player.x, player.y + bob);
  if (player.invulnerableUntil > performance.now() && Math.floor(performance.now() / 80) % 2 === 0) ctx.globalAlpha = 0.35;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.fillStyle = "rgba(63,102,166,.14)";
  ctx.beginPath(); ctx.ellipse(0, 31, 28, 9, 0, 0, TAU); ctx.fill();

  const cape = ctx.createLinearGradient(0, 3, 0, 52);
  cape.addColorStop(0, "#ff7894");
  cape.addColorStop(1, "#ff4f76");
  ctx.fillStyle = cape;
  ctx.strokeStyle = "#d94568";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-16, -1);
  ctx.quadraticCurveTo(-30, 25, -22, 50);
  ctx.quadraticCurveTo(-9, 41, 0, 48);
  ctx.quadraticCurveTo(11, 41, 23, 50);
  ctx.quadraticCurveTo(30, 24, 16, -1);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.save();
  ctx.shadowColor = "rgba(93,125,160,.22)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fffefb";
  ctx.strokeStyle = "#667b93";
  ctx.lineWidth = 2;

  // Long, pillowy forelegs keep the upward superhero pose readable.
  ctx.beginPath(); ctx.moveTo(-11, -3); ctx.quadraticCurveTo(-16, -22, -22, -42); ctx.strokeStyle = "#667b93"; ctx.lineWidth = 15; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11, -3); ctx.quadraticCurveTo(16, -22, 22, -42); ctx.stroke();
  ctx.strokeStyle = "#fffefb"; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(-11, -3); ctx.quadraticCurveTo(-16, -22, -22, -42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(11, -3); ctx.quadraticCurveTo(16, -22, 22, -42); ctx.stroke();

  ctx.strokeStyle = "#667b93"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(-22, -45, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(22, -45, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#d9b8b6"; ctx.lineWidth = 1.2;
  [-25, -22, -19].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, -49); ctx.lineTo(x + 1, -45); ctx.stroke(); });
  [19, 22, 25].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, -45); ctx.lineTo(x + 1, -49); ctx.stroke(); });

  const body = ctx.createRadialGradient(-7, 0, 2, 0, 8, 31);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(1, "#f4f7fb");
  ctx.fillStyle = body;
  ctx.strokeStyle = "#667b93";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, -5);
  ctx.quadraticCurveTo(-25, 3, -20, 13);
  ctx.quadraticCurveTo(-25, 24, -13, 28);
  ctx.quadraticCurveTo(0, 36, 13, 28);
  ctx.quadraticCurveTo(25, 24, 20, 13);
  ctx.quadraticCurveTo(25, 3, 16, -5);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Small surrounding puffs soften the silhouette without changing collision geometry.
  ctx.fillStyle = "#fffefb";
  [[-18, 5, 7], [18, 5, 7], [-17, 20, 6], [17, 20, 6], [0, 29, 7]].forEach(([x, y, radius]) => {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  });

  ctx.fillStyle = "#ffe7ec";
  ctx.strokeStyle = "#667b93";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(-18, -23, 8, 13, -0.5, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(18, -23, 8, 13, 0.5, 0, TAU); ctx.fill(); ctx.stroke();

  const head = ctx.createRadialGradient(-7, -25, 2, 0, -17, 27);
  head.addColorStop(0, "#ffffff");
  head.addColorStop(1, "#f7f9fc");
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.moveTo(-21, -23);
  ctx.quadraticCurveTo(-25, -14, -19, -7);
  ctx.quadraticCurveTo(-13, 2, 0, 1);
  ctx.quadraticCurveTo(13, 2, 19, -7);
  ctx.quadraticCurveTo(25, -14, 21, -23);
  ctx.quadraticCurveTo(15, -37, 0, -38);
  ctx.quadraticCurveTo(-15, -37, -21, -23);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(255,157,174,.55)";
  ctx.beginPath(); ctx.ellipse(-13, -13, 5.5, 3.2, -0.1, 0, TAU); ctx.ellipse(13, -13, 5.5, 3.2, 0.1, 0, TAU); ctx.fill();
  ctx.fillStyle = "#26384f";
  ctx.beginPath(); ctx.ellipse(-7, -22, 2.5, 3.4, 0, 0, TAU); ctx.ellipse(7, -22, 2.5, 3.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(-6.2, -23.2, 0.8, 0, TAU); ctx.arc(7.8, -23.2, 0.8, 0, TAU); ctx.fill();
  ctx.fillStyle = "#31445c";
  ctx.beginPath(); ctx.ellipse(0, -14, 4.2, 3.2, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#31445c"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.quadraticCurveTo(-3, -7, -7, -9); ctx.moveTo(0, -11); ctx.quadraticCurveTo(3, -7, 7, -9); ctx.stroke();
  ctx.fillStyle = "#ff8faf";
  ctx.beginPath(); ctx.ellipse(0, -7.4, 3.2, 2.2, 0, 0, TAU); ctx.fill();

  ctx.fillStyle = "#ffd85c"; ctx.strokeStyle = "#e5a92e"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-11, 4); ctx.lineTo(0, -4); ctx.lineTo(11, 4); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#fff8d2";
  ctx.beginPath(); ctx.arc(0, 4, 2.2, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy) {
  const boss = enemy.kind === "miniBoss" || enemy.kind === "mainBoss";
  const palette = enemy.kind === "fast" ? ["#ff73a7", "#ffd9e8"] : enemy.kind === "tank" ? ["#7a80a8", "#d7d9ec"] : enemy.kind === "tracker" ? ["#9b73e8", "#e4d8ff"] : boss ? ["#e65a72", "#ffd0d7"] : ["#56b6d9", "#cdefff"];
  ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(Math.sin(enemy.age * 3 + enemy.phase) * 0.08);
  if (enemy.flash > 0) ctx.globalAlpha = 0.55;
  ctx.fillStyle = palette[0]; ctx.strokeStyle = "#40536c"; ctx.lineWidth = boss ? 3 : 2;
  ctx.beginPath(); ctx.roundRect(-enemy.radius, -enemy.radius * 0.72, enemy.radius * 2, enemy.radius * 1.45, enemy.radius * 0.55); ctx.fill(); ctx.stroke();
  ctx.fillStyle = palette[1]; ctx.beginPath(); ctx.arc(0, -2, enemy.radius * 0.48, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#27384f"; ctx.beginPath(); ctx.arc(-enemy.radius * 0.18, -3, boss ? 4 : 2.5, 0, Math.PI * 2); ctx.arc(enemy.radius * 0.18, -3, boss ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff2a6"; ctx.fillRect(-enemy.radius * 0.6, enemy.radius * 0.48, enemy.radius * 1.2, 4);
  if (boss) {
    ctx.fillStyle = "#ffd34f"; ctx.beginPath(); ctx.moveTo(-18, -enemy.radius * 0.78); ctx.lineTo(-8, -enemy.radius - 13); ctx.lineTo(0, -enemy.radius * 0.82); ctx.lineTo(10, -enemy.radius - 14); ctx.lineTo(19, -enemy.radius * 0.76); ctx.fill();
  }
  ctx.restore();
}

function drawBullet(ctx: CanvasRenderingContext2D, bullet: Bullet) {
  ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = bullet.color; ctx.fillStyle = bullet.color;
  ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2); ctx.fill();
  if (bullet.friendly) { ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bullet.x, bullet.y + 12); ctx.lineTo(bullet.x, bullet.y + 3); ctx.stroke(); }
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, item: HealItem) {
  const icons: Record<HealItem["kind"], string> = { meat: "🍖", cookie: "🍪", donut: "🍩", rice: "🍙", apple: "🍎" };
  ctx.save(); ctx.translate(item.x, item.y + Math.sin(item.age * 5) * 4); ctx.rotate(Math.sin(item.age * 2) * 0.12);
  ctx.fillStyle = "rgba(255,255,255,.78)"; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  ctx.font = "25px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(icons[item.kind], 0, 1); ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle) {
  ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife); ctx.fillStyle = particle.color;
  ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
}
