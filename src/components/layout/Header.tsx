"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Building2, LogOut, PackageSearch, PanelLeftOpen, UserRound } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { pickDefaultClientId, pickDefaultDepartmentId } from "@/lib/auth/default-scope";
import {
  getHeaderScopeMode,
  resolveEffectiveDepartmentId,
  resolveScopeRestore,
  shouldRestoreHeaderScope,
  toPersistedHeaderScope,
  type HeaderScopeMode
} from "@/lib/auth/header-scope";
import { useStoredHeaderScope, writeStoredHeaderScope } from "@/lib/auth/header-scope-store";
import { SignOutForm } from "./SignOutForm";
import type { ProfileSummary } from "@/lib/auth/permissions";
import { canViewMeetingMaterials, roleLabel } from "@/lib/auth/permissions";

export type HeaderDepartmentFilterOption = { id: string; department_name: string };
export type HeaderClientFilterOption = { id: string; client_name: string; department_id: string };
export type HeaderFilterOptions = {
  departments: HeaderDepartmentFilterOption[];
  clients: HeaderClientFilterOption[];
  assignedClientIds: string[];
};

const routeMeta: Record<string, { title: string; description: string }> = {
  "/notices": {
    title: "사업부 공지사항",
    description: "공지와 안내를 빠르게 확인합니다."
  },
  "/data-collections": {
    title: "자료취합",
    description: "취합 양식을 등록하고 공유합니다."
  },
  "/meeting-materials": {
    title: "부서별 회의자료",
    description: "주간자료와 물동량 증감을 회의용으로 봅니다."
  },
  "/department-reports": {
    title: "부서별 자료 작성",
    description: "화주자료 검토 후 부서자료를 제출합니다."
  },
  "/client-reports": {
    title: "화주별 자료 작성",
    description: "실시사항, 예정사항, 물동량을 등록합니다."
  },
  "/admin/departments": {
    title: "부서마스터",
    description: "부서 정보와 사용 여부를 관리합니다."
  },
  "/admin/clients": {
    title: "화주마스터",
    description: "화주와 담당자 배정을 관리합니다."
  },
  "/admin/users": {
    title: "사용자관리",
    description: "사용자, 권한, 계정상태를 관리합니다."
  },
  "/mini-game": {
    title: "흰둥이의 산책",
    description: "잠깐 쉬어가며 산책 점수 랭킹에 도전합니다."
  }
};

const emptyFilterOptions: HeaderFilterOptions = { departments: [], clients: [], assignedClientIds: [] };
const filterCacheTtlMs = 10 * 60 * 1000;

function hasFilterOptions(options: HeaderFilterOptions) {
  return options.departments.length > 0 || options.clients.length > 0;
}

function sortHeaderFilterOptions(options: HeaderFilterOptions): HeaderFilterOptions {
  return {
    departments: options.departments,
    clients: [...options.clients].sort((left, right) => left.client_name.localeCompare(right.client_name, "ko")),
    assignedClientIds: options.assignedClientIds
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCachedFilterOptions(value: unknown): value is HeaderFilterOptions {
  if (!isPlainObject(value) || !Array.isArray(value.departments) || !Array.isArray(value.clients) || !Array.isArray(value.assignedClientIds)) {
    return false;
  }

  return (
    value.departments.every(
      (department) =>
        isPlainObject(department) &&
        typeof department.id === "string" &&
        typeof department.department_name === "string"
    ) &&
    value.clients.every(
      (client) =>
        isPlainObject(client) &&
        typeof client.id === "string" &&
        typeof client.client_name === "string" &&
        typeof client.department_id === "string"
    ) &&
    value.assignedClientIds.every((clientId) => typeof clientId === "string")
  );
}

function readCachedFilterOptions(profileId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(`tpl-header-filters:${profileId}`);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue) as { savedAt?: unknown; options?: unknown };
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > filterCacheTtlMs) {
      return null;
    }
    return isCachedFilterOptions(parsed.options) ? sortHeaderFilterOptions(parsed.options) : null;
  } catch {
    return null;
  }
}

function writeCachedFilterOptions(profileId: string, options: HeaderFilterOptions) {
  try {
    window.sessionStorage.setItem(
      `tpl-header-filters:${profileId}`,
      JSON.stringify({ savedAt: Date.now(), options })
    );
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

function getRouteMeta(pathname: string) {
  if (pathname.startsWith("/notices/")) {
    return {
      title: "공지사항 상세",
      description: "공지 내용을 확인하고 필요한 경우 수정합니다."
    };
  }
  return routeMeta[pathname] ?? {
    title: "TPL 주간자료",
    description: "주간 업무자료를 작성하고 검토합니다."
  };
}

const scopeModeNotices: Record<HeaderScopeMode, string> = {
  full: "",
  department: "이 화면은 부서 조건만 적용",
  none: "이 화면은 헤더 조건 미적용"
};

function HeaderScopeFilter({
  pathname,
  profile,
  options,
  scopeMode
}: {
  pathname: string;
  profile: ProfileSummary;
  options: HeaderFilterOptions;
  scopeMode: HeaderScopeMode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [loadedOptions, setLoadedOptions] = useState<HeaderFilterOptions>(() => {
    if (hasFilterOptions(options)) {
      return sortHeaderFilterOptions(options);
    }
    return emptyFilterOptions;
  });
  const [isLoadingOptions, setIsLoadingOptions] = useState(() => !hasFilterOptions(options));
  const storedScope = useStoredHeaderScope(profile.id);
  const fallbackScopeKeyRef = useRef("");
  const hasLoadedOptions = hasFilterOptions(loadedOptions);
  const activeOptions = hasLoadedOptions ? loadedOptions : emptyFilterOptions;
  const isScopeApplied = scopeMode !== "none";
  const isClientScopeApplied = scopeMode === "full";
  const urlDepartmentId = searchParams.get("department_id") ?? "";
  const urlClientId = searchParams.get("client_id") ?? "";
  // 조건 미적용 화면(관리 화면 등)의 department_id 는 그 화면 자체 필터라 헤더에는 저장된 조건을 보여준다.
  const selectedDepartmentId = isScopeApplied ? urlDepartmentId : storedScope.departmentId;
  const selectedClientId = isScopeApplied ? urlClientId : storedScope.clientId;
  const isAdminUser = profile.app_role === "admin";
  const isClientWritePage = pathname === "/client-reports";
  const isDepartmentReportPage = pathname === "/department-reports";
  const requiresDepartmentSelection = isDepartmentReportPage || isClientWritePage;
  const activeMeetingTab = searchParams.get("tab") ?? "collection";
  const isMeetingMaterialsTab = pathname === "/meeting-materials" && activeMeetingTab === "materials";
  const restrictMeetingMaterialsAll =
    pathname === "/meeting-materials" &&
    activeMeetingTab === "materials" &&
    !selectedClientId &&
    profile.app_role !== "admin";
  const preferredDepartmentId = pickDefaultDepartmentId(activeOptions.departments, profile.app_role);
  const departmentIds = useMemo(() => activeOptions.departments.map((department) => department.id), [activeOptions.departments]);
  const effectiveDepartmentId = resolveEffectiveDepartmentId({
    role: profile.app_role,
    selectedDepartmentId,
    preferredDepartmentId,
    departmentIds,
    requiresDepartment: restrictMeetingMaterialsAll || requiresDepartmentSelection
  });
  const pendingRestore = isScopeApplied && shouldRestoreHeaderScope(pathname)
    ? resolveScopeRestore({
        urlScope: { departmentId: urlDepartmentId, clientId: urlClientId },
        storedScope
      })
    : null;
  const hasPendingRestore = pendingRestore !== null;
  const restoreDepartmentId = pendingRestore?.departmentId ?? "";
  const restoreClientId = pendingRestore?.clientId ?? "";
  const effectiveDepartmentIndex = activeOptions.departments.findIndex((department) => department.id === effectiveDepartmentId);
  const previousDepartment = isMeetingMaterialsTab && effectiveDepartmentIndex > 0 ? activeOptions.departments[effectiveDepartmentIndex - 1] : null;
  const nextDepartment =
    isMeetingMaterialsTab && effectiveDepartmentIndex >= 0 && effectiveDepartmentIndex < activeOptions.departments.length - 1
      ? activeOptions.departments[effectiveDepartmentIndex + 1]
      : null;
  const assignedClientIdSet = useMemo(() => new Set(activeOptions.assignedClientIds), [activeOptions.assignedClientIds]);
  const departmentScopedClients = useMemo(
    () =>
      activeOptions.clients.filter((client) => {
        if (effectiveDepartmentId && client.department_id !== effectiveDepartmentId) {
          return false;
        }
        if (profile.app_role === "client_owner" && isClientWritePage) {
          return assignedClientIdSet.has(client.id);
        }
        return true;
      }),
    [activeOptions.clients, assignedClientIdSet, effectiveDepartmentId, isClientWritePage, profile.app_role]
  );
  // 전체부서 모드에서는 여러 부서에 연결된 화주가 department_client_links 기준으로 같은 id로 반복 등장하므로 표시용으로만 dedup한다.
  const clientOptions = useMemo(() => {
    const seenClientIds = new Set<string>();
    return departmentScopedClients.filter((client) => {
      if (seenClientIds.has(client.id)) {
        return false;
      }
      seenClientIds.add(client.id);
      return true;
    });
  }, [departmentScopedClients]);
  const requiresClientSelection = isClientWritePage;
  const fallbackClientId = requiresClientSelection && effectiveDepartmentId ? pickDefaultClientId(departmentScopedClients, profile.app_role) : "";
  const effectiveClientId = selectedClientId || fallbackClientId;

  const adjacentDepartmentHrefs = useMemo(() => {
    if (!isMeetingMaterialsTab) {
      return { previous: null, next: null };
    }

    const buildHref = (departmentId: string) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("department_id", departmentId);
      nextParams.delete("client_id");
      return `${pathname}?${nextParams.toString()}`;
    };

    return {
      previous: previousDepartment ? buildHref(previousDepartment.id) : null,
      next: nextDepartment ? buildHref(nextDepartment.id) : null
    };
  }, [isMeetingMaterialsTab, nextDepartment, pathname, previousDepartment, searchParams]);

  useEffect(() => {
    if (hasLoadedOptions) {
      return;
    }

    const cachedOptions = readCachedFilterOptions(profile.id);
    if (cachedOptions) {
      const timeoutId = window.setTimeout(() => {
        setLoadedOptions(cachedOptions);
        setIsLoadingOptions(false);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    fetch("/api/header-filters", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("failed");
        }
        return response.json() as Promise<HeaderFilterOptions>;
      })
      .then((nextOptions) => {
        const sortedOptions = sortHeaderFilterOptions(nextOptions);
        writeCachedFilterOptions(profile.id, sortedOptions);
        setLoadedOptions(sortedOptions);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadedOptions(emptyFilterOptions);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingOptions(false);
        }
      });

    return () => controller.abort();
  }, [hasLoadedOptions, profile.id]);

  const replaceFilterInUrl = useCallback((nextDepartmentId: string, nextClientId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextDepartmentId) {
      nextParams.set("department_id", nextDepartmentId);
    } else {
      nextParams.delete("department_id");
    }
    if (nextClientId) {
      nextParams.set("client_id", nextClientId);
    } else {
      nextParams.delete("client_id");
    }
    const query = nextParams.toString();
    if (query === searchParams.toString()) {
      return;
    }
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  // 사용자가 직접 바꾼 조건은 URL 반영 전에 저장해, 이동 중에도 저장값이 새 조건을 가리키게 한다.
  const updateFilter = useCallback((nextDepartmentId: string, nextClientId: string) => {
    writeStoredHeaderScope(
      profile.id,
      toPersistedHeaderScope({
        role: profile.app_role,
        scope: { departmentId: nextDepartmentId, clientId: nextClientId },
        departmentIds,
        clients: activeOptions.clients,
        assignedClientIds: activeOptions.assignedClientIds
      })
    );
    replaceFilterInUrl(nextDepartmentId, nextClientId);
  }, [activeOptions.assignedClientIds, activeOptions.clients, departmentIds, profile.app_role, profile.id, replaceFilterInUrl]);

  const replaceDefaultFilterInHistory = useCallback((nextDepartmentId: string, nextClientId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("department_id", nextDepartmentId);
    if (nextClientId) {
      nextParams.set("client_id", nextClientId);
    } else {
      nextParams.delete("client_id");
    }
    const query = nextParams.toString();
    if (query !== searchParams.toString()) {
      // 화면이 자동으로 채운 기본값은 사용자가 고른 조건이 아니므로 다음 화면으로 넘기지 않는다.
      fallbackScopeKeyRef.current = `${nextDepartmentId}|${nextClientId}`;
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!hasPendingRestore || isPending) {
      return;
    }
    replaceFilterInUrl(restoreDepartmentId, restoreClientId);
  }, [hasPendingRestore, isPending, replaceFilterInUrl, restoreClientId, restoreDepartmentId]);

  useEffect(() => {
    if (!isScopeApplied || !hasLoadedOptions || (!urlDepartmentId && !urlClientId)) {
      return;
    }
    if (fallbackScopeKeyRef.current === `${urlDepartmentId}|${urlClientId}`) {
      return;
    }
    writeStoredHeaderScope(
      profile.id,
      toPersistedHeaderScope({
        role: profile.app_role,
        scope: { departmentId: urlDepartmentId, clientId: urlClientId },
        departmentIds,
        clients: activeOptions.clients,
        assignedClientIds: activeOptions.assignedClientIds
      })
    );
  }, [
    activeOptions.assignedClientIds,
    activeOptions.clients,
    departmentIds,
    hasLoadedOptions,
    isScopeApplied,
    profile.app_role,
    profile.id,
    urlClientId,
    urlDepartmentId
  ]);

  useEffect(() => {
    if (!hasLoadedOptions || isLoadingOptions || isPending || hasPendingRestore) {
      return;
    }
    if (!requiresDepartmentSelection && !restrictMeetingMaterialsAll) {
      return;
    }
    if (!effectiveDepartmentId) {
      return;
    }
    const shouldApplyDepartment = !selectedDepartmentId;
    const shouldApplyClient = requiresClientSelection && !selectedClientId && Boolean(fallbackClientId);
    if (!shouldApplyDepartment && !shouldApplyClient) {
      return;
    }

    replaceDefaultFilterInHistory(effectiveDepartmentId, shouldApplyClient ? fallbackClientId : selectedClientId);
  }, [
    effectiveDepartmentId,
    fallbackClientId,
    hasLoadedOptions,
    hasPendingRestore,
    isLoadingOptions,
    isPending,
    requiresClientSelection,
    requiresDepartmentSelection,
    restrictMeetingMaterialsAll,
    selectedClientId,
    selectedDepartmentId,
    replaceDefaultFilterInHistory
  ]);

  function handleDepartmentChange(nextDepartmentId: string) {
    const nextClientStillVisible = activeOptions.clients.some(
      (client) =>
        client.id === selectedClientId &&
        (!nextDepartmentId || client.department_id === nextDepartmentId) &&
        (profile.app_role !== "client_owner" || !isClientWritePage || assignedClientIdSet.has(client.id))
    );
    updateFilter(nextDepartmentId, nextClientStillVisible ? selectedClientId : "");
  }

  function handleDepartmentPager(nextDepartmentId: string) {
    updateFilter(nextDepartmentId, "");
  }

  const scopeNotice = scopeModeNotices[scopeMode];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className={`filter-pill min-w-0 ${isScopeApplied ? "cursor-pointer" : "opacity-60"}`}>
        <Building2 className="h-4 w-4 shrink-0 text-[#007050]" aria-hidden="true" />
        <span className="cap whitespace-nowrap">소속부서</span>
        <span className="sr-only">부서 필터</span>
        <select
          value={effectiveDepartmentId}
          onChange={(event) => handleDepartmentChange(event.target.value)}
          disabled={!isScopeApplied || isPending || isLoadingOptions}
          className="h-6 w-28 min-w-0 cursor-pointer appearance-none bg-transparent text-sm font-black text-[#012241] outline-none disabled:cursor-not-allowed sm:w-32"
          aria-label="부서 필터"
        >
          {isLoadingOptions ? <option value="">부서 불러오는 중</option> : null}
          <option value="" disabled={restrictMeetingMaterialsAll || requiresDepartmentSelection || !isAdminUser}>
            {requiresDepartmentSelection ? "부서 선택" : "전체 부서"}
          </option>
          {activeOptions.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.department_name}
            </option>
          ))}
        </select>
      </label>
      <label className={`filter-pill min-w-0 ${isClientScopeApplied ? "cursor-pointer" : "opacity-60"}`}>
        <PackageSearch className="h-4 w-4 shrink-0 text-[#007050]" aria-hidden="true" />
        <span className="cap whitespace-nowrap">화주</span>
        <span className="sr-only">화주 필터</span>
        <select
          value={effectiveClientId}
          onChange={(event) => updateFilter(effectiveDepartmentId, event.target.value)}
          disabled={!isClientScopeApplied || isPending || isLoadingOptions}
          className="h-6 w-28 min-w-0 cursor-pointer appearance-none bg-transparent text-sm font-black text-[#012241] outline-none disabled:cursor-not-allowed sm:w-32"
          aria-label="화주 필터"
        >
          {isLoadingOptions ? <option value="">화주 불러오는 중</option> : null}
          <option value="" disabled={requiresClientSelection}>
            {requiresClientSelection ? "화주 선택" : "전체 화주"}
          </option>
          {clientOptions.map((client) => (
            <option key={client.id} value={client.id}>
              {client.client_name}
            </option>
          ))}
        </select>
      </label>
      {isMeetingMaterialsTab ? (
        <div className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1.5 shadow-[0_8px_20px_rgba(1,34,65,0.06)]" aria-label="부서 자료 이동">
          <button
            type="button"
            onClick={() => (previousDepartment ? handleDepartmentPager(previousDepartment.id) : undefined)}
            onFocus={() => (adjacentDepartmentHrefs.previous ? router.prefetch(adjacentDepartmentHrefs.previous) : undefined)}
            onMouseEnter={() => (adjacentDepartmentHrefs.previous ? router.prefetch(adjacentDepartmentHrefs.previous) : undefined)}
            onTouchStart={() => (adjacentDepartmentHrefs.previous ? router.prefetch(adjacentDepartmentHrefs.previous) : undefined)}
            disabled={!previousDepartment || isPending || isLoadingOptions}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-full bg-[#f1f5f3] text-[#007050] transition hover:-translate-x-0.5 hover:bg-[#e2ebe7] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-x-0"
            aria-label={previousDepartment ? `이전 부서 ${previousDepartment.department_name} 조회` : "이전 부서 없음"}
            title={previousDepartment ? `이전 부서: ${previousDepartment.department_name}` : "이전 부서 없음"}
          >
            <span className="text-[15px] leading-none" aria-hidden="true">
              ◀
            </span>
          </button>
          <button
            type="button"
            onClick={() => (nextDepartment ? handleDepartmentPager(nextDepartment.id) : undefined)}
            onFocus={() => (adjacentDepartmentHrefs.next ? router.prefetch(adjacentDepartmentHrefs.next) : undefined)}
            onMouseEnter={() => (adjacentDepartmentHrefs.next ? router.prefetch(adjacentDepartmentHrefs.next) : undefined)}
            onTouchStart={() => (adjacentDepartmentHrefs.next ? router.prefetch(adjacentDepartmentHrefs.next) : undefined)}
            disabled={!nextDepartment || isPending || isLoadingOptions}
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-full bg-[#f1f5f3] text-[#007050] transition hover:translate-x-0.5 hover:bg-[#e2ebe7] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-x-0"
            aria-label={nextDepartment ? `다음 부서 ${nextDepartment.department_name} 조회` : "다음 부서 없음"}
            title={nextDepartment ? `다음 부서: ${nextDepartment.department_name}` : "다음 부서 없음"}
          >
            <span className="text-[15px] leading-none" aria-hidden="true">
              ▶
            </span>
          </button>
        </div>
      ) : null}
      {scopeNotice ? <p className="text-[11px] font-bold text-[#5b6b7c]">{scopeNotice}</p> : null}
    </div>
  );
}

// 회의자료·자료취합은 관리자·부서장·매니저 전용 화면이라, 권한이 없으면 조건도 적용하지 않는다.
function resolveScopeModeForProfile(pathname: string, profile: ProfileSummary): HeaderScopeMode {
  const scopeMode = getHeaderScopeMode(pathname);
  const isMeetingOnlyRoute =
    pathname.startsWith("/meeting-materials") || pathname.startsWith("/data-collections");
  if (scopeMode !== "none" && isMeetingOnlyRoute && !canViewMeetingMaterials(profile)) {
    return "none";
  }
  return scopeMode;
}

export function Header({
  profile,
  filterOptions,
  isSidebarHidden = false,
  onToggleSidebar
}: {
  profile: ProfileSummary;
  filterOptions: HeaderFilterOptions;
  isSidebarHidden?: boolean;
  onToggleSidebar?: () => void;
}) {
  const pathname = usePathname();
  const meta = getRouteMeta(pathname);
  const scopeMode = resolveScopeModeForProfile(pathname, profile);

  return (
    <header className="sticky top-0 z-10 bg-[#f3ece1]/85 px-4 pb-3 pt-5 backdrop-blur-xl lg:px-10 lg:pt-7">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="focus-ring mt-1 hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#007050] shadow-[0_8px_20px_rgba(1,34,65,0.06)] transition hover:-translate-y-0.5 hover:bg-[#f4ede2] lg:flex"
            aria-label={isSidebarHidden ? "왼쪽 메뉴 펼치기" : "왼쪽 메뉴 숨기기"}
            title={isSidebarHidden ? "왼쪽 메뉴 펼치기" : "왼쪽 메뉴 숨기기"}
          >
            <PanelLeftOpen className={`h-5 w-5 transition-transform ${isSidebarHidden ? "" : "rotate-180"}`} aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <p className="u-eyebrow">Weekly Operations</p>
            <h1 className="u-page-title mt-1 truncate !text-[1.375rem]">{meta.title}</h1>
            <p className="mt-1 truncate text-xs font-semibold text-[#5b6b7c]">{meta.description}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
          <HeaderScopeFilter pathname={pathname} profile={profile} options={filterOptions} scopeMode={scopeMode} />
          <div
            className="filter-pill min-w-0"
            title={`소속부서: ${profile.department_name ?? "부서 미지정"}`}
          >
            <UserRound className="h-4 w-4 shrink-0 text-[#007050]" aria-hidden="true" />
            <span className="cap whitespace-nowrap">담당자</span>
            <span className="truncate text-sm font-black text-[#012241]">{profile.full_name}</span>
            <span className="whitespace-nowrap text-xs font-semibold text-[#5b6b7c]">{roleLabel(profile.app_role)}</span>
          </div>
          {/* 제출 직전에 헤더 조건 저장값을 지운다(성공 후엔 페이지가 바뀌어 정리 기회가 없음). */}
          <SignOutForm>
            <button
              type="submit"
              className="focus-ring tool-button tool-button-primary whitespace-nowrap"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              로그아웃
            </button>
          </SignOutForm>
        </div>
      </div>
    </header>
  );
}
