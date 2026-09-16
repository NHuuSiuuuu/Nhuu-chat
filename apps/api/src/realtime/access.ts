type RealtimeAuth = { id: string; role: string };
type ConversationAccess = { platform?: unknown; ownerId?: unknown; assignedAgentId?: unknown };

// Giữ quyền admin trên các kênh dùng chung nhưng cô lập Zalo cá nhân theo owner hoặc người được phân công.
export function conversationAccessFilter(auth: RealtimeAuth): Record<string, unknown> {
  if (auth.role === "admin") {
    return {
      $or: [
        { platform: { $ne: "zalo_personal" } },
        { ownerId: auth.id },
        { assignedAgentId: auth.id }
      ]
    };
  }
  return auth.role === "agent" ? { assignedAgentId: auth.id } : { ownerId: auth.id };
}

export function canJoinConversation(auth: RealtimeAuth, conversation: ConversationAccess): boolean {
  if (auth.role === "admin") {
    if (conversation.platform !== "zalo_personal") return true;
    return String(conversation.ownerId ?? "") === auth.id
      || String(conversation.assignedAgentId ?? "") === auth.id;
  }
  if (auth.role === "agent") return String(conversation.assignedAgentId ?? "") === auth.id;
  return String(conversation.ownerId ?? "") === auth.id;
}

export function canMarkConversationRead(auth: RealtimeAuth, conversation: ConversationAccess): boolean {
  return canJoinConversation(auth, conversation);
}
