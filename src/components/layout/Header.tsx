"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Building2, LogOut, PackageSearch, PanelLeftOpen, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOutAction } from "@/actions/auth";
import type { ProfileSummary } from "@/lib/auth/permissions";
import { roleLabel } from "@/lib/auth/permissions";

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

function hasFilterOptions(options: HeaderFilterOptions) {
  return options.departments.length > 0 || options.clients.length > 0;
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
      return options;
    }
    return emptyFilterOptions;
  });
  const [isLoadingOptions, setIsLoadingOptions] = useState(() => !hasFilterOptions(options));
  const hasLoadedOptions = hasFilterOptions(loadedOptions);
  const activeOptions = hasLoadedOptions ? loadedOptions : emptyFilterOptions;
  const selectedDepartmentId = searchParams.get("department_id") ?? "";
  const selectedClientId = searchParams.get("client_id") ?? "";
  const isClientWritePage = pathname === "/client-reports";
  const activeMeetingTab = searchParams.get("tab") ?? "collection";
  const restrictMeetingMaterialsAll =
    pathname === "/meeting-materials" && activeMeetingTab === "materials" && !selectedClientId;
  const fallbackDepartmentId = restrictMeetingMaterialsAll ? activeOptions.departments[0]?.id ?? "" : "";
  const effectiveDepartmentId = selectedDepartmentId || fallbackDepartmentId;
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
  const effectiveClientId = selectedClientId;

  useEffect(() => {
    if (hasLoadedOptions) {
      return;
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
        setLoadedOptions(nextOptions);
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

  function updateFilter(nextDepartmentId: string, nextClientId: string) {
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
  }

  function handleDepartmentChange(nextDepartmentId: string) {
    const nextClientStillVisible = activeOptions.clients.some(
      (client) =>
        client.id === selectedClientId &&
        (!nextDepartmentId || client.department_id === nextDepartmentId) &&
        (profile.app_role !== "client_owner" || !isClientWritePage || assignedClientIdSet.has(client.id))
    );
    updateFilter(nextDepartmentId, nextClientStillVisible ? selectedClientId : "");
  }

  return (
    <div className="hidden items-center gap-2 rounded-full border border-[#dbe8fb] bg-white/90 px-2 py-1.5 shadow-[0_12px_26px_rgba(16,34,61,0.06)] xl:flex">
      <label className="flex items-center gap-1.5 rounded-full bg-[#f5f9ff] px-2 py-1 text-xs font-black text-slate-500">
        <Building2 className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
        <span className="sr-only">부서 필터</span>
        <select
          value={effectiveDepartmentId}
          onChange={(event) => handleDepartmentChange(event.target.value)}
          disabled={isLoadingOptions || isPending}
          className="h-8 w-36 bg-transparent text-sm font-black text-[#10223d] outline-none"
          aria-label="부서 필터"
        >
          {isLoadingOptions ? <option value="">부서 불러오는 중</option> : null}
          <option value="" disabled={restrictMeetingMaterialsAll}>
            전체 부서
          </option>
          {activeOptions.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.department_name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 rounded-full bg-[#f5f9ff] px-2 py-1 text-xs font-black text-slate-500">
        <PackageSearch className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
        <span className="sr-only">화주 필터</span>
        <select
          value={effectiveClientId}
          onChange={(event) => updateFilter(effectiveDepartmentId, event.target.value)}
          disabled={isLoadingOptions || isPending}
          className="h-8 w-36 bg-transparent text-sm font-black text-[#10223d] outline-none"
          aria-label="화주 필터"
        >
          {isLoadingOptions ? <option value="">화주 불러오는 중</option> : null}
          <option value="">전체 화주</option>
          {departmentScopedClients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.client_name}
            </option>
          ))}
        </select>
      </label>
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
  const shouldShowFilters = filteredRoutes.has(pathname);

  return (
    <header className="sticky top-0 z-10 px-4 py-4 backdrop-blur-xl lg:px-6">
      <div className="grid min-h-16 gap-3 rounded-[1.5rem] border border-white/80 bg-white/80 px-5 py-3 shadow-[0_18px_45px_rgba(16,34,61,0.08)] backdrop-blur-2xl md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="focus-ring hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#dbe8fb] bg-white/90 text-[#075be8] shadow-[0_12px_26px_rgba(16,34,61,0.06)] transition hover:-translate-y-0.5 hover:bg-[#eaf3ff] lg:flex"
            aria-label={isSidebarHidden ? "왼쪽 메뉴 펼치기" : "왼쪽 메뉴 숨기기"}
            title={isSidebarHidden ? "왼쪽 메뉴 펼치기" : "왼쪽 메뉴 숨기기"}
          >
            <PanelLeftOpen className={`h-5 w-5 transition-transform ${isSidebarHidden ? "" : "rotate-180"}`} aria-hidden="true" />
          </button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#075be8] text-white shadow-[0_16px_30px_rgba(7,91,232,0.25)]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="truncate text-xl font-black tracking-normal text-[#10223d]">{meta.title}</h1>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 md:justify-end">
          {shouldShowFilters ? <HeaderScopeFilter pathname={pathname} profile={profile} options={filterOptions} /> : null}
          <div className="min-w-0 rounded-full border border-[#dbe8fb] bg-white/90 px-4 py-2 text-right shadow-[0_12px_26px_rgba(16,34,61,0.06)]">
            <p className="truncate text-sm font-black text-[#10223d]">{profile.full_name}</p>
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
