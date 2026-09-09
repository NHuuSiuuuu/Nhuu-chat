import * as React from "react";
import type { ConversationContract } from "@nhuu-chat/contracts";
export function ConversationList({ items, activeId, onSelect }: { items: ConversationContract[]; activeId: string | null; onSelect: (id: string) => void }) {
  return <aside aria-label="Danh sách hội thoại">{items.map((item) => <button key={item.id} onClick={() => onSelect(item.id)} aria-current={item.id === activeId}>{item.lastMessageSnippet || "Hội thoại mới"}<small> · {item.unreadCount}</small></button>)}</aside>;
}
