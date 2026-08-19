export const appRoles = ["admin", "department_head", "manager", "client_owner"] as const;
export type AppRole = (typeof appRoles)[number];

export const clientReportStatuses = ["draft", "submitted", "approved", "rejected"] as const;
export type ClientReportStatus = (typeof clientReportStatuses)[number];

export const departmentSubmissionStatuses = [
  "draft",
  "submitted_to_division",
  "division_approved",
  "division_rejected"
] as const;
export type DepartmentSubmissionStatus = (typeof departmentSubmissionStatuses)[number];

export const itemPeriods = ["current", "next"] as const;
export type ItemPeriod = (typeof itemPeriods)[number];

export const importanceValues = ["very_high", "high", "medium", "low"] as const;
export type Importance = (typeof importanceValues)[number];

export const noticeTypes = ["general", "important", "urgent", "system"] as const;
export type NoticeType = (typeof noticeTypes)[number];

export const volumeTypes = ["inbound", "outbound", "inventory", "order", "return", "etc"] as const;
export type VolumeType = (typeof volumeTypes)[number];

export const volumeUnits = ["EA", "BOX", "CASE", "PLT", "case_count", "TON", "CBM", "etc"] as const;
export type VolumeUnit = (typeof volumeUnits)[number];

// 물동량은 EA 단위로만 등록한다. 과거 데이터도 EA로 통일되어 있다.
export const VOLUME_UNIT = "EA" as const satisfies VolumeUnit;

export const userRegistrationStatuses = ["pending", "approved", "rejected"] as const;
export type UserRegistrationStatus = (typeof userRegistrationStatuses)[number];
