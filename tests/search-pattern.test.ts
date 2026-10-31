import { describe, expect, it } from "vitest";
import { SEARCH_KEYWORD_MAX_LENGTH, toContainsPattern } from "@/lib/utils/search";

describe("toContainsPattern", () => {
  it("wraps the keyword for a contains search", () => {
    expect(toContainsPattern("  용마  ")).toBe("%용마%");
  });

  it("escapes LIKE wildcards and backslashes", () => {
    expect(toContainsPattern("100%")).toBe("%100\\%%");
    expect(toContainsPattern("a_b")).toBe("%a\\_b%");
    expect(toContainsPattern("c\\d")).toBe("%c\\\\d%");
  });

  it("limits the keyword length", () => {
    const pattern = toContainsPattern("가".repeat(200));
    expect(pattern).toBe(`%${"가".repeat(SEARCH_KEYWORD_MAX_LENGTH)}%`);
  });

  it("uses the first value when the query string repeats", () => {
    expect(toContainsPattern(["첫째", "둘째"])).toBe("%첫째%");
  });
});
