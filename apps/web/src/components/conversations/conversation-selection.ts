export type BulkConversationAction = "read" | "unread" | "delete";

export function toggleConversationSelection(selectedIds: string[], id: string, checked: boolean): string[] {
  return checked
    ? selectedIds.includes(id) ? selectedIds : [...selectedIds, id]
    : selectedIds.filter((selectedId) => selectedId !== id);
}

export function toggleVisibleConversationSelection(selectedIds: string[], visibleIds: string[], checked: boolean): string[] {
  if (!checked) return [];
  return [...new Set([...selectedIds, ...visibleIds])];
}
