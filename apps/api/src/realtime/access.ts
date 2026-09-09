type RealtimeAuth = { id: string; role: string };
type ConversationAccess = { ownerId?: unknown; assignedAgentId?: unknown };

export function canJoinConversation(auth: RealtimeAuth, conversation: ConversationAccess): boolean {
  if (auth.role === "admin") return true;
  if (auth.role === "agent") return String(conversation.assignedAgentId ?? "") === auth.id;
  return String(conversation.ownerId ?? "") === auth.id;
}

export function canMarkConversationRead(auth: RealtimeAuth, conversation: ConversationAccess): boolean {
  return canJoinConversation(auth, conversation);
}
