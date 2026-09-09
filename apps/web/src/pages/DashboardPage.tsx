import * as React from "react";
import { useEffect, useState } from "react";

import { apiRequest } from "../lib/api.js";

interface TelegramStatus { connected: boolean; displayName: string | null; username: string | null; }

export function DashboardPage({ token, refresh, onOpenTelegram, onOpenInbox }: { token: string; refresh?: () => Promise<string | null>; onOpenTelegram: () => void; onOpenInbox: () => void }) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  useEffect(() => { void apiRequest<TelegramStatus>("", "/api/v1/channels/telegram-personal/status", token, {}, refresh).then(setStatus).catch(() => setStatus({ connected: false, displayName: null, username: null })); }, [token, refresh]);
  const connected = status?.connected === true;
  return <main aria-labelledby="dashboard-title">
    <h1 id="dashboard-title">Dashboard</h1>
    <p>Quản lý các kênh nhắn tin của anh từ một nơi.</p>
    <section aria-labelledby="telegram-status-title">
      <h2 id="telegram-status-title">Telegram cá nhân</h2>
      {!status ? <p>Đang kiểm tra kết nối...</p> : connected ? <><p>Đang kết nối{status.username ? `: @${status.username}` : ""}.</p><button onClick={onOpenInbox}>Mở Inbox</button></> : <><p>Chưa kết nối tài khoản Telegram.</p><button onClick={onOpenTelegram}>Kết nối Telegram bằng QR</button></>}
    </section>
  </main>;
}
