"use client";

import Link from "next/link";
import { useTransition, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { buildScopedHref } from "@/lib/auth/header-scope";
import { readStoredHeaderScope } from "@/lib/auth/header-scope-store";

// 링크 주소(href)는 고정해 조건이 바뀔 때마다 프리페치가 반복되지 않게 하고,
// 실제 이동 시점에만 저장된 헤더 조건을 붙인다. 새 탭·가운데 클릭·우클릭 메뉴는
// 브라우저가 DOM 의 href 를 쓰므로 직전에 조건 붙은 주소로 바꿔 둔다.
export function ScopedLink({
  href,
  profileId,
  className,
  prefetch,
  children,
  ...rest
}: {
  href: string;
  profileId: string;
  className?: string;
  prefetch?: boolean | "auto" | null;
  children: ReactNode | ((isNavigating: boolean) => ReactNode);
  "aria-current"?: "page";
  "aria-label"?: string;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();

  function scopedHref() {
    return buildScopedHref(href, readStoredHeaderScope(profileId));
  }

  function syncDomHref(event: MouseEvent<HTMLAnchorElement> | KeyboardEvent<HTMLAnchorElement>) {
    event.currentTarget.href = scopedHref();
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      syncDomHref(event);
      return;
    }
    event.preventDefault();
    const nextHref = scopedHref();
    startNavigation(() => {
      router.push(nextHref);
    });
  }

  return (
    <Link
      {...rest}
      href={href}
      prefetch={prefetch}
      className={className}
      onClick={handleClick}
      onMouseDown={syncDomHref}
      onContextMenu={syncDomHref}
      onKeyDown={syncDomHref}
      onMouseEnter={() => router.prefetch(scopedHref())}
      onFocus={() => router.prefetch(scopedHref())}
    >
      {typeof children === "function" ? children(isNavigating) : children}
    </Link>
  );
}
