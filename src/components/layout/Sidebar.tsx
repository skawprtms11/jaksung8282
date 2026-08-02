"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  ChartNoAxesCombined,
  ClipboardCheck,
  FilePenLine,
  Gamepad2,
  Headphones,
  Home,
  LoaderCircle,
  LogOut,
  PackageSearch,
  PanelLeftClose,
  UsersRound,
  Warehouse
} from "lucide-react";
import type { ProfileSummary } from "@/lib/auth/permissions";
import { canManageMasters, canViewDepartmentMaster, canViewMeetingMaterials } from "@/lib/auth/permissions";

const noticeMenu = { href: "/notices", label: "공지사항", icon: Home };
const meetingMaterialsMenu = { href: "/meeting-materials", label: "회의자료", icon: ChartNoAxesCombined };
const baseMenus = [
  { href: "/department-reports", label: "부서자료", icon: ClipboardCheck },
  { href: "/client-reports", label: "화주자료", icon: FilePenLine },
  { href: "/mini-game", label: "미니게임", icon: Gamepad2 }
];

const fullPrefetchMenuHrefs = new Set([
  noticeMenu.href,
  meetingMaterialsMenu.href,
  "/department-reports",
  "/client-reports"
]);

const departmentMasterMenu = { href: "/admin/departments", label: "부서마스터", icon: Building2 };
const centerMasterMenu = { href: "/admin/centers", label: "센터마스터", icon: PackageSearch };

const adminMenus = [
  { href: "/admin/clients", label: "화주마스터", icon: Warehouse },
  { href: "/admin/users", label: "사용자관리", icon: UsersRound }
];

let primaryMenuModulesPrewarmed = false;

function prewarmPrimaryMenuModules() {
  if (primaryMenuModulesPrewarmed) {
    return;
  }
  primaryMenuModulesPrewarmed = true;
  void Promise.all([
    import("@/components/notices/NoticeBoard"),
    import("@/components/reports/ClientReportsWorkspace"),
    import("@/components/reports/DepartmentSubmissionEditor"),
    import("@/components/reports/MeetingMaterialsTable"),
    import("@/components/reports/MeetingPriorityPanel")
  ]);
}

function MenuIcon({ icon: Icon }: { icon: typeof Home }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
  ) : (
    <Icon className="h-5 w-5" aria-hidden="true" />
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
  const router = useRouter();
  const menus = useMemo(
    () => [
      noticeMenu,
      ...(canViewMeetingMaterials(profile) ? [meetingMaterialsMenu] : []),
      ...baseMenus,
      ...(canViewDepartmentMaster(profile) ? [departmentMasterMenu] : []),
      ...(canViewDepartmentMaster(profile) ? [centerMasterMenu] : []),
      ...(canManageMasters(profile) ? adminMenus : [])
    ],
    [profile]
  );

  useEffect(() => {
    const startPrefetch = () => {
      prewarmPrimaryMenuModules();
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(startPrefetch, { timeout: 900 });
      return () => {
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(startPrefetch, 300);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-20 hidden w-72 p-4 transition-transform duration-300 ease-out lg:block ${
        isHidden ? "-translate-x-full" : "translate-x-0"
      }`}
      aria-hidden={isHidden}
    >
      <div className="flex h-full flex-col rounded-[1.75rem] border border-white/80 bg-white/82 p-4 shadow-[0_24px_70px_rgba(16,34,61,0.13)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-2">
          <Link href="/notices" className="focus-ring block min-w-0 rounded-3xl px-2 py-2">
            <div className="text-[1.95rem] font-black leading-none tracking-normal text-[#075be8]">TPL</div>
            <div className="mt-1 text-[0.62rem] font-black uppercase tracking-[0.42em] text-[#0b2d5f]">
              Logistics
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">Weekly Operations Hub</p>
          </Link>
          <button
            type="button"
            onClick={onToggleHidden}
            className="focus-ring mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#dbe8fb] bg-white/90 text-[#075be8] shadow-[0_12px_24px_rgba(16,34,61,0.08)] transition hover:-translate-y-0.5 hover:bg-[#eaf3ff]"
            aria-label="왼쪽 메뉴 숨기기"
            title="왼쪽 메뉴 숨기기"
          >
            <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
          </button>
          </div>

      <nav className="mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1" aria-label="주요 메뉴">
        {menus.map((menu) => {
          const Icon = menu.icon;
          return (
            <Link
              key={menu.href}
              href={menu.href}
              prefetch={fullPrefetchMenuHrefs.has(menu.href) ? true : "auto"}
              onFocus={() => router.prefetch(menu.href)}
              className="focus-ring group flex min-w-0 items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-sm font-bold text-[#203653] transition hover:-translate-y-0.5 hover:border-[#dbe8fb] hover:bg-[#eaf3ff] hover:text-[#075be8] hover:shadow-[0_16px_30px_rgba(7,91,232,0.12)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#f2f7ff] text-[#0b2d5f] transition group-hover:bg-[#075be8] group-hover:text-white">
                <MenuIcon icon={Icon} />
              </span>
              <span className="min-w-0 flex-1 truncate">{menu.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 shrink-0 space-y-3">
        <div className="rounded-3xl border border-[#dce8f6] bg-[#f7fbff] p-3 shadow-[0_16px_30px_rgba(16,34,61,0.06)]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-[#075be8] shadow-[0_10px_22px_rgba(7,91,232,0.10)]">
              <Headphones className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-500">운영 지원</p>
              <p className="mt-0.5 text-base font-black text-[#10223d]">TPL Helpdesk</p>
              <p className="mt-0.5 text-xs text-slate-500">Mon - Fri 09:00 - 18:00</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-500">
          <span className="inline-flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
            KOR
          </span>
          <span className="inline-flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
            Live
          </span>
          <span className="inline-flex items-center gap-2">
            <LogOut className="h-4 w-4 text-[#075be8]" aria-hidden="true" />
            Secure
          </span>
        </div>
      </div>
      </div>
    </aside>
  );
}
