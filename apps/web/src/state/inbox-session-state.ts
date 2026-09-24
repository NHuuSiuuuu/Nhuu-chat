export interface InboxSessionState {
  drafts: Record<string, string>;
  scrollPositions: Record<string, number>;
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface VisibilityDocumentLike {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface VisibilitySocketLike {
  connect(): unknown;
  disconnect(): unknown;
}

export function runIntervalWhileVisible(callback: () => void, intervalMs: number, documentRef: VisibilityDocumentLike): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const syncVisibility = () => {
    if (documentRef.visibilityState === "hidden") {
      if (timer !== null) clearInterval(timer);
      timer = null;
      return;
    }
    if (timer === null) timer = setInterval(callback, intervalMs);
  };
  documentRef.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();
  return () => {
    if (timer !== null) clearInterval(timer);
    documentRef.removeEventListener("visibilitychange", syncVisibility);
  };
}

export function inboxSessionStorageKey(userId: string | undefined, workspaceId: string): string {
  return `nhuu-chat.inbox-session.${encodeURIComponent(userId || "anonymous")}.${encodeURIComponent(workspaceId || "default")}`;
}

// Nạp phần trạng thái tạm ngay khi render đầu tiên, bỏ qua dữ liệu hỏng để tránh làm rơi Inbox.
export function readInboxSessionState(storage: SessionStorageLike, key: string): InboxSessionState {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object") return { drafts: {}, scrollPositions: {} };
    const value = parsed as Partial<InboxSessionState>;
    const drafts = Object.fromEntries(Object.entries(value.drafts ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const scrollPositions = Object.fromEntries(Object.entries(value.scrollPositions ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0));
    return { drafts, scrollPositions };
  } catch {
    return { drafts: {}, scrollPositions: {} };
  }
}

export function writeInboxSessionState(storage: SessionStorageLike, key: string, state: InboxSessionState): void {
  try {
    storage.setItem(key, JSON.stringify({ drafts: state.drafts, scrollPositions: state.scrollPositions }));
  } catch {
    // Bộ nhớ phiên có thể bị trình duyệt giới hạn hoặc vô hiệu hóa.
  }
}

// Tạm ngắt realtime khi tab nền để giảm hoạt động mạng và nối lại cùng bước đồng bộ khi người dùng quay lại.
export function pauseSocketWhenHidden(socket: VisibilitySocketLike, documentRef: VisibilityDocumentLike, onResume?: () => void): () => void {
  let paused = false;
  const syncVisibility = () => {
    if (documentRef.visibilityState === "hidden") {
      if (!paused) socket.disconnect();
      paused = true;
      return;
    }
    if (paused) {
      socket.connect();
      onResume?.();
    }
    paused = false;
  };
  documentRef.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();
  return () => documentRef.removeEventListener("visibilitychange", syncVisibility);
}
