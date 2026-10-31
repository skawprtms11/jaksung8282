import { useMemo, useSyncExternalStore } from "react";
import { emptyHeaderScope, type HeaderScope } from "./header-scope";

const storageKeyPrefix = "tpl-header-scope:";
const changeEventName = "tpl-header-scope-change";

function storageKey(profileId: string) {
  return `${storageKeyPrefix}${profileId}`;
}

// useSyncExternalStore 스냅샷은 값이 같으면 같은 참조여야 하므로 원문 문자열을 그대로 돌려준다.
export function readStoredHeaderScopeRaw(profileId: string) {
  try {
    return window.sessionStorage.getItem(storageKey(profileId)) ?? "";
  } catch {
    return "";
  }
}

export function parseStoredHeaderScope(rawValue: string): HeaderScope {
  if (!rawValue) {
    return emptyHeaderScope;
  }
  try {
    const parsed = JSON.parse(rawValue) as { departmentId?: unknown; clientId?: unknown };
    return {
      departmentId: typeof parsed.departmentId === "string" ? parsed.departmentId : "",
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : ""
    };
  } catch {
    return emptyHeaderScope;
  }
}

export function readStoredHeaderScope(profileId: string) {
  return parseStoredHeaderScope(readStoredHeaderScopeRaw(profileId));
}

export function writeStoredHeaderScope(profileId: string, scope: HeaderScope) {
  try {
    const nextValue = JSON.stringify({ departmentId: scope.departmentId, clientId: scope.clientId });
    if (window.sessionStorage.getItem(storageKey(profileId)) === nextValue) {
      return;
    }
    window.sessionStorage.setItem(storageKey(profileId), nextValue);
    window.dispatchEvent(new Event(changeEventName));
  } catch {
    // 사파리 개인정보 보호 모드 등 저장소를 쓸 수 없으면 URL 조건만 사용한다.
  }
}

// 로그아웃하면 다음 로그인 사용자에게 조건이 이어지지 않도록 비운다.
export function clearStoredHeaderScopes() {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(storageKeyPrefix)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // 저장소 접근 불가 시 정리할 것도 없다.
  }
}

export function subscribeStoredHeaderScope(callback: () => void) {
  window.addEventListener(changeEventName, callback);
  return () => window.removeEventListener(changeEventName, callback);
}

export function useStoredHeaderScope(profileId: string) {
  const rawValue = useSyncExternalStore(
    subscribeStoredHeaderScope,
    () => readStoredHeaderScopeRaw(profileId),
    () => ""
  );
  return useMemo(() => parseStoredHeaderScope(rawValue), [rawValue]);
}
