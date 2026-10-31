import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const COLLECTION_IMAGE_BUCKET = "data-collections";
const SIGNED_URL_EXPIRES_IN_SECONDS = 3600;
const STORAGE_OBJECT_URL_PATTERN = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/data-collections\/([^?#]+)/;

function decodePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// 비공개 버킷 전환 전의 공개 URL, 화면에 내려간 서명 URL, 저장 경로 중 어느 형태든 버킷 내 저장 경로로 바꾼다.
// 이 버킷이 아닌 외부 URL이나 경로 탈출 시도는 null 로 거른다.
export function toCollectionImagePath(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const matched = trimmed.match(STORAGE_OBJECT_URL_PATTERN);
  const path = matched ? decodePath(matched[1]) : /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? null : trimmed;
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    return null;
  }
  return path;
}

// 서버 전용(service_role 사용). 저장 경로를 만료 1시간 서명 주소로 일괄 변환하는 조회 함수를 돌려준다.
export async function createCollectionImageUrlResolver(values: (string | null | undefined)[]) {
  const paths = Array.from(
    new Set(values.map((value) => toCollectionImagePath(value)).filter((path): path is string => Boolean(path)))
  );
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin.storage.from(COLLECTION_IMAGE_BUCKET).createSignedUrls(paths, SIGNED_URL_EXPIRES_IN_SECONDS);
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) {
          urlByPath.set(item.path, item.signedUrl);
        }
      }
    } catch {
      // 관리자 환경변수가 없으면 사진만 표시하지 않고 화면은 그대로 보여준다.
    }
  }
  return (value: string | null | undefined) => {
    const path = toCollectionImagePath(value);
    return path ? urlByPath.get(path) ?? null : null;
  };
}
