import { importanceValues, type Importance, type ItemPeriod } from "@/types/enums";

export type ClientReportSearchFilters = {
  query?: string;
  searchData?: string;
  workCategoryId?: string;
  importance?: Importance | "";
  title?: string;
  currentContent?: string;
  nextContent?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type SearchableClientReportItem = {
  item_period: ItemPeriod;
  importance: Importance;
  work_category_id: string;
  title: string;
  content: string;
};

export type SearchableClientReport = {
  week_start_date: string;
  weekly_client_report_items: SearchableClientReportItem[];
};

export type DepartmentCommonContentItem = {
  importance: Importance;
  work_category_id: string;
  title: string;
  content: string;
  sort_order: number;
};

export type SearchableDepartmentCommonContent = {
  week_start_date: string;
  current_importance: Importance;
  current_work_category_id: string;
  current_week_content: string;
  next_importance: Importance;
  next_work_category_id: string;
  next_week_content: string;
};

export const DEPARTMENT_COMMON_CONTENT_FORMAT = "department-common-items/v1";

type ClientReportSearchParamSource = {
  q?: string;
  search_data?: string;
  work_category_id?: string;
  importance?: string;
  title?: string;
  current_content?: string;
  next_content?: string;
  date_from?: string;
  date_to?: string;
};

export function parseClientReportSearchFilters(
  params: ClientReportSearchParamSource
): ClientReportSearchFilters {
  let dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(params.date_from ?? "") ? params.date_from : undefined;
  let dateTo = /^\d{4}-\d{2}-\d{2}$/.test(params.date_to ?? "") ? params.date_to : undefined;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    [dateFrom, dateTo] = [dateTo, dateFrom];
  }
  return {
    query: params.q?.trim() || undefined,
    searchData: params.search_data?.trim() || undefined,
    workCategoryId: params.work_category_id || undefined,
    importance: importanceValues.includes(params.importance as Importance)
      ? (params.importance as Importance)
      : undefined,
    title: params.title?.trim() || undefined,
    currentContent: params.current_content?.trim() || undefined,
    nextContent: params.next_content?.trim() || undefined,
    dateFrom,
    dateTo
  };
}

function includesTerm(value: string, term?: string) {
  const normalizedTerm = term?.trim().toLocaleLowerCase("ko");
  return !normalizedTerm || value.toLocaleLowerCase("ko").includes(normalizedTerm);
}

function normalizeImportance(value: unknown, fallback: Importance): Importance {
  return importanceValues.includes(value as Importance) ? (value as Importance) : fallback;
}

export function parseDepartmentCommonContentItems(
  value: string,
  fallbackImportance: Importance,
  fallbackCategoryId: string,
  fallbackTitle = "내용"
): DepartmentCommonContentItem[] {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmedValue) as {
      format?: string;
      items?: Array<Partial<DepartmentCommonContentItem>>;
    };
    if (parsed.format === DEPARTMENT_COMMON_CONTENT_FORMAT && Array.isArray(parsed.items)) {
      return parsed.items
        .map((item, index) => ({
          importance: normalizeImportance(item.importance, fallbackImportance),
          work_category_id:
            typeof item.work_category_id === "string" && item.work_category_id
              ? item.work_category_id
              : fallbackCategoryId,
          title: String(item.title ?? ""),
          content: String(item.content ?? ""),
          sort_order: Number.isFinite(item.sort_order) ? Number(item.sort_order) : index
        }))
        .sort((left, right) => left.sort_order - right.sort_order);
    }
  } catch {
    // Existing plain text content is treated as a single searchable item.
  }

  return [
    {
      importance: fallbackImportance,
      work_category_id: fallbackCategoryId,
      title: fallbackTitle,
      content: trimmedValue,
      sort_order: 0
    }
  ];
}

export function hasClientReportSearchFilters(filters: ClientReportSearchFilters) {
  return Object.values(filters).some((value) => Boolean(value?.trim()));
}

export function matchesClientReportSearch(
  report: SearchableClientReport,
  filters: ClientReportSearchFilters
) {
  if (filters.dateFrom && report.week_start_date < filters.dateFrom) {
    return false;
  }
  if (filters.dateTo && report.week_start_date > filters.dateTo) {
    return false;
  }

  const items = report.weekly_client_report_items;
  if (filters.query && !items.some((item) => includesTerm(item.title, filters.query))) {
    return false;
  }

  const hasItemMetadataFilter = Boolean(
    filters.workCategoryId || filters.importance || filters.title?.trim() || filters.searchData?.trim()
  );
  if (
    hasItemMetadataFilter &&
    !items.some(
      (item) =>
        (!filters.workCategoryId || item.work_category_id === filters.workCategoryId) &&
        (!filters.importance || item.importance === filters.importance) &&
        includesTerm(item.title, filters.title) &&
        (!filters.searchData || includesTerm(item.title, filters.searchData) || includesTerm(item.content, filters.searchData))
    )
  ) {
    return false;
  }

  if (
    filters.currentContent &&
    !items.some(
      (item) => item.item_period === "current" && includesTerm(item.content, filters.currentContent)
    )
  ) {
    return false;
  }
  if (
    filters.nextContent &&
    !items.some((item) => item.item_period === "next" && includesTerm(item.content, filters.nextContent))
  ) {
    return false;
  }

  return true;
}

export function filterClientReportSearchItems<TItem extends SearchableClientReportItem>(
  report: { week_start_date: string; weekly_client_report_items: TItem[] },
  filters: ClientReportSearchFilters
): TItem[] {
  if (!matchesClientReportSearch(report, filters)) {
    return [];
  }

  const hasMetadataFilter = Boolean(
    filters.workCategoryId || filters.importance || filters.title?.trim() || filters.searchData?.trim()
  );
  const hasPeriodContentFilter = Boolean(filters.currentContent?.trim() || filters.nextContent?.trim());
  const hasItemFilter = Boolean(filters.query?.trim() || hasMetadataFilter || hasPeriodContentFilter);
  if (!hasItemFilter) {
    return report.weekly_client_report_items;
  }

  return report.weekly_client_report_items.filter((item) => {
    if (filters.query && !includesTerm(item.title, filters.query)) {
      return false;
    }
    if (
      hasMetadataFilter &&
      ((filters.workCategoryId && item.work_category_id !== filters.workCategoryId) ||
        (filters.importance && item.importance !== filters.importance) ||
        !includesTerm(item.title, filters.title) ||
        (filters.searchData &&
          !includesTerm(item.title, filters.searchData) &&
          !includesTerm(item.content, filters.searchData)))
    ) {
      return false;
    }
    if (hasPeriodContentFilter) {
      if (item.item_period === "current") {
        return Boolean(filters.currentContent && includesTerm(item.content, filters.currentContent));
      }
      return Boolean(filters.nextContent && includesTerm(item.content, filters.nextContent));
    }
    return true;
  });
}

export function matchesDepartmentCommonSearch(
  content: SearchableDepartmentCommonContent,
  filters: ClientReportSearchFilters
) {
  const currentItems = parseDepartmentCommonContentItems(
    content.current_week_content,
    content.current_importance,
    content.current_work_category_id
  );
  const nextItems = parseDepartmentCommonContentItems(
    content.next_week_content,
    content.next_importance,
    content.next_work_category_id
  );

  return matchesClientReportSearch(
    {
      week_start_date: content.week_start_date,
      weekly_client_report_items: [
        ...currentItems.map((item) => ({ ...item, item_period: "current" as const })),
        ...nextItems.map((item) => ({ ...item, item_period: "next" as const }))
      ]
    },
    filters
  );
}

export function filterDepartmentCommonSearchItems(
  content: SearchableDepartmentCommonContent,
  filters: ClientReportSearchFilters
) {
  const currentItems = parseDepartmentCommonContentItems(
    content.current_week_content,
    content.current_importance,
    content.current_work_category_id
  ).map((item) => ({ ...item, item_period: "current" as const }));
  const nextItems = parseDepartmentCommonContentItems(
    content.next_week_content,
    content.next_importance,
    content.next_work_category_id
  ).map((item) => ({ ...item, item_period: "next" as const }));

  return filterClientReportSearchItems(
    {
      week_start_date: content.week_start_date,
      weekly_client_report_items: [...currentItems, ...nextItems]
    },
    filters
  );
}
