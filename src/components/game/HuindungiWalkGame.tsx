"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Bone, Cookie, Medal, Play, RotateCcw, Sparkles } from "lucide-react";
import { saveMiniGameScoreAction } from "@/actions/game";
import { ActionMessage } from "@/components/common/ActionMessage";
import type { ActionResult } from "@/lib/utils/form";

export type MiniGameRanking = {
  id: string;
  userName: string;
  departmentName: string | null;
  score: number;
  durationSeconds: number;
  maxLevel: number;
  snackCount: number;
  createdAt: string;
  isCurrentUser?: boolean;
};

type GameStatus = "idle" | "running" | "gameover";
type EntityType = "bone" | "poop" | "snack";
type Entity = {
  id: number;
  type: EntityType;
  x: number;
  lane: number;
  speed: number;
  width: number;
  height: number;
};
type Hud = {
  status: GameStatus;
  score: number;
  elapsed: number;
  level: number;
  boostRemaining: number;
  snackCount: number;
};
type GameResult = {
  score: number;
  duration_seconds: number;
  max_level: number;
  snack_count: number;
};

const canvasWidth = 900;
const canvasHeight = 540;
const lanes = [185, 285, 385];
const dog = { x: 108, width: 82, height: 78 };

export function HuindungiWalkGame({
  rankings: initialRankings,
  currentUserName,
  setupMessage: initialSetupMessage
}: {
  rankings: MiniGameRanking[];
  currentUserName: string;
  setupMessage?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const statusRef = useRef<GameStatus>("idle");
  const laneRef = useRef(1);
  const entitiesRef = useRef<Entity[]>([]);
  const entityIdRef = useRef(0);
  const lastTimeRef = useRef(0);
  const startTimeRef = useRef(0);
  const spawnTimerRef = useRef(0.8);
  const scoreRef = useRef(0);
  const boostUntilRef = useRef(0);
  const snackCountRef = useRef(0);
  const maxLevelRef = useRef(1);
  const lastHudAtRef = useRef(0);
  const [hud, setHud] = useState<Hud>({
    status: "idle",
    score: 0,
    elapsed: 0,
    level: 1,
    boostRemaining: 0,
    snackCount: 0
  });
  const [result, setResult] = useState<GameResult | null>(null);
  const [saveState, setSaveState] = useState<ActionResult | null>(null);
  const [rankings, setRankings] = useState<MiniGameRanking[]>(initialRankings);
  const [setupMessage, setSetupMessage] = useState(initialSetupMessage ?? "");
  const [isRankingLoading, setIsRankingLoading] = useState(initialRankings.length === 0);
  const [isPending, startTransition] = useTransition();
  const savedResultKeyRef = useRef("");
  const startGameRef = useRef<() => void>(() => undefined);
  startGameRef.current = startGame;

  const loadRankings = useCallback(async () => {
    setIsRankingLoading(true);
    try {
      const response = await fetch("/api/mini-game-rankings");
      if (!response.ok) {
        throw new Error("failed");
      }
      const payload = (await response.json()) as {
        rankings?: MiniGameRanking[];
        setupMessage?: string;
      };
      setRankings(payload.rankings ?? []);
      setSetupMessage(payload.setupMessage ?? "");
    } catch {
      setSetupMessage("랭킹을 불러오지 못했습니다.");
    } finally {
      setIsRankingLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRankings();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRankings]);

  useEffect(() => {
    drawScene(canvasRef.current, hud, laneRef.current, entitiesRef.current);
  }, [hud]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        event.preventDefault();
        moveLane(-1);
      }
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
        event.preventDefault();
        moveLane(1);
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (statusRef.current !== "running") {
          startGameRef.current();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!result) {
      return;
    }
    const key = `${result.score}-${result.duration_seconds}-${result.max_level}-${result.snack_count}`;
    if (savedResultKeyRef.current === key) {
      return;
    }
    savedResultKeyRef.current = key;
    startTransition(async () => {
      const actionResult = await saveMiniGameScoreAction(result);
      setSaveState(actionResult);
      if (actionResult.ok) {
        await loadRankings();
      }
    });
  }, [loadRankings, result]);

  function startGame() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    statusRef.current = "running";
    laneRef.current = 1;
    entitiesRef.current = [];
    entityIdRef.current = 0;
    lastTimeRef.current = performance.now();
    startTimeRef.current = performance.now();
    spawnTimerRef.current = 0.55;
    scoreRef.current = 0;
    boostUntilRef.current = 0;
    snackCountRef.current = 0;
    maxLevelRef.current = 1;
    lastHudAtRef.current = 0;
    setResult(null);
    setSaveState(null);
    setHud({ status: "running", score: 0, elapsed: 0, level: 1, boostRemaining: 0, snackCount: 0 });
    animationRef.current = requestAnimationFrame(tick);
  }

  function moveLane(delta: number) {
    laneRef.current = Math.min(lanes.length - 1, Math.max(0, laneRef.current + delta));
  }

  function tick(now: number) {
    const delta = Math.min(0.034, (now - lastTimeRef.current) / 1000);
    lastTimeRef.current = now;
    const elapsed = (now - startTimeRef.current) / 1000;
    const level = Math.max(1, Math.floor(elapsed / 12) + 1);
    maxLevelRef.current = Math.max(maxLevelRef.current, level);
    const boosted = now < boostUntilRef.current;
    const speedFactor = boosted ? 0.5 : 1;
    scoreRef.current += delta * 12 * (boosted ? 2 : 1);

    spawnTimerRef.current -= delta;
    if (spawnTimerRef.current <= 0) {
      spawnEntity(level);
      spawnTimerRef.current = Math.max(0.42, 1.08 - level * 0.055);
    }

    const dogRect = {
      x: dog.x + 14,
      y: lanes[laneRef.current] - dog.height / 2 + 8,
      width: dog.width - 24,
      height: dog.height - 18
    };
    const nextEntities: Entity[] = [];
    for (const entity of entitiesRef.current) {
      const moved = { ...entity, x: entity.x - entity.speed * speedFactor * delta };
      const entityRect = {
        x: moved.x,
        y: lanes[moved.lane] - moved.height / 2,
        width: moved.width,
        height: moved.height
      };
      if (isColliding(dogRect, entityRect)) {
        if (moved.type === "snack") {
          boostUntilRef.current = now + 6500;
          snackCountRef.current += 1;
          continue;
        }
        finishGame(elapsed);
        return;
      }
      if (moved.x > -80) {
        nextEntities.push(moved);
      }
    }
    entitiesRef.current = nextEntities;

    if (now - lastHudAtRef.current > 90) {
      lastHudAtRef.current = now;
      setHud({
        status: "running",
        score: Math.floor(scoreRef.current),
        elapsed: Math.floor(elapsed),
        level,
        boostRemaining: Math.max(0, Math.ceil((boostUntilRef.current - now) / 1000)),
        snackCount: snackCountRef.current
      });
    }
    drawScene(
      canvasRef.current,
      {
        status: "running",
        score: Math.floor(scoreRef.current),
        elapsed: Math.floor(elapsed),
        level,
        boostRemaining: Math.max(0, Math.ceil((boostUntilRef.current - now) / 1000)),
        snackCount: snackCountRef.current
      },
      laneRef.current,
      entitiesRef.current
    );
    animationRef.current = requestAnimationFrame(tick);
  }

  function spawnEntity(level: number) {
    const random = Math.random();
    const type: EntityType = random > 0.86 ? "snack" : random > 0.48 ? "bone" : "poop";
    const width = type === "poop" ? 42 : type === "snack" ? 44 : 62;
    const height = type === "poop" ? 44 : 38;
    entitiesRef.current.push({
      id: entityIdRef.current++,
      type,
      x: canvasWidth + 20,
      lane: Math.floor(Math.random() * lanes.length),
      speed: 205 + level * 24 + Math.random() * 34,
      width,
      height
    });
  }

  function finishGame(elapsed: number) {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    statusRef.current = "gameover";
    const finalResult = {
      score: Math.floor(scoreRef.current),
      duration_seconds: Math.floor(elapsed),
      max_level: maxLevelRef.current,
      snack_count: snackCountRef.current
    };
    setResult(finalResult);
    setHud({
      status: "gameover",
      score: finalResult.score,
      elapsed: finalResult.duration_seconds,
      level: finalResult.max_level,
      boostRemaining: 0,
      snackCount: finalResult.snack_count
    });
    drawScene(
      canvasRef.current,
      {
        status: "gameover",
        score: finalResult.score,
        elapsed: finalResult.duration_seconds,
        level: finalResult.max_level,
        boostRemaining: 0,
        snackCount: finalResult.snack_count
      },
      laneRef.current,
      entitiesRef.current
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="sketch-panel overflow-hidden p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-[#012241]">흰둥이의 산책</h2>
            <p className="mt-1 text-sm text-slate-500">방향키 또는 버튼으로 위아래 이동하며 장애물을 피하세요.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={startGame} className="tool-button tool-button-primary">
              {hud.status === "running" ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              {hud.status === "running" ? "다시 시작" : "시작"}
            </button>
            <button type="button" onClick={() => moveLane(-1)} className="icon-tool-button" aria-label="위로 이동">
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => moveLane(1)} className="icon-tool-button" aria-label="아래로 이동">
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <HudCard label="점수" value={hud.score.toLocaleString("ko-KR")} />
          <HudCard label="산책시간" value={`${hud.elapsed}s`} />
          <HudCard label="난이도" value={`Lv.${hud.level}`} />
          <HudCard label="간식효과" value={hud.boostRemaining > 0 ? `${hud.boostRemaining}s` : "-"} active={hud.boostRemaining > 0} />
        </div>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="aspect-[5/3] w-full rounded-[1.5rem] border border-[#e4dac9] bg-[#f4ede2] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
        />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <GuideCard icon={<Bone className="h-5 w-5" aria-hidden="true" />} title="장애물" description="뼈다귀와 개똥은 피하세요." />
          <GuideCard icon={<Cookie className="h-5 w-5" aria-hidden="true" />} title="간식" description="속도 절반, 점수 2배가 잠시 적용됩니다." />
          <GuideCard icon={<Sparkles className="h-5 w-5" aria-hidden="true" />} title="난이도" description="시간이 지날수록 속도와 등장 빈도가 올라갑니다." />
        </div>
        <div className="mt-4">
          {isPending ? <p className="rounded-2xl border border-blue-200 bg-blue-50/86 px-4 py-3 text-sm font-semibold text-blue-700">점수를 저장하는 중입니다.</p> : null}
          <ActionMessage state={saveState} />
          {setupMessage ? <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{setupMessage}</p> : null}
        </div>
      </section>

      <aside className="sketch-panel p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e6f1ec] text-[#007050]">
            <Medal className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-black text-[#012241]">산책 랭킹</h2>
            <p className="text-sm text-slate-500">{currentUserName}님의 최고 기록에 도전하세요.</p>
          </div>
        </div>
        {isRankingLoading ? (
          <div className="rounded-[1.25rem] border border-dashed border-[#d3c6b0] bg-white/70 p-6 text-center text-sm font-semibold text-slate-500">
            랭킹을 불러오는 중입니다.
          </div>
        ) : rankings.length === 0 ? (
          <div className="rounded-[1.25rem] border border-dashed border-[#d3c6b0] bg-white/70 p-6 text-center text-sm font-semibold text-slate-500">
            아직 등록된 점수가 없습니다.
          </div>
        ) : (
          <ol className="space-y-2">
            {rankings.map((ranking, index) => (
              <li key={ranking.id} className="rounded-2xl border border-[#e4dac9] bg-white/82 p-3 shadow-[0_12px_26px_rgba(16,34,61,0.05)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[#012241]">
                      <span className="mr-2 text-[#007050]">#{index + 1}</span>
                      {ranking.userName}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {ranking.departmentName ?? "부서 미지정"} · {ranking.durationSeconds}s · Lv.{ranking.maxLevel} · 간식 {ranking.snackCount}
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-black text-[#007050]">{ranking.score.toLocaleString("ko-KR")}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}

function HudCard({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${active ? "border-[#2fae66] bg-emerald-50" : "border-[#e4dac9] bg-white/76"}`}>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${active ? "text-emerald-700" : "text-[#012241]"}`}>{value}</p>
    </div>
  );
}

function GuideCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-[#e4dac9] bg-white/76 p-3">
      <div className="flex items-center gap-2 text-sm font-black text-[#012241]">
        <span className="text-[#007050]">{icon}</span>
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function isColliding(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function drawScene(canvas: HTMLCanvasElement | null, hud: Hud, dogLane: number, entities: Entity[]) {
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  drawVillage(context);
  drawEntities(context, entities);
  drawDog(context, dog.x, lanes[dogLane], hud.status === "running");
  drawOverlay(context, hud);
}

function drawVillage(context: CanvasRenderingContext2D) {
  const skyGradient = context.createLinearGradient(0, 0, 0, canvasHeight);
  skyGradient.addColorStop(0, "#e6f4ee");
  skyGradient.addColorStop(0.46, "#fbf8f2");
  skyGradient.addColorStop(1, "#ece3d4");
  context.fillStyle = skyGradient;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  context.fillStyle = "rgba(255, 209, 102, 0.55)";
  context.beginPath();
  context.arc(790, 62, 34, 0, Math.PI * 2);
  context.fill();
  drawCloud(context, 118, 58, 0.9);
  drawCloud(context, 354, 76, 0.68);
  drawCloud(context, 690, 104, 0.74);

  const hillGradient = context.createLinearGradient(0, 118, 0, 250);
  hillGradient.addColorStop(0, "#cbe7d3");
  hillGradient.addColorStop(1, "#e6f6ed");
  context.fillStyle = hillGradient;
  context.beginPath();
  context.moveTo(0, 182);
  context.quadraticCurveTo(142, 104, 306, 174);
  context.quadraticCurveTo(470, 242, 650, 154);
  context.quadraticCurveTo(794, 92, 900, 166);
  context.lineTo(900, 276);
  context.lineTo(0, 276);
  context.closePath();
  context.fill();

  drawHouse(context, 74, 120, "#ffffff", "#1f9e77");
  drawHouse(context, 206, 112, "#fdf7ea", "#ef7d61");
  drawHouse(context, 612, 118, "#ffffff", "#6fbf9f");
  drawHouse(context, 738, 106, "#fbf8f2", "#7b8ce8");
  drawFence(context, 40, 196, 820);
  drawTree(context, 48, 118);
  drawTree(context, 548, 126);
  drawTree(context, 846, 132);
  drawStreetLamp(context, 438, 118);

  context.fillStyle = "#d3c6b0";
  context.fillRect(0, 430, canvasWidth, 110);
  context.fillStyle = "#ece3d4";
  context.fillRect(0, 452, canvasWidth, 88);

  const pathGradient = context.createLinearGradient(0, 146, 0, 452);
  pathGradient.addColorStop(0, "#ffffff");
  pathGradient.addColorStop(1, "#f4ede2");
  context.fillStyle = pathGradient;
  roundRect(context, 28, 146, 844, 306, 30);
  context.fill();
  context.strokeStyle = "#d8cbb4";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = "rgba(95, 212, 166, 0.18)";
  roundRect(context, 28, 146, 844, 36, 30);
  context.fill();
  context.fillStyle = "rgba(0, 112, 80, 0.06)";
  roundRect(context, 28, 414, 844, 38, 28);
  context.fill();
  context.strokeStyle = "rgba(0, 112, 80,0.16)";
  context.lineWidth = 2;
  for (const lane of lanes) {
    context.beginPath();
    context.setLineDash([16, 16]);
    context.moveTo(46, lane + 42);
    context.lineTo(854, lane + 42);
    context.stroke();
  }
  context.setLineDash([]);
  drawFlowerPatch(context, 108, 452);
  drawFlowerPatch(context, 756, 452);
}

function drawTree(context: CanvasRenderingContext2D, x: number, y: number) {
  context.fillStyle = "#79d6a8";
  context.beginPath();
  context.arc(x, y, 28, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#9bd8b5";
  context.beginPath();
  context.arc(x - 16, y + 6, 18, 0, Math.PI * 2);
  context.arc(x + 15, y + 5, 18, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#9a724a";
  roundRect(context, x - 6, y + 18, 12, 42, 5);
  context.fill();
}

function drawDog(context: CanvasRenderingContext2D, x: number, y: number, running: boolean) {
  const now = performance.now();
  const cycle = running ? now / 145 : 0;
  const bounce = running ? -Math.abs(Math.sin(cycle)) * 18 : 0;
  const squash = running ? 1 - Math.abs(Math.sin(cycle)) * 0.035 : 1;
  const earSwing = running ? Math.sin(cycle) * 0.22 : 0;
  const legSwing = running ? Math.sin(cycle) * 8 : 0;
  const shadowScale = running ? 1 - Math.abs(Math.sin(cycle)) * 0.28 : 1;

  context.save();
  context.fillStyle = "rgba(16,34,61,0.16)";
  context.beginPath();
  context.ellipse(x + 42, y + 58, 42 * shadowScale, 11 * shadowScale, 0, 0, Math.PI * 2);
  context.fill();
  if (running) {
    context.fillStyle = "rgba(0, 112, 80,0.12)";
    context.beginPath();
    context.arc(x - 12, y + 34, 4, 0, Math.PI * 2);
    context.arc(x - 27, y + 48, 3, 0, Math.PI * 2);
    context.arc(x - 40, y + 28, 2.5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  context.save();
  context.translate(x, y + bounce);
  context.scale(1, squash);
  context.shadowColor = "rgba(16,34,61,0.16)";
  context.shadowBlur = 16;
  context.shadowOffsetY = 10;
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#98a5b5";
  context.lineWidth = 4;

  roundRect(context, 10, -28, 56, 70, 26);
  context.fill();
  context.stroke();
  roundRect(context, -2, -64, 84, 58, 30);
  context.fill();
  context.stroke();

  context.save();
  context.translate(4, -57);
  context.rotate(-0.45 + earSwing);
  context.beginPath();
  context.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();

  context.save();
  context.translate(78, -57);
  context.rotate(0.45 - earSwing);
  context.beginPath();
  context.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();

  context.shadowBlur = 0;
  context.fillStyle = "#171717";
  context.beginPath();
  context.arc(24, -41, 3.4, 0, Math.PI * 2);
  context.arc(59, -41, 3.4, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 5;
  context.lineCap = "round";
  context.strokeStyle = "#171717";
  context.beginPath();
  context.moveTo(36, -27);
  context.lineTo(50, -25);
  context.stroke();

  context.strokeStyle = "#2fae66";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(18, -6);
  context.quadraticCurveTo(38, 2, 62, -5);
  context.stroke();

  context.strokeStyle = "#98a5b5";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(60, 0);
  context.quadraticCurveTo(94, -10 + legSwing * 0.18, 82, -30);
  context.stroke();

  context.lineCap = "round";
  context.beginPath();
  context.moveTo(24, 34);
  context.lineTo(17 + legSwing * 0.2, 54);
  context.moveTo(52, 34);
  context.lineTo(59 - legSwing * 0.2, 54);
  context.moveTo(34, 34);
  context.lineTo(30 - legSwing * 0.16, 50);
  context.moveTo(62, 32);
  context.lineTo(67 + legSwing * 0.16, 48);
  context.stroke();
  context.restore();
}

function drawCloud(context: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.fillStyle = "rgba(255,255,255,0.84)";
  context.beginPath();
  context.arc(0, 14, 20, 0, Math.PI * 2);
  context.arc(24, 2, 27, 0, Math.PI * 2);
  context.arc(58, 12, 22, 0, Math.PI * 2);
  context.arc(86, 17, 16, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawHouse(context: CanvasRenderingContext2D, x: number, y: number, wallColor: string, roofColor: string) {
  context.save();
  context.fillStyle = wallColor;
  context.strokeStyle = "rgba(16,34,61,0.14)";
  context.lineWidth = 2;
  roundRect(context, x, y, 78, 60, 8);
  context.fill();
  context.stroke();
  context.fillStyle = roofColor;
  context.beginPath();
  context.moveTo(x - 8, y + 8);
  context.lineTo(x + 39, y - 28);
  context.lineTo(x + 86, y + 8);
  context.closePath();
  context.fill();
  context.fillStyle = "#e6f4ee";
  roundRect(context, x + 13, y + 18, 18, 18, 4);
  context.fill();
  roundRect(context, x + 49, y + 18, 18, 18, 4);
  context.fill();
  context.fillStyle = "#c0b199";
  roundRect(context, x + 32, y + 33, 16, 27, 5);
  context.fill();
  context.restore();
}

function drawFence(context: CanvasRenderingContext2D, x: number, y: number, width: number) {
  context.save();
  context.strokeStyle = "rgba(142, 105, 66, 0.42)";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(x, y + 20);
  context.lineTo(x + width, y + 20);
  context.moveTo(x, y + 42);
  context.lineTo(x + width, y + 42);
  context.stroke();
  context.fillStyle = "rgba(255,255,255,0.78)";
  for (let postX = x; postX <= x + width; postX += 44) {
    roundRect(context, postX, y, 10, 56, 5);
    context.fill();
  }
  context.restore();
}

function drawStreetLamp(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.strokeStyle = "#a99a80";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x, y + 96);
  context.stroke();
  context.fillStyle = "#fff4ba";
  context.strokeStyle = "#7c8a76";
  roundRect(context, x - 16, y - 18, 32, 24, 10);
  context.fill();
  context.stroke();
  context.restore();
}

function drawFlowerPatch(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  for (let i = 0; i < 9; i += 1) {
    const fx = x + i * 13;
    const fy = y + (i % 3) * 8;
    context.strokeStyle = "#62b88d";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(fx, fy);
    context.lineTo(fx, fy - 13);
    context.stroke();
    context.fillStyle = i % 2 === 0 ? "#ff9caf" : "#ffd166";
    context.beginPath();
    context.arc(fx, fy - 16, 4, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawEntities(context: CanvasRenderingContext2D, entities: Entity[]) {
  for (const entity of entities) {
    const y = lanes[entity.lane];
    if (entity.type === "bone") {
      drawBone(context, entity.x, y);
    }
    if (entity.type === "poop") {
      drawPoop(context, entity.x, y);
    }
    if (entity.type === "snack") {
      drawSnack(context, entity.x, y);
    }
  }
}

function drawBone(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "#fff9ed";
  context.strokeStyle = "#a9b3c1";
  context.lineWidth = 3;
  roundRect(context, 10, -9, 44, 18, 9);
  context.fill();
  context.stroke();
  for (const [cx, cy] of [[8, -12], [8, 12], [56, -12], [56, 12]]) {
    context.beginPath();
    context.arc(cx, cy, 12, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawPoop(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "#8b5e3c";
  context.strokeStyle = "#5f3b22";
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(22, 16, 22, 12, 0, 0, Math.PI * 2);
  context.ellipse(22, 2, 16, 11, 0, 0, Math.PI * 2);
  context.ellipse(22, -12, 10, 8, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
}

function drawSnack(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "#ffd166";
  context.strokeStyle = "#d99a20";
  context.lineWidth = 3;
  roundRect(context, 2, -20, 42, 40, 14);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  for (const [cx, cy] of [[14, -8], [29, 0], [16, 10]]) {
    context.beginPath();
    context.arc(cx, cy, 3, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawOverlay(context: CanvasRenderingContext2D, hud: Hud) {
  if (hud.status === "running") {
    return;
  }
  context.save();
  context.fillStyle = "rgba(255,255,255,0.76)";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.textAlign = "center";
  context.fillStyle = "#012241";
  context.font = "900 40px sans-serif";
  context.fillText(hud.status === "idle" ? "흰둥이와 산책을 시작하세요" : "산책 종료", canvasWidth / 2, 230);
  context.font = "700 18px sans-serif";
  context.fillStyle = "#64748b";
  const message = hud.status === "idle" ? "스페이스바 또는 시작 버튼으로 출발합니다." : `점수 ${hud.score.toLocaleString("ko-KR")}점이 랭킹에 저장됩니다.`;
  context.fillText(message, canvasWidth / 2, 268);
  context.restore();
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
