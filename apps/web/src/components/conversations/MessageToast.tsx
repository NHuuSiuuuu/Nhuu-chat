import * as React from "react";
import type { ChatPlatform } from "@nhuu-chat/contracts";
import { ConversationAvatar } from "./ConversationAvatar.js";
import { InboxIcon } from "./InboxIcon.js";
import { PlatformIcon } from "../dashboard/PlatformIcon.js";
import type { ConnectionProviderId } from "../../state/dashboard-ui.js";

export interface MessageToastData {
  id: string;
  conversationId: string;
  senderName: string;
  content: string;
  platform: ChatPlatform;
  avatarUrl?: string;
}

export function appendMessageToast(toasts: MessageToastData[], toast: MessageToastData): MessageToastData[] {
  if (toasts.some((item) => item.id === toast.id)) return toasts;
  return [...toasts, toast].slice(-3);
}

function platformIconProvider(platform: ChatPlatform): ConnectionProviderId {
  return platform === "telegram_personal" ? "telegram" : platform;
}

export function MessageToast({ toast, onOpen, onClose }: { toast: MessageToastData; onOpen: (conversationId: string) => void; onClose: (id: string) => void }) {
  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => onClose(toast.id), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [onClose, toast.id]);

  return <article className="relative w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl bg-slate-800 text-white shadow-2xl ring-1 ring-white/10" role="status">
    <button className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-300" type="button" onClick={() => onOpen(toast.conversationId)}>
      <ConversationAvatar name={toast.senderName} avatarUrl={toast.avatarUrl} size="size-12" />
       <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm">{toast.senderName}</strong><PlatformIcon provider={platformIconProvider(toast.platform)} size={16} plain /></span><span className="mt-1 block truncate text-xs text-slate-300">{toast.content || "Đã gửi một tin nhắn mới"}</span></span>
    </button>
    <button className="absolute right-2 top-2 grid size-6 place-items-center rounded-md text-slate-300 transition hover:bg-slate-600 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-300" type="button" onClick={(event) => { event.stopPropagation(); onClose(toast.id); }} aria-label="Đóng thông báo"><InboxIcon name="close" size={14} /></button>
    <span className="block h-1 origin-left animate-[toast-progress_5s_linear_forwards] bg-sky-400" aria-hidden="true" />
  </article>;
}
