import { describe, expect, it } from "vitest";
import { getCurrentWeekOption, getReportMonthByThursday, getWeekOfMonth, getWeekOptions } from "@/lib/dates/week";

describe("week calculation", () => {
  it("uses Monday as week start in Asia/Seoul", () => {
    const option = getCurrentWeekOption(new Date("2026-07-25T03:00:00.000Z"));
    expect(option.weekStartDate).toBe("2026-07-20");
    expect(option.weekEndDate).toBe("2026-07-26");
  });

  it("uses Thursday month for month boundary week", () => {
    expect(getReportMonthByThursday("2026-06-29")).toEqual({ year: 2026, month: 7 });
  });

  it("calculates week of month from Thursday-owned month", () => {
    expect(getWeekOfMonth("2026-07-20")).toBe(4);
  });

  it("returns selectable week options", () => {
    const weeks = getWeekOptions(2026, 7);
    expect(weeks.map((week) => week.weekStartDate)).toContain("2026-07-20");
  });
});
