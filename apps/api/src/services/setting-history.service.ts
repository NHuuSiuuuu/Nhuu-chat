import { randomBytes } from "node:crypto";

import {
  SettingHistoryModel,
  type SettingHistory,
  type SettingHistoryActionType,
  type SettingHistoryChange
} from "../models/setting-history.model.js";

const SETTING_HISTORY_LIMIT = 500;
const PATH_SEPARATOR = " › ";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function appendPath(path: string, segment: string): string {
  return path ? `${path}${PATH_SEPARATOR}${segment}` : segment;
}

function collectChanges(
  oldValue: unknown,
  newValue: unknown,
  path: string,
  changes: SettingHistoryChange[]
): void {
  if (Object.is(oldValue, newValue)) return;

  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    const itemCount = Math.max(oldValue.length, newValue.length);
    for (let index = 0; index < itemCount; index += 1) {
      collectChanges(oldValue[index], newValue[index], appendPath(path, String(index)), changes);
    }
    return;
  }

  if (isPlainObject(oldValue) && isPlainObject(newValue)) {
    const fieldNames = [
      ...Object.keys(oldValue),
      ...Object.keys(newValue).filter((fieldName) => !(fieldName in oldValue))
    ];
    for (const fieldName of fieldNames) {
      collectChanges(
        oldValue[fieldName],
        newValue[fieldName],
        appendPath(path, fieldName),
        changes
      );
    }
    return;
  }

  changes.push({
    fieldName: path || "value",
    oldValue,
    newValue
  });
}

// So sánh đệ quy dữ liệu cài đặt và giữ nguyên kiểu giá trị để tránh tuần tự hóa dữ liệu nhạy cảm.
export function diffSettings(oldValue: unknown, newValue: unknown): SettingHistoryChange[] {
  const changes: SettingHistoryChange[] = [];
  collectChanges(oldValue, newValue, "", changes);
  return changes;
}

async function removeExpiredHistories(userId: string): Promise<void> {
  const rows = await SettingHistoryModel.find({ userId })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean();
  const overflow = rows.length - SETTING_HISTORY_LIMIT;
  if (overflow <= 0) return;

  await SettingHistoryModel.deleteMany({
    _id: { $in: rows.slice(0, overflow).map((row) => row._id) }
  });
}

// Chỉ lưu thay đổi thực tế và dọn các bản ghi cũ vượt giới hạn của từng người dùng.
export async function recordSettingHistory(input: {
  userId: string;
  actionType: SettingHistoryActionType;
  actionTitle: string;
  oldValue: unknown;
  newValue: unknown;
}): Promise<SettingHistory | null> {
  const changes = diffSettings(input.oldValue, input.newValue);
  if (changes.length === 0) return null;

  const history = await SettingHistoryModel.create({
    userId: input.userId,
    actionType: input.actionType,
    actionTitle: input.actionTitle,
    changes,
    versionHash: randomBytes(4).toString("hex")
  });
  await removeExpiredHistories(input.userId);
  return history;
}

// Trả lịch sử mới nhất theo người dùng với kích thước trang được giới hạn an toàn.
export async function listSettingHistories(input: {
  userId: string;
  page: number;
  pageSize: number;
  actionType?: SettingHistoryActionType;
}) {
  const page = Number.isFinite(input.page) && input.page > 0 ? Math.floor(input.page) : 1;
  const requestedPageSize = Number.isFinite(input.pageSize) && input.pageSize > 0
    ? Math.floor(input.pageSize)
    : 1;
  const pageSize = Math.min(requestedPageSize, 50);
  const filter = {
    userId: input.userId,
    ...(input.actionType ? { actionType: input.actionType } : {})
  };
  const [items, total] = await Promise.all([
    SettingHistoryModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    SettingHistoryModel.countDocuments(filter)
  ]);
  const totalPages = Math.ceil(total / pageSize);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages
    }
  };
}
