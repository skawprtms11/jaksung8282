const STORAGE_KEY = "tpl-sky-pup-v1";

export type StoredGameData = {
  bestScore: number;
  soundEnabled: boolean;
  achievements: string[];
};

const defaults: StoredGameData = { bestScore: 0, soundEnabled: true, achievements: [] };

export function loadGameData(): StoredGameData {
  if (typeof window === "undefined") return defaults;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<StoredGameData>;
    return {
      bestScore: Number.isFinite(parsed.bestScore) ? Math.max(0, Number(parsed.bestScore)) : 0,
      soundEnabled: parsed.soundEnabled !== false,
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements.filter((item): item is string => typeof item === "string") : []
    };
  } catch {
    return defaults;
  }
}
export function saveGameData(patch: Partial<StoredGameData>): StoredGameData {
  const next = { ...loadGameData(), ...patch };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
