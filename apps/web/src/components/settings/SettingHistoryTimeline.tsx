import * as React from "react";
import { useEffect, useState } from "react";

import { apiRequest } from "../../lib/api.js";

export type SettingHistoryActionType =
  | "UPDATE_AI_SETTINGS"
  | "CONNECT_FACEBOOK_PAGE"
  | "DISCONNECT_FACEBOOK_PAGE";

export type SettingHistoryChange = {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
};

export type SettingHistoryResponse = {
  id: string;
  actorId: string;
  actorName: string;
  actionType: SettingHistoryActionType;
  actionTitle: string;
  changes: SettingHistoryChange[];
  versionHash: string;
  createdAt: string;
};

export type SettingHistoryPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
};

export type SettingHistoryListResponse = {
  items: SettingHistoryResponse[];
  pagination: SettingHistoryPagination;
};

type SettingHistoryFilter = "" | "UPDATE_AI_SETTINGS" | "CONNECT_FACEBOOK_PAGE";

type SettingHistoryTimelineProps = {
  token: string;
  refresh: () => Promise<string | null>;
  apiUrl: string;
};

type SettingHistoryTimelineViewProps = {
  actionType: SettingHistoryFilter;
  error: string | null;
  isLoading: boolean;
  items: SettingHistoryResponse[];
  onActionTypeChange: (actionType: SettingHistoryFilter) => void;
  onPageChange: (page: number) => void;
  pagination: SettingHistoryPagination;
};

const PAGE_SIZE = 20;
const EMPTY_PAGINATION: SettingHistoryPagination = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 0,
  hasNextPage: false
};
const FILTERS: Array<{ label: string; value: SettingHistoryFilter }> = [
  { label: "Tất cả", value: "" },
  { label: "Cài đặt AI", value: "UPDATE_AI_SETTINGS" },
  { label: "Kết nối Facebook", value: "CONNECT_FACEBOOK_PAGE" }
];
const SENSITIVE_FIELD_PATTERN = /(access.?token|token|password|secret|cookie|authorization)/i;

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  const time = new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  const day = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
  return `${time} • ${day}`;
}

function actorInitials(actorName: string): string {
  const words = actorName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "ND";
  return words.slice(-2).map((word) => Array.from(word)[0]).join("").toLocaleUpperCase("vi-VN");
}

// Chuyển mọi kiểu dữ liệu an toàn thành nhãn ngắn, không đưa HTML thô vào giao diện.
function displayHistoryValue(value: unknown): string {
  if (value === undefined) return "(không có)";
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "Bật" : "Tắt";
  if (typeof value === "string") return value.length > 0 ? value : "(trống)";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "(không thể hiển thị)";
  }
}

function isSafeHistoryChange(change: SettingHistoryChange): boolean {
  return !SENSITIVE_FIELD_PATTERN.test(change.fieldName.replace(/[^a-z0-9]/gi, ""));
}

function actionTypeLabel(actionType: SettingHistoryActionType): string {
  if (actionType === "UPDATE_AI_SETTINGS") return "Cài đặt AI";
  if (actionType === "DISCONNECT_FACEBOOK_PAGE") return "Ngắt kết nối Facebook";
  return "Kết nối Facebook";
}

function SettingHistoryValueBadge({ label, value, tone }: { label: string; value: unknown; tone: "old" | "new" }) {
  const text = displayHistoryValue(value);
  return <span className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${tone === "old" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`} title={text}>
    <span className="shrink-0 font-semibold">{label}</span>
    <span className="truncate">{text}</span>
  </span>;
}

function SettingHistoryTimelineItem({ item }: { item: SettingHistoryResponse }) {
  const safeChanges = item.changes.filter(isSafeHistoryChange);
  const actorName = item.actorName.trim() || "Người dùng";

  return <li className="relative pb-8 pl-8 last:pb-0">
    <span className="absolute -left-[7px] top-1.5 size-3.5 rounded-full border-4 border-white bg-blue-600 shadow-sm" aria-hidden="true" />
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700" aria-hidden="true">{actorInitials(actorName)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{actorName}</p>
            <time className="text-xs text-gray-500" dateTime={item.createdAt}>{formatHistoryDate(item.createdAt)}</time>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-[11px] text-gray-600">Phiên bản {item.versionHash}</span>
        </div>
      </header>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-gray-900">{item.actionTitle}</h3>
        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">{actionTypeLabel(item.actionType)}</span>
      </div>
      {safeChanges.length > 0 ? <ul className="mt-4 grid gap-3">
        {safeChanges.map((change, index) => <li className="rounded-xl bg-gray-50 p-3" key={`${change.fieldName}-${index}`}>
          <p className="mb-2 break-words text-xs font-semibold text-gray-600">{change.fieldName}</p>
          <div className="grid min-w-0 grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <SettingHistoryValueBadge label="Cũ" value={change.oldValue} tone="old" />
            <span className="text-center text-sm font-bold text-gray-400" aria-hidden="true">→</span>
            <SettingHistoryValueBadge label="Mới" value={change.newValue} tone="new" />
          </div>
        </li>)}
      </ul> : <p className="mt-4 text-xs text-gray-500">Không có giá trị an toàn để hiển thị.</p>}
    </article>
  </li>;
}

// Tải đúng trang lịch sử theo hợp đồng API và dùng cookie phiên qua helper dùng chung.
export function fetchSettingHistories(input: SettingHistoryTimelineProps & {
  page: number;
  actionType: SettingHistoryFilter;
}): Promise<SettingHistoryListResponse> {
  const query = new URLSearchParams({
    page: String(input.page),
    pageSize: String(PAGE_SIZE)
  });
  if (input.actionType) query.set("actionType", input.actionType);
  return apiRequest<SettingHistoryListResponse>(
    input.apiUrl,
    `/api/v1/setting-histories?${query.toString()}`,
    input.token,
    {},
    input.refresh
  );
}

export function SettingHistoryTimelineView({
  actionType,
  error,
  isLoading,
  items,
  onActionTypeChange,
  onPageChange,
  pagination
}: SettingHistoryTimelineViewProps) {
  return <section className="p-4 sm:p-6 lg:p-8" aria-labelledby="setting-history-title">
    <header>
      <h2 className="text-2xl font-bold text-gray-900" id="setting-history-title">Lịch sử hoạt động</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Theo dõi các thay đổi cài đặt quan trọng và người đã thực hiện.</p>
    </header>

    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Lọc lịch sử hoạt động">
      {FILTERS.map((filter) => <button
        className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${actionType === filter.value ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"}`}
        aria-pressed={actionType === filter.value}
        key={filter.value || "all"}
        type="button"
        onClick={() => onActionTypeChange(filter.value)}
      >{filter.label}</button>)}
    </div>

    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(240px,3fr)]">
      <div className="min-w-0">
        {isLoading ? <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50" role="status"><p className="text-sm text-gray-500">Đang tải lịch sử...</p></div>
          : error ? <div className="grid min-h-56 place-items-center rounded-2xl border border-rose-100 bg-rose-50 px-6 text-center" role="alert"><div><p className="font-semibold text-rose-700">Không thể tải lịch sử hoạt động</p><p className="mt-1 text-sm text-rose-600">{error}</p></div></div>
            : items.length === 0 ? <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 text-center"><div><p className="font-semibold text-gray-700">Chưa có hoạt động nào</p><p className="mt-1 text-sm text-gray-500">Các thay đổi cài đặt sẽ xuất hiện tại đây.</p></div></div>
              : <ol className="ml-3 border-l border-gray-200">{items.map((item) => <SettingHistoryTimelineItem item={item} key={item.id} />)}</ol>}

        {pagination.totalPages > 1 && <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Phân trang lịch sử">
          <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang trước" type="button" disabled={pagination.page <= 1 || isLoading} onClick={() => onPageChange(pagination.page - 1)}>Trước</button>
          <span className="text-sm font-medium text-gray-500">Trang {pagination.page} / {pagination.totalPages}</span>
          <button className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Trang sau" type="button" disabled={!pagination.hasNextPage || isLoading} onClick={() => onPageChange(pagination.page + 1)}>Sau</button>
        </nav>}
      </div>

      <aside className="h-fit rounded-2xl border border-amber-100 bg-amber-50 p-5 lg:sticky lg:top-24">
        <h3 className="text-sm font-bold text-amber-900">Lưu ý về lịch sử</h3>
        <p className="mt-2 text-sm leading-6 text-amber-800">Hệ thống lưu tối đa 500 bản ghi cho mỗi người dùng. Bản ghi cũ nhất sẽ được tự động dọn khi vượt giới hạn.</p>
      </aside>
    </div>
  </section>;
}

export function SettingHistoryTimeline({ token, refresh, apiUrl }: SettingHistoryTimelineProps) {
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState<SettingHistoryFilter>("");
  const [items, setItems] = useState<SettingHistoryResponse[]>([]);
  const [pagination, setPagination] = useState<SettingHistoryPagination>(EMPTY_PAGINATION);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    void fetchSettingHistories({ token, refresh, apiUrl, page, actionType })
      .then((response) => {
        if (!active) return;
        setItems(response.items);
        setPagination(response.pagination);
      })
      .catch(() => {
        if (active) setError("Vui lòng thử lại sau.");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [actionType, apiUrl, page, refresh, token]);

  function changeActionType(nextActionType: SettingHistoryFilter) {
    setActionType(nextActionType);
    setPage(1);
  }

  return <SettingHistoryTimelineView
    actionType={actionType}
    error={error}
    isLoading={isLoading}
    items={items}
    onActionTypeChange={changeActionType}
    onPageChange={setPage}
    pagination={pagination}
  />;
}
