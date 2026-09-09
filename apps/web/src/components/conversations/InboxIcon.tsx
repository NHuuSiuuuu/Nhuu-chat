import * as React from "react";

type IconName = "inbox" | "chat" | "users" | "settings" | "help" | "search" | "filter" | "plus" | "list" | "send" | "paperclip";

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
    send: <path d="m3 4 18 8-18 8 3-8-3-8Zm3 8h9" />,
    paperclip: <path d="m8 12 5.5-5.5a3 3 0 0 1 4.2 4.2L11 17.4a4 4 0 1 1-5.7-5.7l6-6" />
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
