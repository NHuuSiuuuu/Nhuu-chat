import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../lib/api.js";
import { ConnectModal } from "../components/dashboard/ConnectModal.js";
import { DashboardTopbar, type DashboardAccount } from "../components/dashboard/DashboardTopbar.js";
import { PlatformIcon } from "../components/dashboard/PlatformIcon.js";

interface TelegramStatus { connected: boolean; displayName: string | null; username: string | null; }
interface ZaloStatus { id: string; status: "disconnected" | "waiting_qr" | "connected" | "expired" | "error"; displayName?: string; username?: string; }

export interface DashboardConnectedAccount { id: "telegram_personal" | "zalo_personal"; platform: "telegram" | "zalo"; name: string; username?: string; status?: "error"; }

export function buildDashboardAccounts(telegram: TelegramStatus, zalo: ZaloStatus): DashboardConnectedAccount[] {
  const accounts: DashboardConnectedAccount[] = [];
  if (telegram.connected) accounts.push({ id: "telegram_personal", platform: "telegram", name: telegram.displayName ?? "Telegram cá nhân", ...(telegram.username ? { username: telegram.username } : {}) });
  if (zalo.status === "connected" || (zalo.status === "error" && zalo.displayName)) {
    accounts.push({ id: "zalo_personal", platform: "zalo", name: zalo.displayName ?? "Zalo cá nhân", ...(zalo.username ? { username: zalo.username } : {}), ...(zalo.status === "error" ? { status: "error" as const } : {}) });
  }
  return accounts;
}

export function conversationPathForPlatform(platform?: DashboardConnectedAccount["id"]): string {
  return "/inbox";
}

export function DashboardPage({ token, refresh, onOpenInbox, onLogoClick, onNavigate, user, onLogout, onProfile }: { token: string; refresh?: () => Promise<string | null>; onOpenInbox: (platform?: DashboardConnectedAccount["id"]) => void; onLogoClick?: () => void; onNavigate?: (item: "Hội thoại" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void; user?: DashboardAccount | null; onLogout?: () => void; onProfile?: () => void }) {
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [zaloStatus, setZaloStatus] = useState<ZaloStatus | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [accountToDeactivate, setAccountToDeactivate] = useState<DashboardConnectedAccount | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "zalo" | "telegram">("all");
  const loadStatus = useCallback(async () => {
    const [telegram, zalo] = await Promise.all([
      apiRequest<TelegramStatus>("", "/api/v1/channels/telegram-personal/status", token, {}, refresh).catch(() => ({ connected: false, displayName: null, username: null })),
      apiRequest<ZaloStatus>("", "/api/v1/channels/zalo-personal/status", token, {}, refresh).catch(() => ({ id: "zalo", status: "disconnected" as const }))
    ]);
    setTelegramStatus(telegram);
    setZaloStatus(zalo);
  }, [refresh, token]);
  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const accounts = useMemo(() => buildDashboardAccounts(telegramStatus ?? { connected: false, displayName: null, username: null }, zaloStatus ?? { id: "zalo", status: "disconnected" }), [telegramStatus, zaloStatus]);
  const visibleAccounts = accounts.filter((account) => {
    if (filter !== "all" && account.platform !== filter) return false;
    return !search || `${account.name} ${account.username ?? ""} ${account.platform}`.toLowerCase().includes(search.toLowerCase());
  });
  const openModal = () => setShowConnect(true);
  const openDeactivateModal = (account: DashboardConnectedAccount) => { setDeactivateError(null); setAccountToDeactivate(account); };
  const closeDeactivateModal = () => { if (!isDeactivating) setAccountToDeactivate(null); };
  const deactivateAccount = async () => {
    if (!accountToDeactivate || accountToDeactivate.id !== "zalo_personal") return;
    setIsDeactivating(true);
    setDeactivateError(null);
    try {
      await apiRequest<void>("", "/api/v1/channels/zalo-personal/logout", token, { method: "POST" }, refresh);
      setAccountToDeactivate(null);
      await loadStatus();
    } catch {
      setDeactivateError("Không thể hủy kích hoạt tài khoản. Vui lòng thử lại.");
    } finally {
      setIsDeactivating(false);
    }
  };

  return <main className="min-h-screen bg-[#f2f5f9] pt-16 text-[#273348] max-[700px]:px-[34px] max-[700px]:pt-28" aria-labelledby="dashboard-title">
    <DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile} />
    <div className="mx-auto w-full max-w-[954px]">
      <header className="mb-2 flex items-end justify-between gap-6 rounded-[14px] bg-white px-[17px] pb-4 pt-[19px] max-[700px]:items-stretch max-[700px]:flex-col">
        <div><h1 id="dashboard-title" className="mb-[18px] text-[21px] tracking-[-.02em]">Bảng điều khiển</h1><label className="flex w-[430px] max-w-[48vw] items-center gap-[9px] rounded-[9px] border border-[#e0e6ee] bg-white px-[14px] py-[11px] text-[#a3afbf] shadow-[0_1px_2px_rgba(42,55,74,.03)] max-[700px]:w-auto max-[700px]:max-w-none"><span className="text-[25px] leading-[15px]" aria-hidden="true">⌕</span><input className="w-full bg-transparent text-[13px] text-[#354258] outline-none placeholder:text-[#a0abbb]" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kiếm..." aria-label="Tìm kiếm tài khoản" /></label></div>
        <div className="flex items-center gap-[9px] max-[700px]:justify-end"><button className="h-10 w-10 rounded-[9px] border border-[#e0e6ee] bg-white text-[21px] text-[#69778b] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2" type="button" aria-label="Làm mới" onClick={() => void loadStatus()}>↻</button><button className="h-10 rounded-[9px] border border-[#e0e6ee] bg-[#e9edf3] px-4 text-[13px] font-bold text-[#354258] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 max-[700px]:flex-1" type="button" onClick={openModal}><span className="text-lg">＋</span> Kết nối</button><button className="h-10 rounded-[9px] border border-[#e0e6ee] bg-white px-4 text-[13px] font-bold text-[#354258] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 max-[700px]:flex-1" type="button" onClick={() => onOpenInbox()}><span className="text-lg">♣</span> Gộp trang</button></div>
      </header>
      <nav className="mb-2 flex items-center gap-1 overflow-auto rounded-[12px] border border-[#e7ebf1] bg-white px-[14px] py-[9px]" aria-label="Lọc nền tảng"><FilterButton active={filter === "all"} onClick={() => setFilter("all")} provider="all" label="Tất cả" count={accounts.length} /><FilterButton active={filter === "zalo"} onClick={() => setFilter("zalo")} provider="zalo" label="Zalo" count={accounts.filter((account) => account.platform === "zalo").length} /><FilterButton active={filter === "telegram"} onClick={() => setFilter("telegram")} provider="telegram" label="Telegram" count={accounts.filter((account) => account.platform === "telegram").length} /></nav>
      <section className="min-h-[330px] rounded-[14px] border border-[#e8edf3] bg-white p-5" aria-labelledby="accounts-title"><div className="mb-[15px] flex items-center justify-between px-1"><h2 id="accounts-title" className="text-[14px]">Tài khoản đã kết nối</h2><span className="text-[12px] text-[#94a0af]">{accounts.length} tài khoản</span></div>{(!telegramStatus || !zaloStatus) ? <div className="py-20 text-center text-[13px] text-[#8591a1]">Đang kiểm tra kết nối...</div> : visibleAccounts.length > 0 ? <div className="flex flex-wrap gap-3">{visibleAccounts.map((account) => <ConnectedAccountCard account={account} key={account.id} onOpen={() => onOpenInbox(account.id)} onDeactivate={() => openDeactivateModal(account)} />)}</div> : <div className="grid justify-items-center px-5 pb-20 pt-[100px] text-center"><div className="mb-[18px] grid h-[58px] w-[58px] place-items-center rounded-full bg-[#e9f6fc] text-[30px] text-[#22a8df]">＋</div><h3 className="mb-2 text-base">Chưa có tài khoản kết nối</h3><p className="text-[13px] text-[#8390a1]">Kết nối Zalo hoặc Telegram để bắt đầu nhận và trả lời tin nhắn.</p><button className="mt-5 cursor-pointer rounded-lg border-0 bg-[#2aa9e7] px-4 py-[10px] text-[12px] font-bold text-white focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2" type="button" onClick={openModal}>Kết nối tài khoản</button></div>}</section>
    </div>
    {showConnect && <ConnectModal token={token} refresh={refresh} onClose={() => setShowConnect(false)} onConnected={() => { void loadStatus(); }} />}
    {accountToDeactivate && <DeactivateAccountModal account={accountToDeactivate} error={deactivateError} loading={isDeactivating} onCancel={closeDeactivateModal} onConfirm={() => void deactivateAccount()} />}
  </main>;
}

function FilterButton({ active, onClick, provider, label, count }: { active: boolean; onClick: () => void; provider: "all" | "zalo" | "telegram"; label: string; count: number }) { return <button className={`flex items-center rounded-lg border-0 px-[13px] py-2 text-[13px] text-[#748196] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 ${active ? "bg-[#dff2fc] font-bold text-[#187ba9]" : "bg-transparent"}`} type="button" onClick={onClick}><span className="mr-1 inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf1f5]"><PlatformIcon provider={provider} /></span> {label} <b className={`ml-[5px] inline-grid h-[21px] min-w-[21px] place-items-center rounded-full text-[11px] ${active ? "bg-[#159fe0] text-white" : "bg-[#e7edf4] text-[#7f8b9b]"}`}>{count}</b></button>; }

function ConnectedAccountCard({ account, onOpen, onDeactivate }: { account: DashboardConnectedAccount; onOpen: () => void; onDeactivate: () => void }) { const needsReconnect = account.status === "error"; return <div className="flex w-[395px] max-w-full items-center rounded-[13px] border border-[#e3e8ef] bg-white px-[14px] py-[13px] shadow-[0_2px_8px_rgba(37,55,78,.04)] hover:border-[#b9ddec] hover:shadow-[0_5px_14px_rgba(37,55,78,.08)]"><button className="flex min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2" type="button" onClick={onOpen}><span className="mr-[13px] grid h-[55px] w-[55px] shrink-0 place-items-center rounded-[9px] bg-gradient-to-br from-[#26394f] to-[#111923] text-[21px] font-bold text-white">{account.name.slice(0, 1).toUpperCase()}</span><span className="grid min-w-0 gap-[7px]"><strong className="text-[14px]">{account.name}</strong><small className="flex items-center text-[12px] text-[#7e8b9c]"><span className="mr-[3px] inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf1f5]"><PlatformIcon provider={account.platform} /></span> {needsReconnect ? "Cần kết nối lại" : account.username ? `@${account.username}` : `${account.platform === "zalo" ? "Zalo" : "Telegram"} cá nhân`}</small></span><span className={`ml-auto text-[19px] ${needsReconnect ? "text-[#e87927]" : "text-[#f3a51d]"}`} title={needsReconnect ? "Cần kết nối lại" : "Đang hoạt động"}>●</span></button>{account.id === "zalo_personal" && <button className="ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg border-0 bg-transparent text-xl leading-none text-[#7e8b9c] hover:bg-[#f1f5f9] hover:text-[#354258] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2" type="button" aria-label="Tùy chọn tài khoản" onClick={onDeactivate}>⋮</button>}</div>; }

function DeactivateAccountModal({ account, error, loading, onCancel, onConfirm }: { account: DashboardConnectedAccount; error: string | null; loading: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1b2738]/45 p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="deactivate-account-title"><h2 id="deactivate-account-title" className="text-lg font-bold text-[#273348]">Xác nhận hủy kích hoạt</h2><p className="mt-3 text-sm leading-6 text-[#68768a]">Bạn có chắc muốn hủy kích hoạt tài khoản <strong className="text-[#354258]">{account.name}</strong>? Tài khoản sẽ bị ngắt kết nối, nhưng các cuộc hội thoại và tin nhắn đã lưu vẫn được giữ nguyên.</p>{error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button className="rounded-lg border border-[#dce3eb] bg-white px-4 py-2 text-sm font-semibold text-[#59677a]" type="button" disabled={loading} onClick={onCancel}>Để lại</button><button className="rounded-lg bg-[#dc4b4b] px-4 py-2 text-sm font-bold text-white disabled:opacity-60" type="button" disabled={loading} onClick={onConfirm}>{loading ? "Đang hủy kích hoạt..." : "Hủy kích hoạt"}</button></div></section></div>; }
