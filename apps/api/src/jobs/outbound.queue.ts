export interface OutboundCommand { messageId: string; conversationId: string; platform: string; channelId: string; content: string; }
export interface OutboundJob extends OutboundCommand { id: string; attempts: number; status: "queued" | "completed" | "failed"; runAt: number; lastError?: string; }
export class OutboundQueue {
  private readonly jobs = new Map<string, OutboundJob>();
  constructor(private readonly now = () => new Date(), private readonly idFactory: () => string = () => crypto.randomUUID()) {}
  async enqueue(command: OutboundCommand): Promise<string> { const id = this.idFactory(); this.jobs.set(id, { ...command, id, attempts: 0, status: "queued", runAt: this.now().getTime() }); return id; }
  get(id: string) { return this.jobs.get(id); }
  nextDue() { return [...this.jobs.values()].find((job) => job.status === "queued" && job.runAt <= this.now().getTime()); }
  update(id: string, patch: Partial<OutboundJob>) { const job = this.jobs.get(id); if (job) Object.assign(job, patch); }
}
