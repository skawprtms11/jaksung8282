"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Award, Heart, Home, Pause, Play, RotateCcw, Shield, Sparkles, Star, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { saveMiniGameScoreAction } from "@/actions/game";
import { ACHIEVEMENT_LABELS, GAME_HEIGHT, GAME_WIDTH } from "./constants";
import { SkyPupAudio } from "./audio";
import { formatPlayTime, SkyPupEngine } from "./engine";
import { loadGameData, saveGameData } from "./storage";
import type { GameHud, GameResult, Upgrade } from "./types";

const initialHud: GameHud = { status: "idle", score: 0, bestScore: 0, hp: 3, maxHp: 3, special: 0, elapsed: 0, level: 1, combo: 0, kills: 0, bossName: "", bossHp: 0, bossMaxHp: 0 };
const MOBILE_GAME_ACTIVE_EVENT = "mobile-game-active-change";
type RankingEntry = { id: string; userName: string; departmentName: string | null; score: number; durationSeconds: number; maxLevel: number; createdAt: string; isCurrentUser?: boolean };
type CurrentUserRanking = RankingEntry & { rank: number };

export function MobileSkyPupGame({ currentUserName }: { currentUserName: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SkyPupEngine | null>(null);
  const audioRef = useRef<SkyPupAudio | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const savedResultRef = useRef("");
  const [hud, setHud] = useState(initialHud);
  const [result, setResult] = useState<GameResult | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [achievementToast, setAchievementToast] = useState<string[]>([]);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [currentUserRanking, setCurrentUserRanking] = useState<CurrentUserRanking | null>(null);
  const [isRankingLoading, setIsRankingLoading] = useState(true);
  const [isSaving, startSaving] = useTransition();

  const loadRankings = useCallback(async () => {
    setIsRankingLoading(true);
    try {
      const response = await fetch("/api/mini-game-rankings", { cache: "no-store" });
      if (!response.ok) throw new Error("ranking request failed");
      const payload = await response.json() as { rankings?: RankingEntry[]; currentUserRanking?: CurrentUserRanking | null };
      setRankings((payload.rankings ?? []).slice(0, 10));
      setCurrentUserRanking(payload.currentUserRanking ?? null);
    } catch {
      setRankings([]); setCurrentUserRanking(null);
    } finally {
      setIsRankingLoading(false);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stored = loadGameData();
    const audio = new SkyPupAudio();
    audio.setEnabled(stored.soundEnabled);
    audioRef.current = audio;
    setSoundEnabled(stored.soundEnabled);
    setAchievements(stored.achievements);
    setHud((current) => ({ ...current, bestScore: stored.bestScore }));
    const engine = new SkyPupEngine(canvas, {
      onHud: setHud,
      onGameOver: (gameResult) => { setResult(gameResult); setAchievements(gameResult.achievements); audio.stopBgm(); },
      onLevelUp: setUpgrades,
      onAchievements: (ids) => {
        setAchievements((current) => Array.from(new Set([...current, ...ids])));
        setAchievementToast(ids);
        window.setTimeout(() => setAchievementToast([]), 2400);
      },
      onSound: (name) => audio.play(name)
    });
    engineRef.current = engine;
    return () => { engine.destroy(); audio.destroy(); };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRankings(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRankings]);

  useEffect(() => {
    const active = hud.status === "running" || hud.status === "paused" || hud.status === "levelup";
    window.dispatchEvent(new CustomEvent(MOBILE_GAME_ACTIVE_EVENT, { detail: { active } }));
  }, [hud.status]);

  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent(MOBILE_GAME_ACTIVE_EVENT, { detail: { active: false } }));
  }, []);

  useEffect(() => {
    if (!result) return;
    const key = `${result.score}-${result.duration}-${result.level}-${result.kills}`;
    if (savedResultRef.current === key) return;
    savedResultRef.current = key;
    startSaving(async () => {
      const saveResult = await saveMiniGameScoreAction({
        score: Math.min(999999, result.score),
        duration_seconds: Math.min(3600, result.duration),
        max_level: Math.min(999, result.level),
        snack_count: Math.min(999, result.bossKills)
      });
      if (saveResult.ok) await loadRankings();
    });
  }, [loadRankings, result]);

  function startGame() {
    setShowIntro(false); setResult(null); setUpgrades([]); savedResultRef.current = "";
    audioRef.current?.unlock(); audioRef.current?.startBgm(); engineRef.current?.start();
  }

  function togglePause() {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getStatus() === "paused") { engine.resume(); audioRef.current?.startBgm(); }
    else { engine.pause(); audioRef.current?.stopBgm(); }
  }

  function toggleSound() {
    const next = !soundEnabled; setSoundEnabled(next); saveGameData({ soundEnabled: next });
    audioRef.current?.setEnabled(next); if (next && hud.status === "running") audioRef.current?.startBgm();
  }

  function moveJoystick(event: React.PointerEvent<HTMLDivElement>) {
    if (hud.status !== "running") return;
    if (event.type === "pointerdown") event.currentTarget.setPointerCapture(event.pointerId);
    if (event.type === "pointermove" && event.pointerType !== "touch" && event.buttons === 0) return;
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = event.clientX - (rect.left + rect.width / 2);
    const rawY = event.clientY - (rect.top + rect.height / 2);
    const maxDistance = rect.width * 0.28;
    const distance = Math.hypot(rawX, rawY);
    const ratio = distance > maxDistance ? maxDistance / distance : 1;
    const x = rawX * ratio;
    const y = rawY * ratio;
    setStickPosition({ x, y });
    engineRef.current?.setJoystick(x / maxDistance, y / maxDistance);
  }

  function releaseJoystick() {
    setStickPosition({ x: 0, y: 0 });
    engineRef.current?.releaseJoystick();
  }

  function selectUpgrade(upgrade: Upgrade) {
    setUpgrades([]); engineRef.current?.applyUpgrade(upgrade.kind); audioRef.current?.startBgm();
  }

  return (
    <section className="overflow-hidden rounded-md border border-[#cbdcf1] bg-white shadow-[0_12px_30px_rgba(16,34,61,0.08)]">
      <header className="flex items-center gap-2 border-b border-[#dce8f6] bg-[#f6faff] px-3 py-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#e5f1ff] text-[#075be8]"><Shield className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0"><h1 className="text-sm font-black text-[#10223d]">하늘을 나는 흰둥이</h1><p className="truncate text-[10px] font-bold text-slate-500">{currentUserName}님의 히어로 비행</p></div>
        <button type="button" onClick={toggleSound} className="ml-auto icon-tool-button h-8 w-8" aria-label={soundEnabled ? "소리 끄기" : "소리 켜기"}>{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
        <button type="button" onClick={togglePause} disabled={hud.status !== "running" && hud.status !== "paused"} className="icon-tool-button h-8 w-8 disabled:opacity-35" aria-label={hud.status === "paused" ? "계속하기" : "일시정지"}>{hud.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
      </header>

      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1 border-b border-[#e6eef8] bg-white px-3 py-2 text-[10px] font-black">
        <div className="flex items-center gap-1" aria-label={`에너지 ${hud.hp}/${hud.maxHp}`}>
          {Array.from({ length: hud.maxHp }, (_, index) => <Heart key={index} className={`h-4 w-4 ${index < hud.hp ? "fill-rose-500 text-rose-500" : "fill-slate-100 text-slate-300"}`} aria-hidden="true" />)}
        </div>
        <span className="text-[#10223d]">점수 {hud.score.toLocaleString("ko-KR")}</span>
        <span className="text-[#075be8]">최고 {hud.bestScore.toLocaleString("ko-KR")}</span>
        <div className="col-span-3 flex items-center gap-2">
          <span className="shrink-0 text-amber-600">필살기</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${hud.special}%` }} /></div>
          <span className="w-8 text-right text-slate-500">{hud.special}%</span>
        </div>
      </div>

      <div className="relative bg-[#dff5ff]">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="block aspect-[39/62] w-full touch-none select-none"
          aria-label="하늘을 나는 흰둥이 슈팅 게임 화면"
        />

        {hud.bossName ? (
          <div className="absolute left-5 right-5 top-3 rounded-md border border-rose-200 bg-white/88 px-2 py-1.5 shadow-sm backdrop-blur">
            <div className="mb-1 flex justify-between text-[10px] font-black text-rose-700"><span>{hud.bossName}</span><span>{Math.max(0, Math.ceil(hud.bossHp))}/{hud.bossMaxHp}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-rose-100"><span className="block h-full bg-rose-500" style={{ width: `${Math.max(0, hud.bossHp / hud.bossMaxHp * 100)}%` }} /></div>
          </div>
        ) : null}

        {hud.combo >= 5 && hud.status === "running" ? <div className="absolute right-3 top-3 rotate-2 rounded-md bg-white/85 px-2 py-1 text-xs font-black text-[#075be8] shadow">{hud.combo} COMBO</div> : null}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-white/76 px-2 py-1 text-[9px] font-black text-slate-600 backdrop-blur">Lv.{hud.level} · {formatPlayTime(hud.elapsed)} · 처치 {hud.kills}</div>

        <div
          ref={joystickRef}
          role="application"
          aria-label="이동 조이스틱"
          onPointerDown={moveJoystick}
          onPointerMove={moveJoystick}
          onPointerUp={releaseJoystick}
          onPointerCancel={releaseJoystick}
          className={`absolute bottom-4 left-4 z-10 h-[106px] w-[106px] touch-none rounded-full border-2 border-white/80 bg-[#10223d]/20 shadow-[inset_0_0_22px_rgba(255,255,255,.38),0_8px_20px_rgba(16,34,61,.16)] backdrop-blur-sm ${hud.status === "running" ? "opacity-100" : "opacity-45"}`}
        >
          <span className="pointer-events-none absolute inset-2 rounded-full border border-white/55" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-white/90 shadow-md transition-transform duration-75" style={{ transform: `translate(calc(-50% + ${stickPosition.x}px), calc(-50% + ${stickPosition.y}px))` }}><span className="h-2.5 w-2.5 rounded-full bg-[#075be8]" /></span>
        </div>

        <button type="button" onClick={() => engineRef.current?.useSpecial()} disabled={hud.status !== "running" || hud.special < 100} className="absolute bottom-4 right-4 z-10 flex h-[70px] w-[70px] flex-col items-center justify-center rounded-full border-2 border-amber-200 bg-amber-400 text-[10px] font-black text-amber-950 shadow-[0_6px_0_#dcae26,0_10px_24px_rgba(116,83,13,.22)] active:translate-y-1 active:shadow-none disabled:border-white/70 disabled:bg-white/70 disabled:text-slate-400 disabled:shadow-sm"><Zap className="mb-0.5 h-5 w-5" aria-hidden="true" />필살기</button>

        {showIntro ? <IntroOverlay bestScore={hud.bestScore} onStart={startGame} /> : null}
        {hud.status === "paused" ? <SimpleOverlay title="일시정지" description="잠시 쉬었다가 다시 날아보세요." action="계속하기" onAction={togglePause} /> : null}
        {upgrades.length ? <LevelUpOverlay upgrades={upgrades} onSelect={selectUpgrade} /> : null}
        {result ? <GameOverOverlay result={result} rankings={rankings} currentUserRanking={currentUserRanking} rankingLoading={isRankingLoading} saving={isSaving} onRestart={startGame} onHome={() => { setResult(null); setShowIntro(true); }} /> : null}
        {achievementToast.length ? <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-md border border-amber-200 bg-white/94 px-3 py-2 text-center shadow-lg"><p className="text-[10px] font-black text-amber-600">업적 달성</p><p className="mt-0.5 whitespace-nowrap text-xs font-black text-[#10223d]">{achievementToast.map((id) => ACHIEVEMENT_LABELS[id]).join(", ")}</p></div> : null}
      </div>

      <div className="border-t border-[#dce8f6] bg-[#f8fbff] p-3">
        <p className="text-xs font-black text-[#10223d]">왼쪽 조이스틱으로 자유롭게 이동하세요</p><p className="mt-0.5 text-[10px] font-bold text-slate-500">위에서 내려오는 적과 탄환을 피하고, 오른쪽 필살기를 사용하세요.</p>
      </div>

      {achievements.length ? (
        <div className="border-t border-[#e5edf7] px-3 py-2"><p className="mb-1 flex items-center gap-1 text-[10px] font-black text-slate-500"><Award className="h-3.5 w-3.5" />달성 업적</p><div className="flex flex-wrap gap-1">{achievements.map((id) => <span key={id} className="rounded-md bg-[#eef5ff] px-2 py-1 text-[9px] font-black text-[#075be8]">{ACHIEVEMENT_LABELS[id] ?? id}</span>)}</div></div>
      ) : null}
    </section>
  );
}

function IntroOverlay({ bestScore, onStart }: { bestScore: number; onStart: () => void }) {
  return <div className="absolute inset-0 z-20 flex items-center justify-center bg-sky-100/65 p-6 backdrop-blur-[2px]"><div className="w-full max-w-[290px] rounded-md border border-white bg-white/94 p-5 text-center shadow-[0_18px_50px_rgba(50,113,170,.2)]"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-500"><Star className="h-7 w-7 fill-amber-400" /></span><h2 className="mt-3 text-xl font-black text-[#10223d]">하늘을 나는 흰둥이</h2><p className="mt-2 text-xs font-bold leading-5 text-slate-500">마을을 지키는 하얀 강아지 히어로와 함께 끝없는 비행을 시작하세요.</p><p className="mt-3 text-xs font-black text-[#075be8]">최고기록 {bestScore.toLocaleString("ko-KR")}</p><button type="button" onClick={onStart} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#075be8] text-sm font-black text-white shadow-[0_6px_0_#0349bd] active:translate-y-1 active:shadow-none"><Play className="h-4 w-4 fill-white" />게임 시작</button></div></div>;
}

function SimpleOverlay({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/32 p-6 backdrop-blur-sm"><div className="w-full max-w-[260px] rounded-md bg-white p-5 text-center shadow-xl"><h2 className="text-lg font-black">{title}</h2><p className="mt-2 text-xs font-bold text-slate-500">{description}</p><button type="button" onClick={onAction} className="tool-button tool-button-primary mt-4 w-full justify-center">{action}</button></div></div>;
}

function LevelUpOverlay({ upgrades, onSelect }: { upgrades: Upgrade[]; onSelect: (upgrade: Upgrade) => void }) {
  return <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#10223d]/62 p-4 backdrop-blur-sm"><div className="w-full rounded-md border border-white/70 bg-white/96 p-4 shadow-2xl"><div className="text-center"><Sparkles className="mx-auto h-6 w-6 text-amber-500" /><h2 className="mt-1 text-lg font-black text-[#10223d]">LEVEL UP!</h2><p className="text-[10px] font-bold text-slate-500">새로운 능력을 하나 선택하세요.</p></div><div className="mt-3 grid gap-2">{upgrades.map((upgrade) => <button key={upgrade.kind} type="button" onClick={() => onSelect(upgrade)} className="flex items-center gap-3 rounded-md border border-[#d7e4f6] bg-[#f7fbff] p-3 text-left active:bg-blue-50"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#e5f1ff] text-[#075be8]"><Sparkles className="h-4 w-4" /></span><span><span className="block text-xs font-black text-[#10223d]">{upgrade.title}</span><span className="mt-0.5 block text-[10px] font-bold text-slate-500">{upgrade.description}</span></span></button>)}</div></div></div>;
}

function GameOverOverlay({ result, rankings, currentUserRanking, rankingLoading, saving, onRestart, onHome }: { result: GameResult; rankings: RankingEntry[]; currentUserRanking: CurrentUserRanking | null; rankingLoading: boolean; saving: boolean; onRestart: () => void; onHome: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#10223d]/64 p-3 backdrop-blur-sm">
      <div className="max-h-[96%] w-full max-w-[330px] overflow-y-auto rounded-md border border-white/70 bg-white/96 p-3 shadow-2xl">
        <div className="text-center"><Trophy className="mx-auto h-6 w-6 text-amber-500" /><h2 className="mt-0.5 text-lg font-black text-[#10223d]">Game Over</h2><p className="text-[9px] font-bold text-slate-500">{saving ? "점수와 랭킹을 갱신하는 중입니다." : "멋진 비행이었습니다!"}</p></div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">{[["이번 점수", result.score.toLocaleString("ko-KR")],["최고점수", result.bestScore.toLocaleString("ko-KR")],["플레이시간", formatPlayTime(result.duration)],["처치수", `${result.kills}마리`],["레벨", `Lv.${result.level}`],["보스 처치", `${result.bossKills}회`]].map(([label,value]) => <div key={label} className="rounded-md bg-[#f3f7fc] px-1 py-1.5"><p className="text-[8px] font-bold text-slate-500">{label}</p><p className="mt-0.5 text-[10px] font-black text-[#10223d]">{value}</p></div>)}</div>
        <div className="mt-2 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2"><span className="text-[10px] font-black text-blue-700">내 랭킹</span><span className="text-xs font-black text-[#075be8]">{rankingLoading || saving ? "집계 중" : currentUserRanking ? `#${currentUserRanking.rank} · ${currentUserRanking.score.toLocaleString("ko-KR")}점` : "기록 없음"}</span></div>
        <div className="mt-2 overflow-hidden rounded-md border border-[#dce7f4]">
          <div className="flex items-center justify-between bg-[#f5f9ff] px-2.5 py-1.5"><p className="text-[10px] font-black text-[#10223d]">현재 랭킹 TOP 10</p><span className="text-[8px] font-bold text-slate-400">점수 기준</span></div>
          {rankingLoading ? <p className="px-3 py-4 text-center text-[10px] font-bold text-slate-400">랭킹을 불러오는 중입니다.</p> : rankings.length ? <ol className="divide-y divide-slate-100">{rankings.map((ranking, index) => <li key={ranking.id} className={`grid grid-cols-[24px_1fr_auto] items-center gap-1.5 px-2.5 py-1.5 text-[9px] ${ranking.isCurrentUser ? "bg-blue-50" : "bg-white"}`}><span className={`font-black ${index < 3 ? "text-amber-600" : "text-slate-400"}`}>#{index + 1}</span><span className="min-w-0 truncate font-black text-[#10223d]">{ranking.userName}<span className="ml-1 font-bold text-slate-400">{ranking.departmentName ?? "-"}</span></span><span className="font-black text-[#075be8]">{ranking.score.toLocaleString("ko-KR")}</span></li>)}</ol> : <p className="px-3 py-4 text-center text-[10px] font-bold text-slate-400">등록된 랭킹이 없습니다.</p>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={onHome} className="tool-button justify-center"><Home className="h-4 w-4" />홈으로</button><button type="button" onClick={onRestart} className="tool-button tool-button-primary justify-center"><RotateCcw className="h-4 w-4" />다시하기</button></div>
      </div>
    </div>
  );
}
