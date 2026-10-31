import { randomInt } from "node:crypto";

// 관리자 초기화용 임시 비밀번호. 사번처럼 추측 가능한 값 대신 매번 무작위로 만든다.
// 화면에서 옮겨 적기 쉽도록 혼동 문자(I·l·O·o·0·1)는 뺀다.
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = UPPERCASE + LOWERCASE + DIGITS;

export const TEMPORARY_PASSWORD_LENGTH = 14;

function pick(characters: string) {
  return characters[randomInt(characters.length)];
}

export function generateTemporaryPassword(length = TEMPORARY_PASSWORD_LENGTH) {
  if (!Number.isInteger(length) || length < 12) {
    throw new Error("임시 비밀번호는 12자 이상이어야 합니다.");
  }
  const characters = [pick(UPPERCASE), pick(LOWERCASE), pick(DIGITS)];
  while (characters.length < length) {
    characters.push(pick(ALPHABET));
  }
  // 필수 문자 3개가 항상 앞자리에 오지 않도록 Fisher-Yates 로 섞는다.
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}
