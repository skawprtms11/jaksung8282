export const NOTICE_CONTENT_FORMAT = "tpl-notice-content/v1";

export type NoticeCollectionStatus = {
  department_id: string;
  department_name: string;
  is_completed: boolean;
  confirmer_name: string;
  updated_at?: string;
};

export type ParsedNoticeContent = {
  detail: string;
  note: string;
  collectionStatuses: NoticeCollectionStatus[];
};

type NoticeContentPayload = {
  format?: string;
  detail?: unknown;
  note?: unknown;
  collectionStatuses?: unknown;
};

function normalizeCollectionStatus(value: unknown): NoticeCollectionStatus | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<Record<keyof NoticeCollectionStatus, unknown>>;
  const departmentId = typeof row.department_id === "string" ? row.department_id : "";
  const departmentName = typeof row.department_name === "string" ? row.department_name : "";
  if (!departmentId || !departmentName) {
    return null;
  }
  return {
    department_id: departmentId,
    department_name: departmentName,
    is_completed: Boolean(row.is_completed),
    confirmer_name: typeof row.confirmer_name === "string" ? row.confirmer_name : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined
  };
}

export function parseNoticeContent(content: string): ParsedNoticeContent {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return { detail: "", note: "", collectionStatuses: [] };
  }

  try {
    const parsed = JSON.parse(trimmedContent) as NoticeContentPayload;
    if (parsed.format === NOTICE_CONTENT_FORMAT) {
      const collectionStatuses = Array.isArray(parsed.collectionStatuses)
        ? parsed.collectionStatuses.map(normalizeCollectionStatus).filter((row): row is NoticeCollectionStatus => Boolean(row))
        : [];
      return {
        detail: typeof parsed.detail === "string" ? parsed.detail : "",
        note: typeof parsed.note === "string" ? parsed.note : "",
        collectionStatuses
      };
    }
  } catch {
    return { detail: trimmedContent, note: "", collectionStatuses: [] };
  }

  return { detail: trimmedContent, note: "", collectionStatuses: [] };
}

export function serializeNoticeContent(content: ParsedNoticeContent) {
  return JSON.stringify({
    format: NOTICE_CONTENT_FORMAT,
    detail: content.detail.trim(),
    note: content.note.trim(),
    collectionStatuses: content.collectionStatuses.map((row) => ({
      department_id: row.department_id,
      department_name: row.department_name,
      is_completed: row.is_completed,
      confirmer_name: row.confirmer_name.trim(),
      updated_at: row.updated_at
    }))
  });
}
