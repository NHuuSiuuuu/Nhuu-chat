type RealtimeAuth = { id: string; role: string; workspace?: { ownerUserId: string; allowedPages: string[] } };
type ConversationAccess = { platform?: unknown; ownerId?: unknown; channelId?: unknown; assignedAgentId?: unknown };

// Giữ quyền admin trên các kênh dùng chung nhưng cô lập Zalo cá nhân theo owner hoặc người được phân công.
export function conversationAccessFilter(auth: RealtimeAuth): Record<string, unknown> {
  if (auth.workspace) {
    const legacyAccess = auth.role === "admin"
      ? { $or: [{ platform: { $ne: "zalo_personal" } }, { ownerId: auth.id }, { assignedAgentId: auth.id }] }
      : auth.role === "agent" ? { assignedAgentId: auth.id } : { ownerId: auth.id };
    return { $or: [
      { platform: "facebook", ownerId: auth.workspace.ownerUserId, ...(auth.workspace.allowedPages.length ? { channelId: { $in: auth.workspace.allowedPages } } : {}) },
      { platform: { $ne: "facebook" }, ...legacyAccess }
    ] };
  }
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
  if (conversation.platform === "facebook" && !auth.workspace) return false;
  if (auth.workspace && conversation.platform === "facebook") {
    return String(conversation.ownerId ?? "") === auth.workspace.ownerUserId
      && (!auth.workspace.allowedPages.length || auth.workspace.allowedPages.includes(String(conversation.channelId ?? "")));
  }
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
