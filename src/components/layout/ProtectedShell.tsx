"use client";

import { useState } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import type { HeaderFilterOptions } from "./Header";
import type { ProfileSummary } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils/cn";

const emptyFilterOptions: HeaderFilterOptions = { departments: [], clients: [], assignedClientIds: [] };

export function ProtectedShell({
  profile,
  filterOptions = emptyFilterOptions,
  children
}: {
  profile: ProfileSummary;
  filterOptions?: HeaderFilterOptions;
  children: React.ReactNode;
}) {
  const [isSidebarHidden, setIsSidebarHidden] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem("tpl-sidebar-hidden") === "true";
  });

  function toggleSidebar() {
    setIsSidebarHidden((current) => {
      const nextValue = !current;
      window.localStorage.setItem("tpl-sidebar-hidden", String(nextValue));
      return nextValue;
    });
  }

  return (
    <div className="min-h-screen">
      <Sidebar profile={profile} isHidden={isSidebarHidden} onToggleHidden={toggleSidebar} />
      <div className={cn("transition-[padding] duration-300 ease-out", isSidebarHidden ? "lg:pl-0" : "lg:pl-72")}>
        <Header
          profile={profile}
          filterOptions={filterOptions}
          isSidebarHidden={isSidebarHidden}
          onToggleSidebar={toggleSidebar}
        />
        <main className="p-4 pt-2 lg:p-6 lg:pt-2">{children}</main>
      </div>
    </div>
  );
}
