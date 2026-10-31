"use client";

import type { ReactNode } from "react";
import { signOutAction } from "@/actions/auth";
import { clearStoredHeaderScopes } from "@/lib/auth/header-scope-store";

// 로그아웃 요청을 보내기 직전에 헤더 조건 저장값을 지운다. 로그아웃이 실패해도 조건만 초기화될 뿐이라
// 안전하고, 성공 후에는 페이지가 바뀌어 정리할 기회가 없으므로 제출 시점에 처리한다.
export function SignOutForm({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form action={signOutAction} onSubmit={() => clearStoredHeaderScopes()} className={className}>
      {children}
    </form>
  );
}
