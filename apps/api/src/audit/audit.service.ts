export interface AuditEvent { action: string; actorId?: string; requestId?: string; metadata?: Record<string, unknown>; }
export function audit(event: AuditEvent): void {
  console.info("audit", { action: event.action, actorId: event.actorId, requestId: event.requestId, metadata: event.metadata });
}
