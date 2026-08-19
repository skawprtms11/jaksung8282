import { z } from "zod";
import {
  appRoles,
  clientReportStatuses,
  departmentSubmissionStatuses,
  importanceValues,
  itemPeriods,
  noticeTypes,
  volumeTypes,
  VOLUME_UNIT
} from "@/types/enums";

export const idSchema = z.string().uuid("올바른 ID가 아닙니다.");
export const optionalIdSchema = z.preprocess(
  (value) => (value === "" || value === null || typeof value === "undefined" ? undefined : value),
  idSchema.optional()
);
export const nullableIdSchema = z.preprocess(
  (value) => (value === "" || value === null || typeof value === "undefined" ? null : value),
  idSchema.nullable()
);
const formBooleanSchema = z.preprocess((value) => {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return value;
}, z.coerce.boolean());

export const employeeNoPattern = /^[A-Za-z0-9-]+$/;
export const employeeNoSchema = z
  .string()
  .trim()
  .min(1, "사번을 입력하세요.")
  .max(50)
  .regex(employeeNoPattern, "사번은 영문, 숫자, 하이픈만 사용할 수 있습니다.");

export const weekSelectionSchema = z.object({
  report_year: z.coerce.number().int().min(2020).max(2100),
  report_month: z.coerce.number().int().min(1).max(12),
  week_of_month: z.coerce.number().int().min(1).max(6),
  week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  week_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const noticeSchema = z.object({
  id: optionalIdSchema,
  notice_type: z.enum(noticeTypes),
  title: z.string().trim().min(1, "제목을 입력하세요.").max(200),
  content: z.string().trim().min(1, "내용을 입력하세요."),
  is_pinned: formBooleanSchema.default(false),
  publish_start_date: z.string().optional().nullable(),
  publish_end_date: z.string().optional().nullable(),
  is_active: formBooleanSchema.default(true)
});

export const noticeCommentSchema = z.object({
  id: optionalIdSchema,
  notice_id: idSchema,
  parent_id: optionalIdSchema,
  content: z.string().trim().min(1, "댓글 내용을 입력하세요.").max(2000, "댓글은 2,000자 이하로 입력하세요.")
});

export const reportItemRequestSchema = z.object({
  id: optionalIdSchema,
  target_type: z.enum(["client_item", "department_common"]).default("client_item"),
  report_item_id: optionalIdSchema,
  department_submission_id: optionalIdSchema,
  item_period: z.enum(itemPeriods).optional(),
  item_sort_order: z.coerce.number().int().min(0).optional(),
  request_content: z.string().trim().min(1, "요청사항을 입력하세요.").max(2000, "요청사항은 2,000자 이하로 입력하세요.")
}).superRefine((value, ctx) => {
  if (value.target_type === "client_item" && !value.report_item_id) {
    ctx.addIssue({ code: "custom", path: ["report_item_id"], message: "화주자료 항목을 확인하세요." });
  }
  if (value.target_type === "department_common" && (!value.department_submission_id || !value.item_period || typeof value.item_sort_order !== "number")) {
    ctx.addIssue({ code: "custom", path: ["department_submission_id"], message: "공통사항 항목을 확인하세요." });
  }
});

export const reportItemRequestResultSchema = z.object({
  id: idSchema,
  result_content: z.string().trim().min(1, "처리결과를 입력하세요.").max(2000, "처리결과는 2,000자 이하로 입력하세요.")
});

export const departmentSchema = z.object({
  id: optionalIdSchema,
  department_code: z.string().trim().min(1, "부서코드를 입력하세요.").max(30),
  department_name: z.string().trim().min(1, "부서명을 입력하세요.").max(100),
  notes: z.string().trim().optional().nullable(),
  is_active: formBooleanSchema.default(true),
  sort_order: z.coerce.number().int().min(0).default(0)
});

export const clientSchema = z.object({
  id: optionalIdSchema,
  client_code: z.string().trim().min(1, "화주코드를 입력하세요.").max(30),
  client_name: z.string().trim().min(1, "화주명을 입력하세요.").max(100),
  notes: z.string().trim().optional().nullable(),
  department_id: nullableIdSchema,
  is_active: formBooleanSchema.default(true),
  sort_order: z.coerce.number().int().min(0).default(0)
});

export const departmentClientSchema = clientSchema.extend({
  department_id: idSchema
});

export const userSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().trim().email("올바른 이메일을 입력하세요."),
  employee_no: employeeNoSchema,
  full_name: z.string().trim().min(1, "성함을 입력하세요.").max(100),
  department_id: optionalIdSchema,
  app_role: z.enum(appRoles),
  notes: z.string().trim().optional().nullable(),
  is_active: formBooleanSchema.default(true),
  invite: formBooleanSchema.default(false)
});

export const reportItemSchema = z.object({
  id: z.string().uuid().optional(),
  item_period: z.enum(itemPeriods),
  importance: z.enum(importanceValues),
  work_category_id: idSchema,
  title: z.string().trim().min(1, "제목을 입력하세요.").max(120, "제목은 120자 이하로 입력하세요."),
  content: z.string().trim().min(1, "내용을 입력하세요."),
  sort_order: z.coerce.number().int().min(0)
});

export const volumeSchema = z.object({
  id: z.string().uuid().optional(),
  volume_type: z.enum(volumeTypes),
  quantity: z.coerce.number().min(0, "수량은 0 이상이어야 합니다."),
  unit: z.literal(VOLUME_UNIT),
  custom_unit: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  sort_order: z.coerce.number().int().min(0)
});

export const clientReportSchema = weekSelectionSchema.extend({
  id: optionalIdSchema,
  department_id: idSchema,
  client_id: idSchema,
  status: z.enum(clientReportStatuses).default("draft"),
  no_special_issue: formBooleanSchema.default(false),
  items: z.array(reportItemSchema),
  volumes: z.array(volumeSchema)
}).superRefine((value, ctx) => {
  if (value.status !== "draft" && !value.no_special_issue && value.items.length === 0) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "특이사항 없음이 아니면 최소 1개 항목이 필요합니다." });
  }
});

export const departmentContentSchema = z.object({
  section_type: z.enum(["common", "facility", "vacancy", "holiday_work"]),
  current_importance: z.enum(importanceValues).default("medium"),
  current_work_category_id: idSchema,
  current_week_content: z.string().trim().optional().default(""),
  next_importance: z.enum(importanceValues).default("medium"),
  next_work_category_id: idSchema,
  next_week_content: z.string().trim().optional().default("")
});

export const departmentSubmissionSchema = weekSelectionSchema.extend({
  id: optionalIdSchema,
  department_id: idSchema,
  status: z.enum(departmentSubmissionStatuses).default("draft"),
  exception_reason: z.string().trim().optional().nullable(),
  contents: z.array(departmentContentSchema).min(4, "4개 공통자료 탭을 모두 저장하세요.")
});
