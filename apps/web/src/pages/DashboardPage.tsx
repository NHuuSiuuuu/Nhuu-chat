import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { FacebookPageConnectionResponse, WorkspaceChannelRef } from "@nhuu-chat/contracts";

import { apiRequest } from "../lib/api.js";
import { FacebookPublishingApiError, getFacebookPageConnection, removeFacebookPage } from "../lib/facebook-publishing.api.js";
import { ConnectModal } from "../components/dashboard/ConnectModal.js";
import { DashboardTopbar, type DashboardAccount } from "../components/dashboard/DashboardTopbar.js";
import { InboxIcon } from "../components/conversations/InboxIcon.js";
import { MergePagesModal, selectAllMergePages } from "../components/dashboard/MergePagesModal.js";
import { PlatformIcon } from "../components/dashboard/PlatformIcon.js";
import { useWorkspacePicker } from "../components/dashboard/workspace-picker-context.js";

interface TelegramStatus { connected: boolean; telegramUserId?: string | null; displayName: string | null; username: string | null; avatarUrl?: string | null; }
interface ZaloStatus { id: string; zaloUserId?: string | null; status: "disconnected" | "waiting_qr" | "connected" | "expired" | "error"; displayName?: string; username?: string; avatarUrl?: string | null; }
type FacebookStatus = Pick<FacebookPageConnectionResponse, "id" | "pageId" | "pageName" | "avatarUrl" | "status">;
type FacebookDashboardLoadResult = { connection: FacebookPageConnectionResponse | null; error: string | null };
type WorkspaceDashboardChannel = WorkspaceChannelRef & { name: string; displayId?: string; avatarUrl?: string };

const FACEBOOK_DASHBOARD_TIMEOUT_MS = 10_000;
const FACEBOOK_DASHBOARD_ERROR = "Không thể kiểm tra kết nối Facebook. Vui lòng thử lại.";

// Giới hạn thời gian kiểm tra Facebook và phân biệt chưa kết nối với lỗi dịch vụ.
export async function loadFacebookDashboardStatus(
  fetchConnection: (signal: AbortSignal) => Promise<FacebookPageConnectionResponse> = (signal) => getFacebookPageConnection(undefined, signal),
  timeoutMs = FACEBOOK_DASHBOARD_TIMEOUT_MS
): Promise<FacebookDashboardLoadResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return { connection: await fetchConnection(controller.signal), error: null };
  } catch (error) {
    if (error instanceof FacebookPublishingApiError && (error.status === 404 || error.code === "FACEBOOK_PAGE_NOT_CONNECTED")) {
      return { connection: null, error: null };
    }
    return { connection: null, error: FACEBOOK_DASHBOARD_ERROR };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createLatestRequestRunner<T>(onResult: (result: T) => void): (request: () => Promise<T>) => Promise<T> {
  let requestId = 0;
  return async (request) => {
    const currentRequestId = ++requestId;
    const result = await request();
    if (currentRequestId === requestId) onResult(result);
    return result;
  };
}

// Kênh dùng ID ghép platform/channel; phiên cá nhân giữ một lựa chọn cho cả Inbox của phiên.
export interface DashboardConnectedAccount { id: "telegram_personal" | "zalo_personal" | `${"facebook" | "instagram" | "zalo" | "telegram"}:${string}`; platform: "telegram" | "zalo" | "facebook" | "instagram"; identifier?: string | null; pageId?: string; name: string; username?: string; avatarUrl?: string | null; status?: "error"; }

// Chuyển mọi kênh mà API đã cấp cho Workspace thành thẻ điều hướng Inbox.
export function buildWorkspaceDashboardAccounts(channels: WorkspaceDashboardChannel[]): DashboardConnectedAccount[] {
  return channels.map((channel) => {
    const personalPlatform = channel.platform === "zalo_personal" || channel.platform === "telegram_personal";
    const provider = channel.platform.replace(/_personal$/, "") as DashboardConnectedAccount["platform"];
    const id: DashboardConnectedAccount["id"] = personalPlatform
      ? channel.platform as "zalo_personal" | "telegram_personal"
      : `${channel.platform}:${channel.channelId}` as DashboardConnectedAccount["id"];
    return {
      id,
      platform: provider,
      identifier: channel.displayId ?? channel.channelId,
      ...(channel.platform === "facebook" ? { pageId: channel.channelId } : {}),
      name: channel.name,
      ...(channel.avatarUrl ? { avatarUrl: channel.avatarUrl } : {})
    };
  });
}

// Chuẩn hóa định danh thật của từng kênh để card không phụ thuộc username hiển thị.
export function buildDashboardAccounts(telegram: TelegramStatus, zalo: ZaloStatus, facebook?: FacebookStatus | null): DashboardConnectedAccount[] {
  const accounts: DashboardConnectedAccount[] = [];
  if (telegram.connected) accounts.push({ id: "telegram_personal", platform: "telegram", name: telegram.displayName ?? "Telegram cá nhân", ...(telegram.telegramUserId ? { identifier: telegram.telegramUserId } : {}), ...(telegram.username ? { username: telegram.username } : {}), ...(telegram.avatarUrl ? { avatarUrl: telegram.avatarUrl } : {}) });
  if (zalo.status === "connected" || (zalo.status === "error" && zalo.displayName)) {
    accounts.push({ id: "zalo_personal", platform: "zalo", name: zalo.displayName ?? "Zalo cá nhân", ...(zalo.zaloUserId ? { identifier: zalo.zaloUserId } : {}), ...(zalo.username ? { username: zalo.username } : {}), ...(zalo.avatarUrl ? { avatarUrl: zalo.avatarUrl } : {}), ...(zalo.status === "error" ? { status: "error" as const } : {}) });
  }
  if (facebook?.status === "connected") {
    accounts.push({ id: `facebook:${facebook.pageId}`, platform: "facebook", identifier: facebook.pageId, pageId: facebook.pageId, name: facebook.pageName?.trim() || "Facebook Page", ...(facebook.avatarUrl ? { avatarUrl: facebook.avatarUrl } : {}) });
  }
  return accounts;
}

export function conversationPathForPlatform(platform?: DashboardConnectedAccount["id"]): string {
  if (platform === "zalo_personal" || platform === "telegram_personal") return "/inbox";
  if (platform) {
    const separatorIndex = platform.indexOf(":");
    const provider = platform.slice(0, separatorIndex);
    const channelId = separatorIndex >= 0 ? platform.slice(separatorIndex + 1) : "";
    if (["facebook", "instagram", "zalo", "telegram"].includes(provider) && channelId) {
      return `/inbox?platform=${provider}&channelId=${encodeURIComponent(channelId)}`;
    }
  }
  return "/inbox";
}

export function DashboardPage({ token, refresh, onOpenInbox, onLogoClick, onNavigate, user, onLogout, onProfile, settingsSubmenuItems, nestedSettingsSubmenuItems, onSettingsSubmenuNavigate, onNestedSettingsSubmenuNavigate }: { token: string; refresh?: () => Promise<string | null>; onOpenInbox: (platform?: DashboardConnectedAccount["id"]) => void; onLogoClick?: () => void; onNavigate?: (item: "Hộp thư" | "Đơn hàng" | "Bài viết" | "Thống kê" | "Cài đặt") => void; user?: DashboardAccount | null; onLogout?: () => void; onProfile?: () => void; settingsSubmenuItems?: readonly string[]; nestedSettingsSubmenuItems?: Readonly<Record<string, readonly string[]>>; onSettingsSubmenuNavigate?: (item: string) => void; onNestedSettingsSubmenuNavigate?: (item: string) => void }) {
  const location = useLocation();
  const workspacePicker = useWorkspacePicker();
  const activeWorkspace = workspacePicker?.workspaces.find((workspace) => workspace.id === workspacePicker.activeWorkspaceId);
  const isWorkspaceStaff = activeWorkspace?.role === "staff";
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [zaloStatus, setZaloStatus] = useState<ZaloStatus | null>(null);
  const [facebookStatus, setFacebookStatus] = useState<FacebookPageConnectionResponse | null>();
  const [facebookError, setFacebookError] = useState<string | null>(null);
  const [workspaceChannels, setWorkspaceChannels] = useState<WorkspaceDashboardChannel[] | null>(null);
  const [workspaceChannelsError, setWorkspaceChannelsError] = useState(false);
  const [workspaceChannelRefreshKey, setWorkspaceChannelRefreshKey] = useState(0);
  const [showConnect, setShowConnect] = useState(() => new URLSearchParams(location.search).get("facebook_oauth") !== null);
  const [connectionProvider, setConnectionProvider] = useState<DashboardConnectedAccount["platform"] | undefined>();
  const [accountToDeactivate, setAccountToDeactivate] = useState<DashboardConnectedAccount | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | DashboardConnectedAccount["platform"]>("all");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [showMergePages, setShowMergePages] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [selectedMergePageIds, setSelectedMergePageIds] = useState<Set<string>>(new Set());
  const [isReloading, setIsReloading] = useState(false);
  const facebookStatusRunnerRef = useRef(createLatestRequestRunner<FacebookDashboardLoadResult>((result) => {
    setFacebookStatus(result.connection);
    setFacebookError(result.error);
  }));
  const loadFacebookStatus = useCallback(async () => {
    setFacebookStatus(undefined);
    setFacebookError(null);
    await facebookStatusRunnerRef.current(() => loadFacebookDashboardStatus());
  }, []);
  const loadStatus = useCallback(async (waitForFacebook = false) => {
    const facebookPromise = loadFacebookStatus();
    const [telegram, zalo] = await Promise.all([
      apiRequest<TelegramStatus>("", "/api/v1/channels/telegram-personal/status", token, {}, refresh).catch(() => ({ connected: false, displayName: null, username: null })),
      apiRequest<ZaloStatus>("", "/api/v1/channels/zalo-personal/status", token, {}, refresh).catch(() => ({ id: "zalo", status: "disconnected" as const }))
    ]);
    setTelegramStatus(telegram);
    setZaloStatus(zalo);
    if (waitForFacebook) await facebookPromise;
  }, [loadFacebookStatus, refresh, token]);
  useEffect(() => { void loadStatus(); }, [loadStatus]);
  useEffect(() => {
    if (!isWorkspaceStaff || !activeWorkspace?.id) {
      setWorkspaceChannels(null);
      setWorkspaceChannelsError(false);
      return;
    }
    let cancelled = false;
    setWorkspaceChannels(null);
    setWorkspaceChannelsError(false);
    void apiRequest<{ channels: WorkspaceDashboardChannel[] }>("", `/api/v1/workspaces/${activeWorkspace.id}/channels`, token, {}, refresh)
      .then((result) => { if (!cancelled) setWorkspaceChannels(result.channels); })
      .catch(() => { if (!cancelled) { setWorkspaceChannels([]); setWorkspaceChannelsError(true); } });
    return () => { cancelled = true; };
  }, [activeWorkspace?.id, isWorkspaceStaff, refresh, token, workspaceChannelRefreshKey]);
  const reloadStatus = async () => {
    setIsReloading(true);
    try {
      await loadStatus();
      if (isWorkspaceStaff) setWorkspaceChannelRefreshKey((current) => current + 1);
    } finally {
      setIsReloading(false);
    }
  };

  const accounts = useMemo(() => isWorkspaceStaff
    ? buildWorkspaceDashboardAccounts(workspaceChannels ?? [])
    : buildDashboardAccounts(telegramStatus ?? { connected: false, displayName: null, username: null }, zaloStatus ?? { id: "zalo", status: "disconnected" }, facebookStatus),
  [facebookStatus, isWorkspaceStaff, telegramStatus, workspaceChannels, zaloStatus]);
  const accountsLoading = isWorkspaceStaff ? workspaceChannels === null : !telegramStatus || !zaloStatus;
  const visibleAccounts = accounts.filter((account) => {
    if (filter !== "all" && account.platform !== filter) return false;
    return !search || `${account.name} ${account.identifier ?? ""} ${account.username ?? ""} ${account.platform}`.toLowerCase().includes(search.toLowerCase());
  });
  const availablePlatforms = [...new Set(accounts.map((account) => account.platform))];
  const platformLabels: Partial<Record<DashboardConnectedAccount["platform"], string>> = { facebook: "Facebook", instagram: "Instagram", zalo: "Zalo", telegram: "Telegram" };
  const activeFilterLabel = filter === "all" ? "Tất cả nền tảng" : platformLabels[filter] ?? filter;
  const selectFilter = (nextFilter: "all" | DashboardConnectedAccount["platform"]) => { setFilter(nextFilter); setIsFilterMenuOpen(false); };
  const openModal = () => { setConnectionProvider(undefined); setShowConnect(true); };
  const openRefreshModal = (account: DashboardConnectedAccount) => { setConnectionProvider(account.platform); setShowConnect(true); };
  const openMergeModal = () => { setMergeSearch(""); setSelectedMergePageIds(new Set()); setShowMergePages(true); };
  const toggleMergePage = (pageId: string) => setSelectedMergePageIds((current) => {
    const next = new Set(current);
    if (next.has(pageId)) next.delete(pageId); else next.add(pageId);
    return next;
  });
  const selectAllMergePagesFromSearch = () => setSelectedMergePageIds((current) => selectAllMergePages(accounts, mergeSearch, current));
  const mergeSelectedPages = () => { setShowMergePages(false); onOpenInbox(); };
  const openDeactivateModal = (account: DashboardConnectedAccount) => { setDeactivateError(null); setAccountToDeactivate(account); };
  const closeDeactivateModal = () => { if (!isDeactivating) setAccountToDeactivate(null); };
  const deactivateAccount = async () => {
    if (!accountToDeactivate || (accountToDeactivate.id !== "zalo_personal" && accountToDeactivate.id !== "telegram_personal" && accountToDeactivate.platform !== "facebook")) return;
    setIsDeactivating(true);
    setDeactivateError(null);
    try {
      const disconnectRequest = accountToDeactivate.platform === "facebook"
        ? { method: "DELETE" as const }
        : { method: "POST" as const };
      if (disconnectRequest.method === "DELETE") {
        await removeFacebookPage();
      } else {
        const logoutPath = accountToDeactivate.id === "zalo_personal"
          ? "/api/v1/channels/zalo-personal/logout"
          : "/api/v1/channels/telegram-personal/logout";
        await apiRequest<void>("", logoutPath, token, disconnectRequest, refresh);
      }
      setAccountToDeactivate(null);
      await loadStatus(accountToDeactivate.platform === "facebook");
    } catch {
      setDeactivateError("Không thể hủy kích hoạt tài khoản. Vui lòng thử lại.");
    } finally {
      setIsDeactivating(false);
    }
  };

  return <main className="min-h-screen bg-[#f2f5f9] pt-16 text-[#273348] max-[700px]:px-[34px] max-[700px]:pt-0" aria-labelledby="dashboard-title">
     <DashboardTopbar onLogoClick={onLogoClick} onNavigate={onNavigate} user={user} onLogout={onLogout} onProfile={onProfile} settingsSubmenuItems={settingsSubmenuItems} nestedSettingsSubmenuItems={nestedSettingsSubmenuItems} onSettingsSubmenuNavigate={onSettingsSubmenuNavigate} onNestedSettingsSubmenuNavigate={onNestedSettingsSubmenuNavigate} />
    <div className="mx-auto w-full max-w-[954px] max-[700px]:mt-[34px]">
      <header className="mb-2 flex items-end justify-between gap-6 rounded-[14px] bg-white px-[17px] pb-4 pt-[19px] max-[700px]:items-stretch max-[700px]:flex-col">
        <div><h1 id="dashboard-title" className="mb-[18px] text-[21px] tracking-[-.02em]">Bảng điều khiển</h1><label className="flex w-[430px] max-w-[48vw] items-center gap-[9px] rounded-[9px] border border-[#e0e6ee] bg-white px-[14px] py-[11px] text-[#a3afbf] shadow-[0_1px_2px_rgba(42,55,74,.03)] max-[700px]:w-auto max-[700px]:max-w-none"><span className="text-[25px] leading-[15px]" aria-hidden="true">⌕</span><input className="w-full bg-transparent text-[13px] text-[#354258] outline-none placeholder:text-[#a0abbb]" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kiếm..." aria-label="Tìm kiếm tài khoản" /></label></div>
        <div className="flex items-center gap-[9px] max-[700px]:justify-end"><button className="grid h-10 w-10 place-items-center rounded-[9px] border border-[#e0e6ee] bg-white text-[#69778b] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60 cursor-pointer" type="button" aria-label="Làm mới" onClick={() => void reloadStatus()} disabled={isReloading}><InboxIcon name="refresh" size={18} className={isReloading ? "animate-spin" : ""} /></button>{!isWorkspaceStaff && <><button className="h-10 rounded-[9px] border border-[#e0e6ee] bg-[#e9edf3] px-4 text-[13px] font-bold text-[#354258] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 max-[700px]:flex-1 cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={openModal}><span className="text-lg">＋</span> Kết nối</button><button className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[9px] border border-[#e0e6ee] bg-white px-4 text-[13px] font-bold text-[#354258] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 max-[700px]:flex-1 cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={openMergeModal}><InboxIcon name="layers" size={17} /> Gộp trang</button></>}</div>
      </header>
      <div className="relative mb-2 min-[701px]:hidden">
         <button className="flex w-full items-center justify-between rounded-[12px] border border-[#e7ebf1] bg-white px-4 py-3 text-left text-[13px] font-semibold text-[#354258] shadow-sm focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 cursor-pointer transition-opacity hover:opacity-80" type="button" aria-label={isFilterMenuOpen ? "Đóng bộ lọc nền tảng" : "Mở bộ lọc nền tảng"} aria-expanded={isFilterMenuOpen} onClick={() => setIsFilterMenuOpen((current) => !current)}><span className="flex items-center gap-2"><PlatformIcon provider={filter} />{activeFilterLabel}<b className="inline-grid min-w-[21px] place-items-center rounded-full bg-[#e7edf4] px-1.5 py-0.5 text-[11px] text-[#7f8b9b]">{filter === "all" ? accounts.length : accounts.filter((account) => account.platform === filter).length}</b></span><InboxIcon name={isFilterMenuOpen ? "chevron-up" : "chevron-down"} size={17} /></button>
         {isFilterMenuOpen && <div className="absolute inset-x-0 top-full z-30 mt-1 grid gap-1 rounded-[12px] border border-[#e7ebf1] bg-white p-2 shadow-lg" role="listbox" aria-label="Danh sách nền tảng"><MobileFilterOption active={filter === "all"} onClick={() => selectFilter("all")} provider="all" label="Tất cả nền tảng" count={accounts.length} />{availablePlatforms.map((provider) => <MobileFilterOption key={provider} active={filter === provider} onClick={() => selectFilter(provider)} provider={provider} label={platformLabels[provider] ?? provider} count={accounts.filter((account) => account.platform === provider).length} />)}</div>}
       </div>
      <nav className="mb-2 hidden items-center gap-1 overflow-auto rounded-[12px] border border-[#e7ebf1] bg-white px-[14px] py-[9px] min-[701px]:flex" aria-label="Lọc nền tảng"><FilterButton active={filter === "all"} onClick={() => selectFilter("all")} provider="all" label="Tất cả" count={accounts.length} />{availablePlatforms.map((provider) => <FilterButton key={provider} active={filter === provider} onClick={() => selectFilter(provider)} provider={provider} label={platformLabels[provider] ?? provider} count={accounts.filter((account) => account.platform === provider).length} />)}</nav>
      <section className="min-h-[330px] rounded-[14px] border border-[#e8edf3] bg-white p-5" aria-label="Tài khoản đã kết nối">
        {accountsLoading ? <div className="py-20 text-center text-[13px] text-[#8591a1]">Đang tải kênh Workspace...</div> : <>
          {isWorkspaceStaff && workspaceChannelsError && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700" role="alert">Không thể tải các kênh được cấp quyền. Vui lòng thử làm mới.</p>}
          {!isWorkspaceStaff && facebookStatus === undefined && <p className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-[13px] text-blue-700" role="status">Đang kiểm tra kết nối Facebook...</p>}
          {!isWorkspaceStaff && facebookError && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700" role="alert"><span>{facebookError}</span><button className="rounded-lg border border-red-200 bg-white px-3 py-1.5 font-semibold hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-red-400 focus-visible:outline-offset-2 cursor-pointer" type="button" onClick={() => void loadFacebookStatus()}>Thử lại Facebook</button></div>}
          {visibleAccounts.length > 0 ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{visibleAccounts.map((account) => <ConnectedAccountCard account={account} key={account.id} canManage={!isWorkspaceStaff} onOpen={() => onOpenInbox(account.id)} onRefresh={() => openRefreshModal(account)} onDeactivate={() => openDeactivateModal(account)} />)}</div>
            : !workspaceChannelsError && (isWorkspaceStaff || (facebookStatus !== undefined && !facebookError)) ? <div className="grid justify-items-center px-5 pb-20 pt-[100px] text-center"><div className="mb-[18px] grid h-[58px] w-[58px] place-items-center rounded-full bg-[#e9f6fc] text-[30px] text-[#22a8df]">＋</div><h3 className="mb-2 text-base">{isWorkspaceStaff ? "Chưa được cấp quyền vào kênh nào" : "Chưa có tài khoản kết nối"}</h3><p className="text-[13px] text-[#8390a1]">{isWorkspaceStaff ? "Liên hệ chủ Workspace để được cấp quyền truy cập kênh." : "Kết nối Facebook, Zalo hoặc Telegram để quản lý các kênh tại một nơi."}</p>{!isWorkspaceStaff && <button className="mt-5 cursor-pointer rounded-lg border-0 bg-[#2aa9e7] px-4 py-[10px] text-[12px] font-bold text-white focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 transition-opacity hover:opacity-80" type="button" onClick={openModal}>Kết nối tài khoản</button>}</div> : null}
        </>}
      </section>
    </div>
    {showConnect && <ConnectModal token={token} refresh={refresh} initialProvider={connectionProvider} onClose={() => setShowConnect(false)} onConnected={() => { void loadStatus(); }} />}
    {showMergePages && <MergePagesModal pages={accounts} selectedIds={selectedMergePageIds} searchQuery={mergeSearch} onSearchChange={setMergeSearch} onTogglePage={toggleMergePage} onSelectAll={selectAllMergePagesFromSearch} onClose={() => setShowMergePages(false)} onMerge={mergeSelectedPages} />}
    {accountToDeactivate && <DeactivateAccountModal account={accountToDeactivate} error={deactivateError} loading={isDeactivating} onCancel={closeDeactivateModal} onConfirm={() => void deactivateAccount()} />}
  </main>;
}

function FilterButton({ active, onClick, provider, label, count }: { active: boolean; onClick: () => void; provider: "all" | "zalo" | "telegram" | "facebook" | "instagram"; label: string; count: number }) { return <button className={`flex items-center rounded-lg border-0 px-[13px] py-2 text-[13px] text-[#748196] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 ${active ? "bg-[#dff2fc] font-bold text-[#187ba9]" : "bg-transparent"} cursor-pointer transition-opacity hover:opacity-80`} type="button" onClick={onClick}>
  <span className="mr-1 inline-grid h-8 w-8 shrink-0 place-items-center "><PlatformIcon provider={provider} /></span>
   {label} <b className={`ml-[5px] inline-grid h-[21px] min-w-[21px] place-items-center rounded-full text-[11px] ${active ? "bg-[#159fe0] text-white" : "bg-[#e7edf4] text-[#7f8b9b]"}`}>{count}</b></button>; }

 function MobileFilterOption({ active, onClick, provider, label, count }: { active: boolean; onClick: () => void; provider: "all" | "zalo" | "telegram" | "facebook" | "instagram"; label: string; count: number }) { return <button className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 ${active ? "bg-[#dff2fc] font-bold text-[#187ba9]" : "text-[#748196] hover:bg-[#f5f8fb]"} cursor-pointer`} type="button" role="option" aria-selected={active} onClick={onClick}><PlatformIcon provider={provider} /><span className="flex-1">{label}</span><b className="inline-grid min-w-[21px] place-items-center rounded-full bg-[#e7edf4] px-1.5 py-0.5 text-[11px] text-[#7f8b9b]">{count}</b></button>; }

function ConnectedAccountCard({ account, onOpen, onRefresh, onDeactivate, canManage = true }: { account: DashboardConnectedAccount; onOpen: () => void; onRefresh: () => void; onDeactivate: () => void; canManage?: boolean }) {
  const needsReconnect = account.status === "error";
  const avatarUrl = account.avatarUrl?.trim();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  useEffect(() => setAvatarFailed(false), [avatarUrl]);
  return <article className="group relative flex min-w-0 items-start justify-between gap-3 rounded-xl border border-[#e3e8ef] bg-white p-4 shadow-[0_2px_8px_rgba(37,55,78,.04)] transition hover:border-[#b9ddec] hover:shadow-[0_5px_14px_rgba(37,55,78,.08)]">
    <button className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 border-0 bg-transparent pr-8 text-left focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 transition-opacity hover:opacity-80" type="button" onClick={onOpen}>
       <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-[#26394f] to-[#111923] text-[21px] font-bold text-white">{avatarUrl && !avatarFailed ? <img className="size-full object-cover" src={avatarUrl} alt={`Avatar ${account.name}`} referrerPolicy="no-referrer" onError={() => setAvatarFailed(true)} /> : account.name.slice(0, 1).toUpperCase()}</span>
      <span className="grid min-w-0 gap-2 pt-0.5"><strong className="truncate text-[14px]">{account.name}</strong><small className="flex min-w-0 items-center gap-2 truncate text-[12px] text-[#7e8b9c]">
        <span className="inline-grid size-7 shrink-0 place-items-center "><PlatformIcon provider={account.platform} /></span>
          <span className="truncate">{account.identifier?.trim() || "Chưa có ID"}</span></small></span>
    </button>
    <span className={`absolute right-12 top-4 text-[19px] ${needsReconnect ? "text-[#e87927]" : "text-[#f3a51d]"}`} title={needsReconnect ? "Cần kết nối lại" : "Đang hoạt động"}>●</span>
    {canManage && (account.id === "zalo_personal" || account.id === "telegram_personal" || account.platform === "facebook") && <div className="absolute right-2 top-2"><button className="grid size-9 place-items-center rounded-lg border-0 bg-transparent text-xl leading-none text-[#7e8b9c] hover:bg-[#f1f5f9] hover:text-[#354258] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 cursor-pointer" type="button" aria-label="Tùy chọn tài khoản" aria-expanded={isMenuOpen} aria-haspopup="menu" onClick={() => setIsMenuOpen((current) => !current)}>⋮</button>{isMenuOpen && <div className="absolute right-0 top-10 z-20 grid min-w-[180px] gap-1 rounded-xl border border-[#e3e8ef] bg-white p-1.5 shadow-lg" role="menu"><button className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] text-[#354258] hover:bg-[#f1f5f9] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 cursor-pointer" type="button" role="menuitem" onClick={() => { setIsMenuOpen(false); onRefresh(); }}>Làm mới kết nối</button><button className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] text-[#354258] hover:bg-[#fff1f1] hover:text-[#c33d3d] focus-visible:outline-2 focus-visible:outline-[#86b8ff] focus-visible:outline-offset-2 cursor-pointer" type="button" role="menuitem" onClick={() => { setIsMenuOpen(false); onDeactivate(); }}>Ngắt kết nối</button></div>}</div>}
  </article>;
}

function DeactivateAccountModal({ account, error, loading, onCancel, onConfirm }: { account: DashboardConnectedAccount; error: string | null; loading: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[#1b2738]/45 p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="deactivate-account-title"><h2 id="deactivate-account-title" className="text-lg font-bold text-[#273348]">Xác nhận hủy kích hoạt</h2><p className="mt-3 text-sm leading-6 text-[#68768a]">Bạn có chắc muốn hủy kích hoạt tài khoản <strong className="text-[#354258]">{account.name}</strong>? Tài khoản sẽ bị ngắt kết nối, nhưng các cuộc hội thoại và tin nhắn đã lưu vẫn được giữ nguyên.</p>{error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button className="rounded-lg border border-[#dce3eb] bg-white px-4 py-2 text-sm font-semibold text-[#59677a] cursor-pointer disabled:cursor-not-allowed" type="button" disabled={loading} onClick={onCancel}>Để lại</button><button className="rounded-lg bg-[#dc4b4b] px-4 py-2 text-sm font-bold text-white disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed" type="button" disabled={loading} onClick={onConfirm}>{loading ? "Đang hủy kích hoạt..." : "Hủy kích hoạt"}</button></div></section></div>; }
