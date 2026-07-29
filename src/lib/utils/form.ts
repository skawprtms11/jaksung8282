export type ActionResult<T = void> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export function formDataToObject(formData: FormData) {
  const result: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  formData.forEach((value, key) => {
    const current = result[key];
    if (Array.isArray(current)) {
      current.push(value);
    } else if (current) {
      result[key] = [current, value];
    } else {
      result[key] = value;
    }
  });
  return result;
}

export function safeErrorMessage(message?: string) {
  if (!message) {
    return "처리 중 오류가 발생했습니다.";
  }
  if (message.includes("duplicate") || message.includes("unique")) {
    return "이미 등록된 데이터가 있습니다.";
  }
  if (message.includes("permission") || message.includes("policy") || message.includes("RLS")) {
    return "처리 권한이 없습니다.";
  }
  if (/[가-힣]/.test(message) && message.length <= 160) {
    return message;
  }
  if (message.includes("weekly_client_report_items.title") || (message.includes("column") && message.includes("title"))) {
    return "Supabase SQL 013번을 먼저 실행하세요. 제목 컬럼이 아직 DB에 없습니다.";
  }
  if (message.includes("importance_level") || message.includes("very_high")) {
    return "Supabase SQL 013번을 먼저 실행하세요. 매우높음 중요도 값이 아직 DB에 없습니다.";
  }
  if (
    message.includes("current_importance") ||
    message.includes("current_work_category_id") ||
    message.includes("next_importance") ||
    message.includes("next_work_category_id")
  ) {
    return "Supabase SQL 016번을 먼저 실행하세요. 부서 공통자료의 중요도/업무구분 컬럼이 아직 DB에 없습니다.";
  }
  if (
    message.includes("weekly_report_item_requests") ||
    message.includes("target_key") ||
    message.includes("target_type") ||
    message.includes("department_submission_id")
  ) {
    return "Supabase SQL 023번을 먼저 실행하세요. 공통사항 요청등록 컬럼이 아직 DB에 없습니다.";
  }
  return "요청을 처리하지 못했습니다. 입력값과 권한을 확인하세요.";
}
