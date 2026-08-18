export function resolveOwnerClientIds(assignedClientIds: Set<string>, requestedClientId?: string) {
  if (!requestedClientId) {
    return [...assignedClientIds];
  }
  return assignedClientIds.has(requestedClientId) ? [requestedClientId] : [];
}
