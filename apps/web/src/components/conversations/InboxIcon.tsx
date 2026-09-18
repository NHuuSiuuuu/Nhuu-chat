import * as React from "react";

type IconName = "inbox" | "chat" | "users" | "settings" | "help" | "search" | "filter" | "plus" | "list" | "chevron-left" | "chevron-down" | "chevron-up" | "tag" | "edit" | "trash" | "pin" | "monitor" | "phone" | "cloud" | "wrench" | "clock" | "send" | "paperclip" | "sparkles" | "refresh" | "note" | "image" | "template" | "close" | "smile" | "reply" | "more" | "check" | "copy" | "download" | "upload" | "file" | "camera" | "robot" | "layers";

export function InboxIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    inbox: <><path d="M4 5h16v14H4z" /><path d="M4 14h4l1.5 2h5L16 14h4" /></>,
    chat: <><path d="M5 5h14v10H9l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
    users: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.5-3 2.3-4.5 5.5-4.5s5 1.5 5.5 4.5M16 7a3 3 0 0 1 0 5M16 14.5c2.4.2 3.8 1.7 4.2 4.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19 12 2-1-2-3-2 .5a7 7 0 0 0-1.5-1L15 5h-3l-.5 2.5a7 7 0 0 0-1.5 1L8 8 6 10l2 2a7 7 0 0 0 0 2l-2 2 2 2 2-.5a7 7 0 0 0 1.5 1L12 21h3l.5-2.5a7 7 0 0 0 1.5-1L19 18l2-2-2-2a7 7 0 0 0 0-2Z" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 3.8 2c-1 .7-1.5 1.1-1.5 2.2M12 16.5h.01" /></>,
    search: <><circle cx="10.8" cy="10.8" r="5.8" /><path d="m15 15 4 4" /></>,
    filter: <path d="M4 6h16M7 12h10M10 18h4" />,
    plus: <path d="M12 5v14M5 12h14" />,
    list: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    "chevron-up": <path d="m6 15 6-6 6 6" />,
    tag: <path d="m20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0L3.4 13.4a2 2 0 0 1 0-2.8l7.2-7.2A2 2 0 0 1 12 2.8h5.8a2 2 0 0 1 2 2V10a2 2 0 0 1-.6 1.4ZM16 7h.01" />,
    edit: <><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" /><path d="m13.5 7 3.5 3.5" /></>,
    trash: <><path d="M5 7h14M10 11v6M14 11v6" /><path d="M9 7V4h6v3m-9 0 1 13h10l1-13" /></>,
    pin: <path d="m15 4 5 5-3 1-3.5 3.5.5 3.5-2 2-2-4-4-2 2-2 3.5.5L15 8l-1-3Z" />,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    phone: <path d="M6.5 4.5 9 4l2 4-2 1.5a14 14 0 0 0 5.5 5.5L16 13l4 2-.5 2.5c-.2 1.2-1.3 2-2.5 1.8A15.8 15.8 0 0 1 4.7 7c-.2-1.2.6-2.3 1.8-2.5Z" />,
    cloud: <path d="M7.5 19h10a4 4 0 0 0 .6-8A6.5 6.5 0 0 0 6 9.5 4.5 4.5 0 0 0 7.5 19Z" />,
    wrench: <path d="m14.7 6.3 3-3a5 5 0 0 0-5.9 6L4.5 16.6a2 2 0 1 0 2.8 2.8l6.7-7.3a5 5 0 0 0 6-5.8l-3 3-2.3-.8-.8-2.2Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    send: <path d="m3 4 18 8-18 8 3-8-3-8Zm3 8h9" />,
    paperclip: <path d="m8 12 5.5-5.5a3 3 0 0 1 4.2 4.2L11 17.4a4 4 0 1 1-5.7-5.7l6-6" />,
    sparkles: <><path d="m12 3-1.2 4.8L6 9l4.8 1.2L12 15l1.2-4.8L18 9l-4.8-1.2L12 3Z" /><path d="m19 15-.6 2.4L16 18l2.4.6L19 21l.6-2.4L22 18l-2.4-.6L19 15Z" /></>,
    refresh: <path d="M20 11a8 8 0 0 0-14.7-3L3 11m0-5v5h5M4 13a8 8 0 0 0 14.7 3L21 13m0 5v-5h-5" />,
    note: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h6M8 16h4" /></>,
    image: <><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.3" /><path d="m5 17 4-4 3 3 2-2 5 4" /></>,
    template: <><path d="M5 5h14v14H5z" /><path d="M8 9h8M8 12h6M8 15h4" /></>,
    close: <><path d="m7 7 10 10M17 7 7 17" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9h.01M15 9h.01" /></>,
    reply: <path d="m9 17-5-5 5-5M4 12h10a6 6 0 0 1 6 6" />,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    copy: <><rect x="8" y="8" width="11" height="11" rx="1.5" /><path d="M16 8V5H5v11h3" /></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
    upload: <><path d="M12 21V9M7 14l5-5 5 5" /><path d="M5 3h14" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 13h6M9 17h6" /></>,
    camera: <><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3" /></>,
    robot: <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6" /><path d="M3 12v3M21 12v3" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
