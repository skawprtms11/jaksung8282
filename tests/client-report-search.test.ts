import { describe, expect, it } from "vitest";
import {
  filterClientReportSearchItems,
  filterDepartmentCommonSearchItems,
  hasClientReportSearchFilters,
  matchesDepartmentCommonSearch,
  matchesClientReportSearch,
  parseClientReportSearchFilters,
  type SearchableClientReport
} from "@/lib/reports/client-report-search";

const report: SearchableClientReport = {
  week_start_date: "2026-07-27",
  weekly_client_report_items: [
    {
      item_period: "current",
      importance: "high",
      work_category_id: "operation",
      title: "신규 입고 운영",
      content: "자동화 설비 점검을 완료했습니다."
    },
    {
      item_period: "next",
      importance: "medium",
      work_category_id: "quality",
      title: "품질 개선 계획",
      content: "포장 불량 원인을 분석할 예정입니다."
    }
  ]
};

describe("client report search", () => {
  it("searches current and next item titles with the quick query", () => {
    expect(matchesClientReportSearch(report, { query: "입고" })).toBe(true);
    expect(matchesClientReportSearch(report, { query: "품질" })).toBe(true);
    expect(matchesClientReportSearch(report, { query: "출고" })).toBe(false);
  });

  it("requires item metadata filters to match the same item", () => {
    expect(
      matchesClientReportSearch(report, {
        workCategoryId: "operation",
        importance: "high",
        title: "신규"
      })
    ).toBe(true);
    expect(
      matchesClientReportSearch(report, {
        workCategoryId: "operation",
        importance: "medium"
      })
    ).toBe(false);
  });

  it("searches current and next content independently and applies the date range", () => {
    expect(
      matchesClientReportSearch(report, {
        currentContent: "설비 점검",
        nextContent: "불량 원인",
        dateFrom: "2026-07-01",
        dateTo: "2026-07-31"
      })
    ).toBe(true);
    expect(matchesClientReportSearch(report, { dateTo: "2026-07-20" })).toBe(false);
  });

  it("searches titles and both period contents with one detailed data term", () => {
    expect(matchesClientReportSearch(report, { searchData: "신규 입고" })).toBe(true);
    expect(matchesClientReportSearch(report, { searchData: "설비 점검" })).toBe(true);
    expect(matchesClientReportSearch(report, { searchData: "불량 원인" })).toBe(true);
    expect(
      matchesClientReportSearch(report, {
        workCategoryId: "quality",
        importance: "medium",
        searchData: "불량 원인"
      })
    ).toBe(true);
    expect(
      matchesClientReportSearch(report, {
        workCategoryId: "operation",
        searchData: "불량 원인"
      })
    ).toBe(false);
  });

  it("returns only the individual items that matched the search", () => {
    expect(
      filterClientReportSearchItems(report, { query: "입고" }).map((item) => item.title)
    ).toEqual(["신규 입고 운영"]);
    expect(
      filterClientReportSearchItems(report, { searchData: "불량 원인" }).map((item) => item.title)
    ).toEqual(["품질 개선 계획"]);
    expect(
      filterClientReportSearchItems(report, {
        workCategoryId: "operation",
        searchData: "불량 원인"
      })
    ).toEqual([]);
  });

  it("detects whether any search condition is active", () => {
    expect(hasClientReportSearchFilters({})).toBe(false);
    expect(hasClientReportSearchFilters({ title: "  " })).toBe(false);
    expect(hasClientReportSearchFilters({ currentContent: "점검" })).toBe(true);
  });

  it("searches department common current and next items with the same filters", () => {
    const departmentCommonContent = {
      week_start_date: "2026-07-27",
      current_importance: "very_high" as const,
      current_work_category_id: "operation",
      current_week_content: JSON.stringify({
        format: "department-common-items/v1",
        items: [
          {
            importance: "very_high",
            work_category_id: "operation",
            title: "신규화주 관련 미팅",
            content: "신규화주 관련 미팅 테스트",
            sort_order: 0
          }
        ]
      }),
      next_importance: "medium" as const,
      next_work_category_id: "operation",
      next_week_content: JSON.stringify({
        format: "department-common-items/v1",
        items: [
          {
            importance: "medium",
            work_category_id: "operation",
            title: "계약 일정 확인",
            content: "차주 계약 일정을 확인합니다.",
            sort_order: 0
          }
        ]
      })
    };

    expect(matchesDepartmentCommonSearch(departmentCommonContent, { query: "신규화주" })).toBe(true);
    expect(
      matchesDepartmentCommonSearch(departmentCommonContent, {
        workCategoryId: "operation",
        importance: "medium",
        nextContent: "계약 일정"
      })
    ).toBe(true);
    expect(matchesDepartmentCommonSearch(departmentCommonContent, { query: "물동량" })).toBe(false);
    expect(
      filterDepartmentCommonSearchItems(departmentCommonContent, { query: "신규화주" }).map((item) => item.title)
    ).toEqual(["신규화주 관련 미팅"]);
    expect(
      filterDepartmentCommonSearchItems(departmentCommonContent, { searchData: "계약 일정" }).map((item) => item.title)
    ).toEqual(["계약 일정 확인"]);
  });

  it("normalizes URL search parameters", () => {
    expect(
      parseClientReportSearchFilters({
        q: "  입고  ",
        search_data: "  불량 원인  ",
        importance: "high",
        date_from: "2026-08-31",
        date_to: "2026-08-01"
      })
    ).toEqual({
      query: "입고",
      searchData: "불량 원인",
      workCategoryId: undefined,
      importance: "high",
      title: undefined,
      currentContent: undefined,
      nextContent: undefined,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31"
    });
  });
});
