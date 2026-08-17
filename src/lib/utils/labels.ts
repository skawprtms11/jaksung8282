import {
  BadgeCheck,
  Boxes,
  Building2,
  ClipboardList,
  Handshake,
  MonitorCog,
  MoreHorizontal,
  ShieldCheck,
  Users
} from "lucide-react";
import type { NoticeType, VolumeType, VolumeUnit } from "@/types/enums";

export const noticeTypeLabels: Record<NoticeType, string> = {
  general: "공지사항",
  important: "지시사항",
  urgent: "자료취합",
  system: "기타내용"
};

export const volumeTypeLabels: Record<VolumeType, string> = {
  inbound: "입고",
  outbound: "출고",
  inventory: "재고",
  order: "주문",
  return: "반품",
  etc: "기타"
};

export const volumeUnitLabels: Record<VolumeUnit, string> = {
  EA: "EA",
  BOX: "BOX",
  CASE: "CASE",
  PLT: "PLT",
  case_count: "건",
  TON: "TON",
  CBM: "CBM",
  etc: "기타"
};

export const workCategoryIcons = {
  ClipboardList,
  Boxes,
  BadgeCheck,
  ShieldCheck,
  Users,
  Building2,
  Handshake,
  MonitorCog,
  MoreHorizontal
};

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul"
  }).format(new Date(value));
}

export function formatCompactDate(value?: string | null) {
  if (!value) {
    return "-";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul"
  }).formatToParts(new Date(value));
  const datePart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${datePart("year")}${datePart("month")}${datePart("day")}`;
}
