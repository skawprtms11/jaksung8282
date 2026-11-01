export function resolveOwnerClientIds(assignedClientIds: Set<string>, requestedClientId?: string) {
  if (!requestedClientId) {
    return [...assignedClientIds];
  }
  return assignedClientIds.has(requestedClientId) ? [requestedClientId] : [];
}

// 현황관리에서 부서-화주 연결이 해제돼도 담당자 배정 데이터는 남는다. 화면에는 활성 연결이 있는 배정만 보인다.
export function keepLinkedClientIds(assignedClientIds: Iterable<string>, linkedClientIds: Iterable<string>) {
  const linked = new Set(linkedClientIds);
  return [...new Set(assignedClientIds)].filter((clientId) => linked.has(clientId));
}
