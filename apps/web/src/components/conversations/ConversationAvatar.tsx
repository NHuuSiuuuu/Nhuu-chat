import * as React from "react";
import { InboxIcon } from "./InboxIcon.js";

export function ConversationAvatar({ name, avatarUrl, isGroup, size = "size-[42px]" }: { name: string; avatarUrl?: string; isGroup?: boolean; size?: string }) {
  if (isGroup) return <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700`} aria-label="Hội thoại nhóm"><InboxIcon name="users" size={20} /></span>;
  if (avatarUrl) return <img className={`${size} shrink-0 rounded-full object-cover`} src={avatarUrl} alt={`Avatar ${name}`} />;
  return <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-blue-100 text-[13px] font-bold text-blue-700`}>{name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")}</span>;
}
