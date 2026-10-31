import { describe, expect, it } from "vitest";
import { safeErrorMessage } from "@/lib/utils/form";

const FALLBACK = "요청을 처리하지 못했습니다. 입력값과 권한을 확인하세요.";

describe("safeErrorMessage", () => {
  it("passes intended Korean RAISE messages through", () => {
    expect(safeErrorMessage("소속 부서 자료만 처리할 수 있습니다.")).toBe("소속 부서 자료만 처리할 수 있습니다.");
    expect(safeErrorMessage("소속 부서 자료만 처리할 수 있습니다.", "P0001")).toBe("소속 부서 자료만 처리할 수 있습니다.");
  });

  it("blocks raw PostgreSQL errors even when they echo Korean input", () => {
    expect(safeErrorMessage('invalid input syntax for type uuid: "가나다"')).toBe(FALLBACK);
    expect(safeErrorMessage('new row for relation "notices" violates check constraint "제목"')).toBe(FALLBACK);
    expect(safeErrorMessage("function public.없는함수(uuid) does not exist")).toBe(FALLBACK);
  });

  it("only trusts P0001 when an error code is given", () => {
    expect(safeErrorMessage("한글 메시지", "22P02")).toBe(FALLBACK);
  });

  it("keeps the existing duplicate and permission mappings", () => {
    expect(safeErrorMessage('duplicate key value violates unique constraint "x"')).toBe("이미 등록된 데이터가 있습니다.");
    expect(safeErrorMessage("new row violates row-level security policy")).toBe("처리 권한이 없습니다.");
    expect(safeErrorMessage(undefined)).toBe("처리 중 오류가 발생했습니다.");
  });
});
