"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, FilePenLine, Gamepad2, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type MobileView = "client" | "department" | "game" | "settings";
const MOBILE_GAME_ACTIVE_EVENT = "mobile-game-active-change";

const navigation = [
  { value: "client" as const, label: "화주자료", icon: FilePenLine },
  { value: "department" as const, label: "부서자료", icon: Building2 },
  { value: "game" as const, label: "미니게임", icon: Gamepad2 },
  { value: "settings" as const, label: "설정", icon: Settings }
];

export function MobileAppShell({
  initialView,
  departments = [],
  clients = [],
  selectedDepartmentId = "",
  selectedClientId = "",
  clientView,
  departmentView,
  gameView,
  settingsView
}: {
  initialView: MobileView;
  departments: { id: string; department_name: string }[];
  clients: { id: string; client_name: string }[];
  selectedDepartmentId: string;
  selectedClientId: string;
  clientView: ReactNode;
  departmentView: ReactNode;
  gameView: ReactNode;
  settingsView: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeView, setActiveView] = useState(initialView);
  const [isGameActive, setIsGameActive] = useState(false);
  const content = activeView === "client" ? clientView : activeView === "department" ? departmentView : activeView === "game" ? gameView : settingsView;
  const hideBottomNavigation = activeView === "game" && isGameActive;

  useEffect(() => {
    function syncViewFromUrl() {
      const view = new URL(window.location.href).searchParams.get("view");
      setActiveView(view === "department" || view === "game" || view === "settings" ? view : "client");
    }

    window.addEventListener("popstate", syncViewFromUrl);
    return () => window.removeEventListener("popstate", syncViewFromUrl);
  }, []);

  useEffect(() => {
    function syncGameState(event: Event) {
      setIsGameActive((event as CustomEvent<{ active?: boolean }>).detail?.active === true);
    }

    window.addEventListener(MOBILE_GAME_ACTIVE_EVENT, syncGameState);
    return () => window.removeEventListener(MOBILE_GAME_ACTIVE_EVENT, syncGameState);
  }, []);

  function selectView(view: MobileView) {
    setIsGameActive(false);
    setActiveView(view);
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    window.history.pushState({ mobileView: view }, "", `${url.pathname}?${url.searchParams.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeDepartment(departmentId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", activeView);
    next.set("department_id", departmentId);
    next.delete("client_id");
    router.replace(`/mobile?${next.toString()}`, { scroll: false });
  }

  function changeClient(clientId: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", activeView);
    next.set("client_id", clientId);
    router.replace(`/mobile?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="min-h-dvh bg-[#faf6ef] pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-[#012241]">
      <header className="sticky top-0 z-40 shadow-[0_8px_24px_rgba(16,34,61,0.12)]">
        <div className="bg-[#007050] px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white">
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col justify-center leading-none">
              <p className="text-xs font-bold text-blue-100">TPL사업부</p>
              <p className="mt-1 whitespace-nowrap text-[15px] font-black">주간자료 시스템</p>
            </div>
            <div className="ml-auto flex shrink-0 gap-1">
              <label className="w-[102px] min-w-0">
                <span className="sr-only">부서</span>
                <select value={selectedDepartmentId} onChange={(event) => changeDepartment(event.target.value)} aria-label="부서 선택" className="h-8 w-full min-w-0 rounded-md border border-white/35 bg-white/14 px-1 !text-xs !font-black text-white outline-none focus:border-white">
                  {departments.map((department) => <option key={department.id} value={department.id} className="text-[#012241]">{department.department_name}</option>)}
                </select>
              </label>
              <label className="w-[102px] min-w-0">
                <span className="sr-only">화주</span>
                <select value={selectedClientId} onChange={(event) => changeClient(event.target.value)} disabled={!selectedClientId} aria-label="화주 선택" className="h-8 w-full min-w-0 rounded-md border border-white/35 bg-white/14 px-1 !text-xs !font-black text-white outline-none focus:border-white disabled:text-blue-200">
                  {clients.length ? clients.map((client) => <option key={client.id} value={client.id} className="text-[#012241]">{client.client_name}</option>) : <option value="" className="text-[#012241]">화주 없음</option>}
                </select>
              </label>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-3 py-3">{content}</main>

      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-[#e7ddcd] bg-white/96 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_28px_rgba(16,34,61,0.08)] backdrop-blur-xl transition-[transform,opacity] duration-200",
          hideBottomNavigation ? "pointer-events-none translate-y-full opacity-0" : "translate-y-0 opacity-100"
        )}
        aria-label="모바일 앱 메뉴"
        aria-hidden={hideBottomNavigation}
      >
        <div className="mx-auto grid h-[4.75rem] max-w-xl grid-cols-4 px-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = activeView === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => selectView(item.value)}
                className={cn("relative flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-black", selected ? "text-[#007050]" : "text-slate-500")}
                aria-current={selected ? "page" : undefined}
              >
                <Icon className="h-5 w-5" strokeWidth={selected ? 2.6 : 2} aria-hidden="true" />
                <span>{item.label}</span>
                {selected ? <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[#007050]" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
