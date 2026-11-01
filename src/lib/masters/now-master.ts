// 현황관리(now 스키마) 마스터 행을 화면용으로 바꾸는 순수 함수.
// 서버 페이지·클라이언트 화면·테스트가 함께 쓰므로 server-only 를 붙이지 않는다.

function displayText(value: string | null | undefined) {
  return value?.trim() || "-";
}

export type NowClientRow = {
  id: string;
  client_code: string;
  client_name: string;
  erp_code: string | null;
  labor_code: string | null;
  pl_code: string | null;
  rep_client_code: string | null;
  rep_client_name: string | null;
  is_active: boolean;
  sort_order: number;
  note: string | null;
};

export type ClientMasterViewRow = {
  id: string;
  clientCode: string;
  clientName: string;
  erpCode: string;
  laborCode: string;
  plCode: string;
  representativeClient: string;
  isActive: boolean;
  note: string;
};

function joinRepresentative(code: string | null, name: string | null) {
  const parts = [code?.trim(), name?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "-";
}

export function toClientMasterViewRow(row: NowClientRow): ClientMasterViewRow {
  return {
    id: row.id,
    clientCode: row.client_code.trim(),
    clientName: row.client_name.trim(),
    erpCode: displayText(row.erp_code),
    laborCode: displayText(row.labor_code),
    plCode: displayText(row.pl_code),
    representativeClient: joinRepresentative(row.rep_client_code, row.rep_client_name),
    isActive: row.is_active,
    note: displayText(row.note)
  };
}

export type NowCenterRow = {
  id: string;
  center_name: string;
  lease_type: string | null;
  building_type: string | null;
  address: string | null;
  is_active: boolean;
  sort_order: number;
  note: string | null;
};

export type CenterMasterViewRow = {
  id: string;
  centerName: string;
  leaseType: string;
  buildingType: string;
  address: string;
  isActive: boolean;
  note: string;
};

// 현황관리 sql/006 의 건물 유형 코드.
const BUILDING_TYPE_LABELS: Record<string, string> = {
  flat: "평지붕",
  gable: "박공지붕",
  rampup: "램프업 복층"
};

export function buildingTypeLabel(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return BUILDING_TYPE_LABELS[value] ?? value;
}

export function toCenterMasterViewRow(row: NowCenterRow): CenterMasterViewRow {
  return {
    id: row.id,
    centerName: row.center_name.trim(),
    leaseType: displayText(row.lease_type),
    buildingType: buildingTypeLabel(row.building_type),
    address: displayText(row.address),
    isActive: row.is_active,
    note: displayText(row.note)
  };
}

// 사용 중인 행을 먼저, 그 안에서는 now 정렬순서 → 이름 순.
export function sortNowMasterRows<T extends { is_active: boolean; sort_order: number }>(
  rows: T[],
  getName: (row: T) => string
) {
  return [...rows].sort(
    (left, right) =>
      Number(right.is_active) - Number(left.is_active) ||
      left.sort_order - right.sort_order ||
      getName(left).localeCompare(getName(right), "ko")
  );
}

// 화면 검색: 이름·코드 등 여러 칸 중 하나라도 검색어를 포함하면 표시한다.
export function matchesNowMasterSearch(query: string, values: Array<string | null | undefined>) {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) {
    return true;
  }
  return values.some((value) => (value ?? "").toLocaleLowerCase("ko-KR").includes(normalized));
}

// PostgREST .in() 필터는 URL 에 실리므로 ID 를 나눠 조회한다.
export function chunkValues<T>(values: T[], size: number) {
  if (size < 1) {
    throw new Error("chunk size must be positive");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
