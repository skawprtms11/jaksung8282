import type { Json } from "@/types/database";

// 취합양식 템플릿(jsonb)에서 컬럼 목록을 안전하게 복원한다.
export function normalizeCollectionColumns(template: Json): string[] {
  if (template && typeof template === "object" && !Array.isArray(template)) {
    const value = template as { columns?: unknown };
    if (Array.isArray(value.columns)) {
      return value.columns.map((column) => String(column ?? ""));
    }
  }
  return [];
}

// 부서 작성 행(jsonb)을 컬럼 수에 맞춰 복원한다.
export function normalizeEntryRows(rows: Json, columnCount: number): string[][] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => (Array.isArray(row) ? String(row[index] ?? "") : ""))
  );
}

// 컬럼 열너비(px, 0 = 자동)를 컬럼 수에 맞춰 복원한다.
export function normalizeCollectionWidths(template: Json, columnCount: number): number[] {
  if (template && typeof template === "object" && !Array.isArray(template)) {
    const value = template as { widths?: unknown };
    if (Array.isArray(value.widths)) {
      const widthList = value.widths as unknown[];
      return Array.from({ length: columnCount }, (_, index) => {
        const width = Number(widthList[index] ?? 0);
        return Number.isFinite(width) && width > 0 ? Math.min(width, 2000) : 0;
      });
    }
  }
  return Array(columnCount).fill(0);
}
