type RealtimeAuth = { id: string; role: string };
type ConversationAccess = { ownerId?: unknown; assignedAgentId?: unknown };

export function conversationAccessFilter(auth: RealtimeAuth): Record<string, string> {
  if (auth.role === "admin") return {};
  return auth.role === "agent" ? { assignedAgentId: auth.id } : { ownerId: auth.id };
}

export function canJoinConversation(auth: RealtimeAuth, conversation: ConversationAccess): boolean {
  if (auth.role === "admin") return true;
  if (auth.role === "agent") return String(conversation.assignedAgentId ?? "") === auth.id;
  return String(conversation.ownerId ?? "") === auth.id;
}

export function canMarkConversationRead(auth: RealtimeAuth, conversation: ConversationAccess): boolean {
  return canJoinConversation(auth, conversation);
}
