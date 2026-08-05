"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Award, Heart, Home, Pause, Play, RotateCcw, Shield, Sparkles, Star, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { saveMiniGameScoreAction } from "@/actions/game";
import { clampMiniGameScore } from "@/lib/game/score";
import { ACHIEVEMENT_LABELS, GAME_HEIGHT, GAME_WIDTH, PLAYER_BASE_HP } from "./constants";
import { loadSkyPupVisualAssets } from "./assets";
import { SkyPupAudio } from "./audio";
import { formatPlayTime, SkyPupEngine } from "./engine";
import { loadGameData, saveGameData } from "./storage";
import type { GameHud, GameResult, Upgrade } from "./types";

const initialHud: GameHud = { status: "idle", score: 0, bestScore: 0, hp: PLAYER_BASE_HP, maxHp: PLAYER_BASE_HP, special: 0, elapsed: 0, level: 1, combo: 0, kills: 0, bossName: "", bossHp: 0, bossMaxHp: 0 };
const MOBILE_GAME_ACTIVE_EVENT = "mobile-game-active-change";
type RankingEntry = { id: string; userName: string; departmentName: string | null; score: number; durationSeconds: number; maxLevel: number; createdAt: string; isCurrentUser?: boolean };
type CurrentUserRanking = RankingEntry & { rank: number };

export function MobileSkyPupGame({ currentUserName }: { currentUserName: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SkyPupEngine | null>(null);
  const audioRef = useRef<SkyPupAudio | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLSpanElement | null>(null);
  const activeJoystickPointerRef = useRef<number | null>(null);
  const savedResultRef = useRef("");
  const [hud, setHud] = useState(initialHud);
  const [result, setResult] = useState<GameResult | null>(null);
  const [upgrades, setUpgrades] = useState<Upgrade[]>([]);
  const [achievementToast, setAchievementToast] = useState<string[]>([]);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showIntro, setShowIntro] = useState(true);
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

  const applyJoystickPoint = useCallback((clientX: number, clientY: number) => {
    if (engineRef.current?.getStatus() !== "running") return;
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rawX = clientX - (rect.left + rect.width / 2);
    const rawY = clientY - (rect.top + rect.height / 2);
    const maxDistance = rect.width * 0.28;
    const distance = Math.hypot(rawX, rawY);
    const ratio = distance > maxDistance ? maxDistance / distance : 1;
    const x = rawX * ratio;
    const y = rawY * ratio;
    engineRef.current.setJoystick(x / maxDistance, y / maxDistance);
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(GAME_WIDTH * pixelRatio);
    canvas.height = Math.round(GAME_HEIGHT * pixelRatio);
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
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => engine.setReducedMotion(reducedMotionQuery.matches);
    syncReducedMotion();
    reducedMotionQuery.addEventListener?.("change", syncReducedMotion);
    let alive = true;
    void loadSkyPupVisualAssets().then((assets) => {
      if (alive) engine.setVisualAssets(assets);
    });
    return () => { alive = false; reducedMotionQuery.removeEventListener?.("change", syncReducedMotion); engine.destroy(); audio.destroy(); };
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
    function moveActivePointer(event: PointerEvent) {
      if (activeJoystickPointerRef.current !== event.pointerId) return;
      if (event.cancelable) event.preventDefault();
      applyJoystickPoint(event.clientX, event.clientY);
    }

    function resetJoystick() {
      activeJoystickPointerRef.current = null;
      if (joystickKnobRef.current) joystickKnobRef.current.style.transform = "translate(-50%, -50%)";
      engineRef.current?.releaseJoystick();
    }

    function releaseActivePointer(event: PointerEvent) {
      if (activeJoystickPointerRef.current !== event.pointerId) return;
      resetJoystick();
    }

    function releaseOnBlur() {
      if (activeJoystickPointerRef.current !== null) resetJoystick();
    }

    window.addEventListener("pointermove", moveActivePointer, { passive: false });
    window.addEventListener("pointerrawupdate", moveActivePointer as EventListener, { passive: false });
    window.addEventListener("pointerup", releaseActivePointer);
    window.addEventListener("pointercancel", releaseActivePointer);
    window.addEventListener("blur", releaseOnBlur);
    return () => {
      window.removeEventListener("pointermove", moveActivePointer);
      window.removeEventListener("pointerrawupdate", moveActivePointer as EventListener);
      window.removeEventListener("pointerup", releaseActivePointer);
      window.removeEventListener("pointercancel", releaseActivePointer);
      window.removeEventListener("blur", releaseOnBlur);
    };
  }, [applyJoystickPoint]);

  useEffect(() => {
    if (!result) return;
    const key = `${result.score}-${result.duration}-${result.level}-${result.kills}`;
    if (savedResultRef.current === key) return;
    savedResultRef.current = key;
    startSaving(async () => {
      const saveResult = await saveMiniGameScoreAction({
        score: clampMiniGameScore(result.score),
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

  function startJoystick(event: React.PointerEvent<HTMLDivElement>) {
    if (hud.status !== "running") return;
    activeJoystickPointerRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Window-level tracking remains active on browsers without pointer capture support.
    }
    applyJoystickPoint(event.clientX, event.clientY);
  }

  function selectUpgrade(upgrade: Upgrade) {
    setUpgrades([]); engineRef.current?.applyUpgrade(upgrade.kind); audioRef.current?.startBgm();
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-[#eadcff] bg-gradient-to-b from-[#fff8fd] via-white to-[#f5f0ff] shadow-[0_18px_45px_rgba(119,84,157,0.16)]">
      <p className="sr-only" aria-live="polite" aria-atomic="true">{hud.status === "running" ? "게임 진행 중" : hud.status === "paused" ? "게임 일시정지" : hud.status === "levelup" ? "레벨업 능력 선택" : hud.status === "gameover" ? "게임 종료" : "게임 시작 대기"}</p>
      <header className="flex items-center gap-2 border-b border-[#f0def1] bg-gradient-to-r from-[#fff0f7] via-[#fbf4ff] to-[#edf8ff] px-3 py-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/90 bg-white/75 text-[#8b63c7] shadow-sm"><Shield className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0"><h1 className="text-sm font-black text-[#4b3b68]">하늘을 나는 흰둥이</h1><p className="truncate text-[10px] font-bold text-[#7d7191]">{currentUserName}님의 솜사탕 히어로 비행</p></div>
        <button type="button" onClick={toggleSound} className="ml-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-white/90 bg-white/80 text-[#7256a2] shadow-sm transition active:scale-95" aria-label={soundEnabled ? "소리 끄기" : "소리 켜기"}>{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
        <button type="button" onClick={togglePause} disabled={hud.status !== "running" && hud.status !== "paused"} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/90 bg-white/80 text-[#7256a2] shadow-sm transition active:scale-95 disabled:opacity-35" aria-label={hud.status === "paused" ? "계속하기" : "일시정지"}>{hud.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
      </header>

      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1 border-b border-[#f0e4f5] bg-white/90 px-3 py-2 text-[10px] font-black">
        <div className="col-span-2 flex items-center gap-1" aria-label={`에너지 ${hud.hp}/${hud.maxHp}`}>
          {Array.from({ length: hud.maxHp }, (_, index) => <Heart key={index} className={`h-4 w-4 ${index < hud.hp ? "fill-rose-500 text-rose-500" : "fill-slate-100 text-slate-300"}`} aria-hidden="true" />)}
        </div>
        <span className="whitespace-nowrap tabular-nums text-[#4b3b68]">점수 {hud.score.toLocaleString("ko-KR")}</span>
        <span className="whitespace-nowrap text-right tabular-nums text-[#8b63c7]">최고 {hud.bestScore.toLocaleString("ko-KR")}</span>
        <div className="col-span-2 flex items-center gap-2">
          <span className="shrink-0 text-amber-600">필살기</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f2eafa]"><span className="block h-full rounded-full bg-gradient-to-r from-[#ffd878] via-[#ffb8d2] to-[#b99cf0] transition-[width]" style={{ width: `${hud.special}%` }} /></div>
          <span className="w-8 text-right text-slate-500">{hud.special}%</span>
        </div>
      </div>

      <div className="relative bg-[#e9ddff]">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="block aspect-[39/62] w-full touch-none select-none"
          aria-label="하늘을 나는 흰둥이 슈팅 게임 화면"
        />

        {hud.bossName ? (
          <div className="absolute left-5 right-5 top-3 rounded-2xl border border-[#ffd4e4] bg-white/88 px-2.5 py-2 shadow-[0_8px_20px_rgba(119,84,157,.12)] backdrop-blur">
            <div className="mb-1 flex justify-between text-[10px] font-black text-rose-700"><span>{hud.bossName}</span><span>{Math.max(0, Math.ceil(hud.bossHp))}/{hud.bossMaxHp}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-rose-100"><span className="block h-full bg-rose-500" style={{ width: `${Math.max(0, hud.bossHp / hud.bossMaxHp * 100)}%` }} /></div>
          </div>
        ) : null}

        {hud.combo >= 5 && hud.status === "running" ? <div className="absolute right-3 top-3 rotate-2 rounded-2xl border border-white/80 bg-white/88 px-2.5 py-1 text-xs font-black text-[#7650b4] shadow">{hud.combo} COMBO</div> : null}
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[9px] font-black text-[#625578] shadow-sm backdrop-blur">Lv.{hud.level} · {formatPlayTime(hud.elapsed)} · 처치 {hud.kills}</div>

        <div
          ref={joystickRef}
          role="application"
          aria-label="이동 조이스틱"
          onPointerDown={startJoystick}
          className={`absolute bottom-4 left-4 z-10 h-[106px] w-[106px] touch-none rounded-full border-2 border-white/90 bg-[#71568f]/25 shadow-[inset_0_0_24px_rgba(255,255,255,.55),0_8px_20px_rgba(86,60,118,.2)] backdrop-blur-sm ${hud.status === "running" ? "opacity-100" : "opacity-45"}`}
        >
          <span className="pointer-events-none absolute inset-2 rounded-full border border-white/55" />
          <span ref={joystickKnobRef} className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 items-center justify-center rounded-full border border-white bg-white/95 shadow-md will-change-transform" style={{ transform: "translate(-50%, -50%)" }}><span className="h-2.5 w-2.5 rounded-full bg-[#8b63c7]" /></span>
        </div>

        <button type="button" onClick={() => engineRef.current?.useSpecial()} disabled={hud.status !== "running" || hud.special < 100} className="absolute bottom-4 right-4 z-10 flex h-[70px] w-[70px] flex-col items-center justify-center rounded-full border-2 border-amber-200 bg-amber-400 text-[10px] font-black text-amber-950 shadow-[0_6px_0_#dcae26,0_10px_24px_rgba(116,83,13,.22)] active:translate-y-1 active:shadow-none disabled:border-white/70 disabled:bg-white/70 disabled:text-slate-400 disabled:shadow-sm"><Zap className="mb-0.5 h-5 w-5" aria-hidden="true" />필살기</button>

        {showIntro ? <IntroOverlay bestScore={hud.bestScore} onStart={startGame} /> : null}
        {hud.status === "paused" ? <SimpleOverlay title="일시정지" description="잠시 쉬었다가 다시 날아보세요." action="계속하기" onAction={togglePause} /> : null}
        {upgrades.length ? <LevelUpOverlay upgrades={upgrades} onSelect={selectUpgrade} /> : null}
        {result ? <GameOverOverlay result={result} rankings={rankings} currentUserRanking={currentUserRanking} rankingLoading={isRankingLoading} saving={isSaving} onRestart={startGame} onHome={() => { setResult(null); setShowIntro(true); }} /> : null}
        {achievementToast.length ? <div role="status" aria-live="assertive" className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-2xl border border-[#ffe0a8] bg-white/94 px-3 py-2 text-center shadow-lg"><p className="text-[10px] font-black text-amber-600">업적 달성</p><p className="mt-0.5 whitespace-nowrap text-xs font-black text-[#4b3b68]">{achievementToast.map((id) => ACHIEVEMENT_LABELS[id]).join(", ")}</p></div> : null}
      </div>

      <div className="border-t border-[#eee0f5] bg-gradient-to-r from-[#fff4f9] to-[#f3f0ff] p-3">
        <p className="text-xs font-black text-[#4b3b68]">왼쪽 조이스틱으로 자유롭게 이동하세요</p><p className="mt-0.5 text-[10px] font-bold text-[#7d7191]">위에서 내려오는 적과 탄환을 피하고, 오른쪽 필살기를 사용하세요.</p>
      </div>

      {achievements.length ? (
        <div className="border-t border-[#e5edf7] px-3 py-2"><p className="mb-1 flex items-center gap-1 text-[10px] font-black text-slate-500"><Award className="h-3.5 w-3.5" />달성 업적</p><div className="flex flex-wrap gap-1">{achievements.map((id) => <span key={id} className="rounded-md bg-[#eef5ff] px-2 py-1 text-[9px] font-black text-[#075be8]">{ACHIEVEMENT_LABELS[id] ?? id}</span>)}</div></div>
      ) : null}
    </section>
  );
}

function IntroOverlay({ bestScore, onStart }: { bestScore: number; onStart: () => void }) {
  useRestoreFocus();
  return <div role="dialog" aria-modal="true" aria-labelledby="sky-pup-intro-title" onKeyDown={trapDialogFocus} className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-b from-[#fce5f2]/70 to-[#e8e0ff]/72 p-6 backdrop-blur-[2px]"><div className="w-full max-w-[290px] rounded-[28px] border border-white/90 bg-white/94 p-5 text-center shadow-[0_20px_55px_rgba(111,75,153,.22)]"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#fff2b8] to-[#ffd7e8] text-amber-500 shadow-inner"><Star className="h-7 w-7 fill-amber-400" /></span><h2 id="sky-pup-intro-title" className="mt-3 text-xl font-black text-[#4b3b68]">하늘을 나는 흰둥이</h2><p className="mt-2 text-xs font-bold leading-5 text-[#7d7191]">마을을 지키는 폭신한 강아지 히어로와 함께 솜사탕 하늘을 날아보세요.</p><p className="mt-3 text-xs font-black text-[#8b63c7]">최고기록 {bestScore.toLocaleString("ko-KR")}</p><button autoFocus type="button" onClick={onStart} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#9c72d6] to-[#ee8fba] text-sm font-black text-white shadow-[0_6px_0_#7d59ad] active:translate-y-1 active:shadow-none"><Play className="h-4 w-4 fill-white" />게임 시작</button></div></div>;
}

function SimpleOverlay({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  useRestoreFocus();
  return <div role="dialog" aria-modal="true" aria-labelledby="sky-pup-status-title" onKeyDown={trapDialogFocus} className="absolute inset-0 z-20 flex items-center justify-center bg-[#4b3b68]/38 p-6 backdrop-blur-sm"><div className="w-full max-w-[260px] rounded-[24px] border border-white/80 bg-gradient-to-b from-white to-[#faf5ff] p-5 text-center shadow-xl"><h2 id="sky-pup-status-title" className="text-lg font-black text-[#4b3b68]">{title}</h2><p className="mt-2 text-xs font-bold text-[#7d7191]">{description}</p><button autoFocus type="button" onClick={onAction} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#8b63c7] text-sm font-black text-white shadow-md">{action}</button></div></div>;
}

function LevelUpOverlay({ upgrades, onSelect }: { upgrades: Upgrade[]; onSelect: (upgrade: Upgrade) => void }) {
  useRestoreFocus();
  return <div role="dialog" aria-modal="true" aria-labelledby="sky-pup-levelup-title" onKeyDown={trapDialogFocus} className="absolute inset-0 z-30 flex items-center justify-center bg-[#4b3b68]/58 p-4 backdrop-blur-sm"><div className="w-full rounded-[26px] border border-white/80 bg-gradient-to-b from-white to-[#fff5fb] p-4 shadow-2xl"><div className="text-center"><Sparkles className="mx-auto h-6 w-6 text-[#e39a45]" /><h2 id="sky-pup-levelup-title" className="mt-1 text-lg font-black text-[#4b3b68]">LEVEL UP!</h2><p className="text-[10px] font-bold text-[#7d7191]">새로운 능력을 하나 선택하세요.</p></div><div className="mt-3 grid gap-2">{upgrades.map((upgrade, index) => <button key={upgrade.kind} autoFocus={index === 0} type="button" onClick={() => onSelect(upgrade)} className="flex min-h-11 items-center gap-3 rounded-2xl border border-[#eadcff] bg-gradient-to-r from-[#fbf7ff] to-[#fff5f9] p-3 text-left active:bg-[#f1e7ff]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eee3ff] text-[#8b63c7]"><Sparkles className="h-4 w-4" /></span><span><span className="block text-xs font-black text-[#4b3b68]">{upgrade.title}</span><span className="mt-0.5 block text-[10px] font-bold text-[#7d7191]">{upgrade.description}</span></span></button>)}</div></div></div>;
}

function GameOverOverlay({ result, rankings, currentUserRanking, rankingLoading, saving, onRestart, onHome }: { result: GameResult; rankings: RankingEntry[]; currentUserRanking: CurrentUserRanking | null; rankingLoading: boolean; saving: boolean; onRestart: () => void; onHome: () => void }) {
  useRestoreFocus();
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sky-pup-gameover-title" onKeyDown={trapDialogFocus} className="absolute inset-0 z-30 flex items-center justify-center bg-[#4b3b68]/62 p-3 backdrop-blur-sm">
      <div className="max-h-[96%] w-full max-w-[330px] overflow-y-auto rounded-[26px] border border-white/80 bg-gradient-to-b from-white to-[#fff7fb] p-3 shadow-2xl">
        <div className="text-center"><Trophy className="mx-auto h-6 w-6 text-amber-500" /><h2 id="sky-pup-gameover-title" className="mt-0.5 text-lg font-black text-[#4b3b68]">Game Over</h2><p role="status" aria-live="polite" className="text-[9px] font-bold text-[#7d7191]">{saving ? "점수와 랭킹을 갱신하는 중입니다." : "멋진 비행이었습니다!"}</p></div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">{[["이번 점수", result.score.toLocaleString("ko-KR")],["최고점수", result.bestScore.toLocaleString("ko-KR")],["플레이시간", formatPlayTime(result.duration)],["처치수", `${result.kills}마리`],["레벨", `Lv.${result.level}`],["보스 처치", `${result.bossKills}회`]].map(([label,value]) => <div key={label} className="rounded-md bg-[#f3f7fc] px-1 py-1.5"><p className="text-[8px] font-bold text-slate-500">{label}</p><p className="mt-0.5 text-[10px] font-black text-[#10223d]">{value}</p></div>)}</div>
        <div className="mt-2 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2"><span className="text-[10px] font-black text-blue-700">내 랭킹</span><span className="text-xs font-black text-[#075be8]">{rankingLoading || saving ? "집계 중" : currentUserRanking ? `#${currentUserRanking.rank} · ${currentUserRanking.score.toLocaleString("ko-KR")}점` : "기록 없음"}</span></div>
        <div className="mt-2 overflow-hidden rounded-md border border-[#dce7f4]">
          <div className="flex items-center justify-between bg-[#f5f9ff] px-2.5 py-1.5"><p className="text-[10px] font-black text-[#10223d]">현재 랭킹 TOP 10</p><span className="text-[8px] font-bold text-slate-400">점수 기준</span></div>
          {rankingLoading ? <p className="px-3 py-4 text-center text-[10px] font-bold text-slate-400">랭킹을 불러오는 중입니다.</p> : rankings.length ? <ol className="divide-y divide-slate-100">{rankings.map((ranking, index) => <li key={ranking.id} className={`grid grid-cols-[24px_1fr_auto] items-center gap-1.5 px-2.5 py-1.5 text-[9px] ${ranking.isCurrentUser ? "bg-blue-50" : "bg-white"}`}><span className={`font-black ${index < 3 ? "text-amber-600" : "text-slate-400"}`}>#{index + 1}</span><span className="min-w-0 truncate font-black text-[#10223d]">{ranking.userName}<span className="ml-1 font-bold text-slate-400">{ranking.departmentName ?? "-"}</span></span><span className="font-black text-[#075be8]">{ranking.score.toLocaleString("ko-KR")}</span></li>)}</ol> : <p className="px-3 py-4 text-center text-[10px] font-bold text-slate-400">등록된 랭킹이 없습니다.</p>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={onHome} className="tool-button min-h-11 justify-center"><Home className="h-4 w-4" />홈으로</button><button autoFocus type="button" onClick={onRestart} className="tool-button tool-button-primary min-h-11 justify-center"><RotateCcw className="h-4 w-4" />다시하기</button></div>
      </div>
    </div>
  );
}

function useRestoreFocus() {
  const previousFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  useEffect(() => () => previousFocusRef.current?.focus({ preventScroll: true }), []);
}

function trapDialogFocus(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
