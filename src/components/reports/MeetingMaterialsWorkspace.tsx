"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MeetingMaterialsTabContent } from "@/components/reports/MeetingMaterialsTabContent";
import { MeetingMaterialsTabNav, type MeetingTabValue } from "@/components/reports/MeetingMaterialsTabNav";
import type { MeetingTabData } from "@/lib/reports/meeting-materials-tab-data";

type TabItem = { value: MeetingTabValue; label: string; href: string };
type CachedTab = { data: MeetingTabData; fetchedAt: number };

const CACHE_TTL_MS = 60_000;

function apiHref(pageHref: string) {
  const url = new URL(pageHref, window.location.origin);
  return `/api/meeting-materials/tab?${url.searchParams.toString()}`;
}

function tabFromLocation() {
  const value = new URLSearchParams(window.location.search).get("tab") as MeetingTabValue | null;
  return value && ["collection", "materials", "volumes", "holiday", "facility"].includes(value) ? value : "collection";
}

export function MeetingMaterialsWorkspace({
  tabs,
  initialTab,
  currentUserId,
  canManageAllRequests,
  weekFilter,
  children
}: {
  tabs: TabItem[];
  initialTab: MeetingTabValue;
  currentUserId: string;
  canManageAllRequests: boolean;
  weekFilter: ReactNode;
  children: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [pendingTab, setPendingTab] = useState<MeetingTabValue | null>(null);
  const [activeData, setActiveData] = useState<MeetingTabData | null>(null);
  const cacheRef = useRef(new Map<string, CachedTab>());
  const requestsRef = useRef(new Map<string, Promise<MeetingTabData>>());
  const controllerRef = useRef<AbortController | null>(null);
  const initialHrefRef = useRef(tabs.find((tab) => tab.value === initialTab)?.href ?? "/meeting-materials");

  const fetchTab = useCallback(async (href: string, signal?: AbortSignal) => {
    const cached = cacheRef.current.get(href);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.data;
    const existing = requestsRef.current.get(href);
    if (existing) return existing;
    const request = fetch(apiHref(href), { credentials: "same-origin", signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`meeting tab request failed: ${response.status}`);
        return response.json() as Promise<MeetingTabData>;
      })
      .then((data) => {
        cacheRef.current.set(href, { data, fetchedAt: Date.now() });
        return data;
      })
      .finally(() => requestsRef.current.delete(href));
    requestsRef.current.set(href, request);
    return request;
  }, []);

  const openTab = useCallback(async (tab: MeetingTabValue, href: string, pushHistory: boolean) => {
    if (tab === activeTab && !pendingTab) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setActiveTab(tab);
    setPendingTab(tab);
    setActiveData(cacheRef.current.get(href)?.data ?? null);
    if (pushHistory) window.history.pushState({ meetingTab: tab }, "", href);
    performance.mark("meeting-tab-start");
    try {
      const data = await fetchTab(href, controller.signal);
      if (controller.signal.aborted) return;
      setActiveData(data);
      setPendingTab(null);
      performance.mark("meeting-tab-ready");
      performance.measure("meeting-tab-switch", "meeting-tab-start", "meeting-tab-ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      console.warn("[meeting-materials] client tab fallback", error);
      window.location.assign(href);
    }
  }, [activeTab, fetchTab, pendingTab]);

  useEffect(() => {
    const handlePopState = () => {
      const tab = tabFromLocation();
      const href = window.location.pathname + window.location.search;
      if (href === initialHrefRef.current) {
        controllerRef.current?.abort();
        setActiveTab(initialTab);
        setActiveData(null);
        setPendingTab(null);
        return;
      }
      void openTab(tab, href, false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [initialTab, openTab]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      for (const tab of tabs) {
        if (cancelled) return;
        if (tab.value !== initialTab) {
          await fetchTab(tab.href).catch(() => undefined);
          await new Promise((resolve) => window.setTimeout(resolve, 180));
        }
      }
    }, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [fetchTab, initialTab, tabs]);

  const handleDataChanged = useCallback(() => {
    for (const [href] of cacheRef.current) {
      const tab = new URL(href, window.location.origin).searchParams.get("tab");
      if (tab === "materials" || tab === "collection") cacheRef.current.delete(href);
    }
  }, []);

  return <div className="space-y-4">
    <div className="rounded-[1.4rem] border border-[#d9e7f7] bg-white/82 p-2 shadow-[0_14px_34px_rgba(16,34,61,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MeetingMaterialsTabNav
          activeTab={activeTab}
          pendingTab={pendingTab}
          tabs={tabs}
          onTabSelect={(tab, href) => void openTab(tab, href, true)}
          onTabIntent={(tab, href) => {
            if (tab !== activeTab) void fetchTab(href).catch(() => undefined);
          }}
        />
        {weekFilter}
      </div>
    </div>
    <div data-meeting-tab-content={activeTab} aria-busy={Boolean(pendingTab)}>
      {activeData ? <MeetingMaterialsTabContent data={activeData} currentUserId={currentUserId} canManageAllRequests={canManageAllRequests} onDataChanged={handleDataChanged} /> : pendingTab ? (
        <div className="sketch-panel flex min-h-44 items-center justify-center p-4 text-sm font-black text-slate-500">화면을 불러오는 중입니다.</div>
      ) : children}
    </div>
  </div>;
}
