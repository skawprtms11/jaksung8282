"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Building2, LogOut, PackageSearch, PanelLeftOpen, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOutAction } from "@/actions/auth";
import { pickDefaultClientId, pickDefaultDepartmentId } from "@/lib/auth/default-scope";
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

const filteredRoutes = new Set(["/meeting-materials", "/department-reports", "/client-reports"]);
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

function HeaderScopeFilter({
  pathname,
  profile,
  options
}: {
  pathname: string;
  profile: ProfileSummary;
  options: HeaderFilterOptions;
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
  const hasLoadedOptions = hasFilterOptions(loadedOptions);
  const activeOptions = hasLoadedOptions ? loadedOptions : emptyFilterOptions;
  const selectedDepartmentId = searchParams.get("department_id") ?? "";
  const selectedClientId = searchParams.get("client_id") ?? "";
  const isClientWritePage = pathname === "/client-reports";
  const isDepartmentReportPage = pathname === "/department-reports";
  const requiresDepartmentSelection = isDepartmentReportPage || isClientWritePage;
  const activeMeetingTab = searchParams.get("tab") ?? "collection";
  const isMeetingMaterialsTab = pathname === "/meeting-materials" && activeMeetingTab === "materials";
  const restrictMeetingMaterialsAll =
    pathname === "/meeting-materials" && activeMeetingTab === "materials" && !selectedClientId;
  const restrictClientReportsAll = isClientWritePage && !selectedDepartmentId;
  const restrictDepartmentReportsAll = isDepartmentReportPage && !selectedDepartmentId;
  const preferredDepartmentId = pickDefaultDepartmentId(activeOptions.departments, profile.app_role);
  const fallbackDepartmentId =
    restrictMeetingMaterialsAll || restrictClientReportsAll || restrictDepartmentReportsAll ? preferredDepartmentId : "";
  const effectiveDepartmentId = selectedDepartmentId || fallbackDepartmentId;
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

  const updateFilter = useCallback((nextDepartmentId: string, nextClientId: string) => {
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
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!hasLoadedOptions || isLoadingOptions || isPending) {
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

  return (
    <div className="hidden items-center gap-2 rounded-full border border-[#e7ddcd] bg-white/90 px-2 py-1.5 shadow-[0_12px_26px_rgba(16,34,61,0.06)] xl:flex">
      <label className="flex items-center gap-1.5 rounded-full bg-[#faf6ef] px-2 py-1 text-xs font-black text-slate-500">
        <Building2 className="h-4 w-4 text-[#007050]" aria-hidden="true" />
        <span className="sr-only">부서 필터</span>
        <select
          value={effectiveDepartmentId}
          onChange={(event) => handleDepartmentChange(event.target.value)}
          disabled={isPending || isLoadingOptions}
          className="h-8 w-36 bg-transparent text-sm font-black text-[#012241] outline-none"
          aria-label="부서 필터"
        >
          {isLoadingOptions ? <option value="">부서 불러오는 중</option> : null}
          <option value="" disabled={restrictMeetingMaterialsAll || requiresDepartmentSelection}>
            {requiresDepartmentSelection ? "부서 선택" : "전체 부서"}
          </option>
          {activeOptions.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.department_name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 rounded-full bg-[#faf6ef] px-2 py-1 text-xs font-black text-slate-500">
        <PackageSearch className="h-4 w-4 text-[#007050]" aria-hidden="true" />
        <span className="sr-only">화주 필터</span>
        <select
          value={effectiveClientId}
          onChange={(event) => updateFilter(effectiveDepartmentId, event.target.value)}
          disabled={isPending || isLoadingOptions}
          className="h-8 w-36 bg-transparent text-sm font-black text-[#012241] outline-none"
          aria-label="화주 필터"
        >
          {isLoadingOptions ? <option value="">화주 불러오는 중</option> : null}
          <option value="" disabled={requiresClientSelection}>
            {requiresClientSelection ? "화주 선택" : "전체 화주"}
          </option>
          {departmentScopedClients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.client_name}
            </option>
          ))}
        </select>
      </label>
      {isMeetingMaterialsTab ? (
        <div className="flex items-center gap-1 border-l border-[#e7ddcd] pl-2" aria-label="부서 자료 이동">
          <button
            type="button"
            onClick={() => (previousDepartment ? handleDepartmentPager(previousDepartment.id) : undefined)}
            onFocus={() => (adjacentDepartmentHrefs.previous ? router.prefetch(adjacentDepartmentHrefs.previous) : undefined)}
            onMouseEnter={() => (adjacentDepartmentHrefs.previous ? router.prefetch(adjacentDepartmentHrefs.previous) : undefined)}
            onTouchStart={() => (adjacentDepartmentHrefs.previous ? router.prefetch(adjacentDepartmentHrefs.previous) : undefined)}
            disabled={!previousDepartment || isPending || isLoadingOptions}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-[#e7ddcd] bg-white text-[#007050] shadow-[0_8px_18px_rgba(0, 112, 80,0.08)] transition hover:-translate-x-0.5 hover:border-[#c8b89c] hover:bg-[#f4ede2] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-x-0"
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
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-[#e7ddcd] bg-white text-[#007050] shadow-[0_8px_18px_rgba(0, 112, 80,0.08)] transition hover:translate-x-0.5 hover:border-[#c8b89c] hover:bg-[#f4ede2] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-x-0"
            aria-label={nextDepartment ? `다음 부서 ${nextDepartment.department_name} 조회` : "다음 부서 없음"}
            title={nextDepartment ? `다음 부서: ${nextDepartment.department_name}` : "다음 부서 없음"}
          >
            <span className="text-[15px] leading-none" aria-hidden="true">
              ▶
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
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
  const shouldShowFilters = filteredRoutes.has(pathname) && (pathname !== "/meeting-materials" || canViewMeetingMaterials(profile));

  return (
    <header className="sticky top-0 z-10 px-4 py-4 backdrop-blur-xl lg:px-6">
      <div className="grid min-h-16 gap-3 rounded-[1.5rem] border border-white/80 bg-white/80 px-5 py-3 shadow-[0_18px_45px_rgba(16,34,61,0.08)] backdrop-blur-2xl md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="focus-ring hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#e7ddcd] bg-white/90 text-[#007050] shadow-[0_12px_26px_rgba(16,34,61,0.06)] transition hover:-translate-y-0.5 hover:bg-[#f4ede2] lg:flex"
            aria-label={isSidebarHidden ? "왼쪽 메뉴 펼치기" : "왼쪽 메뉴 숨기기"}
            title={isSidebarHidden ? "왼쪽 메뉴 펼치기" : "왼쪽 메뉴 숨기기"}
          >
            <PanelLeftOpen className={`h-5 w-5 transition-transform ${isSidebarHidden ? "" : "rotate-180"}`} aria-hidden="true" />
          </button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#007050] text-white shadow-[0_16px_30px_rgba(0, 112, 80,0.25)]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="truncate text-xl font-black tracking-normal text-[#012241]">{meta.title}</h1>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 md:justify-end">
          {shouldShowFilters ? <HeaderScopeFilter pathname={pathname} profile={profile} options={filterOptions} /> : null}
          <div className="min-w-0 rounded-full border border-[#e7ddcd] bg-white/90 px-4 py-2 text-right shadow-[0_12px_26px_rgba(16,34,61,0.06)]">
            <p className="truncate text-sm font-black text-[#012241]">{profile.full_name}</p>
            <p className="truncate text-xs font-semibold text-slate-500">
              {roleLabel(profile.app_role)} · {profile.department_name ?? "부서 미지정"}
            </p>
          </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="focus-ring tool-button tool-button-primary whitespace-nowrap"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            로그아웃
          </button>
        </form>
        </div>
      </div>
    </header>
  );
}
