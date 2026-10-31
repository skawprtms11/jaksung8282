export const SEARCH_KEYWORD_MAX_LENGTH = 50;

// 검색어를 ilike '포함' 패턴으로 바꾼다. 사용자가 넣은 % _ \ 는 와일드카드가 아닌 글자로 찾도록 이스케이프하고,
// 지나치게 긴 검색어로 느린 스캔을 유발하지 못하게 길이를 자른다.
// URL 에 q 가 여러 번 오면 배열이 들어오므로 첫 값만 쓴다.
export function toContainsPattern(keyword: string | string[]) {
  const value = Array.isArray(keyword) ? keyword[0] ?? "" : String(keyword);
  const trimmed = value.trim().slice(0, SEARCH_KEYWORD_MAX_LENGTH);
  return `%${trimmed.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
