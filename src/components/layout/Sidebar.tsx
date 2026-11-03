"use client";

import { useLinkStatus } from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  FilePenLine,
  Home,
  ListChecks,
  LoaderCircle,
  PackageSearch,
  PanelLeftClose,
  Table2,
  UsersRound,
  Warehouse
} from "lucide-react";
import { ScopedLink } from "./ScopedLink";
import type { ProfileSummary } from "@/lib/auth/permissions";
import {
  canManageMasters,
  canRegisterDepartmentClients,
  canViewDepartmentMaster,
  canViewMeetingMaterials
} from "@/lib/auth/permissions";

const noticeMenu = { href: "/notices", label: "공지사항", icon: Home };
const dataCollectionMenu = { href: "/data-collections", label: "자료취합", icon: Table2 };
const meetingMaterialsMenu = { href: "/meeting-materials", label: "회의자료", icon: ChartNoAxesCombined };
const baseMenus = [
  { href: "/department-reports", label: "부서자료", icon: ClipboardCheck },
  { href: "/client-reports", label: "화주자료", icon: FilePenLine }
];
// 화주자료 바로 아래. 관리자·부서장·매니저만 노출(화주담당자는 숨김, 페이지·액션·RPC 에서도 차단).
const clientRegistrationMenu = { href: "/client-registrations", label: "부서별화주등록", icon: ListChecks };

const departmentMasterMenu = { href: "/admin/departments", label: "부서마스터", icon: Building2 };
const centerMasterMenu = { href: "/admin/centers", label: "센터마스터", icon: PackageSearch };

const adminMenus = [
  { href: "/admin/clients", label: "화주마스터", icon: Warehouse },
  { href: "/admin/users", label: "사용자관리", icon: UsersRound }
];

// 모든 화면에서 유휴 시 한꺼번에 받지 않고, 메뉴에 마우스를 올리거나 포커스했을 때 그 화면 모듈만 미리 받는다.
const menuModuleLoaders: Record<string, () => Promise<unknown>[]> = {
  "/notices": () => [import("@/components/notices/NoticeBoard")],
  "/client-reports": () => [import("@/components/reports/ClientReportsWorkspace")],
  "/department-reports": () => [import("@/components/reports/DepartmentSubmissionEditor")],
  "/meeting-materials": () => [
    import("@/components/reports/MeetingMaterialsTable"),
    import("@/components/reports/MeetingPriorityPanel")
  ]
};
const prewarmedMenuHrefs = new Set<string>();

function prewarmMenuModule(href: string) {
  const load = menuModuleLoaders[href];
  if (!load || prewarmedMenuHrefs.has(href)) {
    return;
  }
  prewarmedMenuHrefs.add(href);
  void Promise.all(load());
}

function MenuIcon({ icon: Icon, isNavigating }: { icon: typeof Home; isNavigating: boolean }) {
  const { pending } = useLinkStatus();
  return pending || isNavigating ? (
    <LoaderCircle className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
  ) : (
    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
  );
}

export function Sidebar({
  profile,
  isHidden,
  onToggleHidden
}: {
  profile: ProfileSummary;
  isHidden: boolean;
  onToggleHidden: () => void;
}) {
  const pathname = usePathname();
  const menus = useMemo(
    () => [
      noticeMenu,
      ...(canViewMeetingMaterials(profile) ? [dataCollectionMenu] : []),
      ...(canViewMeetingMaterials(profile) ? [meetingMaterialsMenu] : []),
      ...baseMenus,
      ...(canRegisterDepartmentClients(profile) ? [clientRegistrationMenu] : []),
      ...(canViewDepartmentMaster(profile) ? [departmentMasterMenu] : []),
      ...(canViewDepartmentMaster(profile) ? [centerMasterMenu] : []),
      ...(canManageMasters(profile) ? adminMenus : [])
    ],
    [profile]
  );

  const menuSections = useMemo(
    () => [
      { label: "업무", items: menus.filter((menu) => !menu.href.startsWith("/admin")) },
      { label: "관리", items: menus.filter((menu) => menu.href.startsWith("/admin")) }
    ],
    [menus]
  );

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-20 hidden w-72 transition-transform duration-300 ease-out lg:block ${
        isHidden ? "-translate-x-full" : "translate-x-0"
      }`}
      aria-hidden={isHidden}
    >
      <div className="flex h-full flex-col bg-[#012241] px-5 pb-6 pt-7 text-white shadow-[0_24px_70px_rgba(1,34,65,0.28)]">
        <div className="flex items-start justify-between gap-2">
          <ScopedLink href="/notices" profileId={profile.id} className="focus-ring block min-w-0 rounded-2xl px-1 py-1">
            <div className="flex items-center gap-3">
              <span
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#007050] to-[#00a978] shadow-[0_10px_22px_rgba(0,112,80,0.45)]"
                aria-hidden="true"
              >
                <ChevronRight className="h-[18px] w-[18px] text-white" strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <div className="text-[1.85rem] font-black leading-none tracking-normal text-white">TPL</div>
                <div className="mt-1 text-[0.62rem] font-black uppercase tracking-[0.42em] text-[#3ec98f]">
                  Logistics
                </div>
              </div>
            </div>
            <p className="mt-2.5 text-xs font-semibold text-[#8496a8]">Weekly Operations Hub</p>
          </ScopedLink>
          <button
            type="button"
            onClick={onToggleHidden}
            className="focus-ring mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-[#c3d0dc] transition hover:bg-white/15 hover:text-white"
            aria-label="왼쪽 메뉴 숨기기"
            title="왼쪽 메뉴 숨기기"
          >
            <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
          </button>
          </div>

      <nav className="mt-6 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label="주요 메뉴">
        {menuSections.map((section) =>
          section.items.length ? (
            <div key={section.label} className="pb-3">
              <p className="mb-3 px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d8095]">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((menu) => {
                  const Icon = menu.icon;
                  const isActive = pathname === menu.href || pathname.startsWith(`${menu.href}/`);
                  return (
                    <ScopedLink
                      key={menu.href}
                      href={menu.href}
                      profileId={profile.id}
                      // 링크 주소엔 헤더 조건이 없어 전체 프리페치(true)는 조건 붙은 실제 이동 주소와 어긋나 버려진다.
                      prefetch="auto"
                      onIntent={() => prewarmMenuModule(menu.href)}
                      aria-current={isActive ? "page" : undefined}
                      className={`focus-ring group flex min-w-0 items-center gap-3 rounded-[14px] px-3.5 py-3 text-sm font-bold transition ${
                        isActive
                          ? "bg-[#007050] text-white shadow-[0_14px_28px_rgba(0,112,80,0.35)]"
                          : "text-[#c3d0dc] hover:bg-white/8 hover:text-white"
                      }`}
                    >
                      {(isNavigating) => (
                        <>
                          <span
                            className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] transition ${
                              isActive ? "bg-white/20 text-white" : "text-[#8fa3b5] group-hover:text-white"
                            }`}
                          >
                            <MenuIcon icon={Icon} isNavigating={isNavigating} />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{menu.label}</span>
                        </>
                      )}
                    </ScopedLink>
                  );
                })}
              </div>
            </div>
          ) : null
        )}
      </nav>

      <div className="mt-3 shrink-0">
        <div className="flex items-center gap-2 rounded-2xl bg-white/6 px-4 py-3 text-xs font-bold text-[#8496a8]">
          <span className="u-dot u-dot-green" aria-hidden="true" />
          <span>KOR</span>
          <span aria-hidden="true">·</span>
          <span>Live</span>
          <span aria-hidden="true">·</span>
          <span>Secure</span>
        </div>
      </div>
      </div>
    </aside>
  );
}
