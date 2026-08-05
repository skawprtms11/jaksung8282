export const MAX_MINI_GAME_SCORE = 9_999_999;

export function clampMiniGameScore(score: number) {
  return Math.min(MAX_MINI_GAME_SCORE, Math.max(0, Math.floor(score)));
}
