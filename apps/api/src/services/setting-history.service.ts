import { randomBytes } from "node:crypto";

import {
  SettingHistoryModel,
  type SettingHistory,
  type SettingHistoryActionType,
  type SettingHistoryChange
} from "../models/setting-history.model.js";

const SETTING_HISTORY_LIMIT = 500;
const PATH_SEPARATOR = " › ";
const MISSING_VALUE_DISPLAY = "(không có)";
const SENSITIVE_FIELD_MARKERS = ["token", "password", "secret", "cookie", "authorization"];
const SENSITIVE_FIELD_NAMES = new Set([
  "pageaccesstoken",
  "encryptedpageaccesstoken",
  "accesstoken",
  ...SENSITIVE_FIELD_MARKERS
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function appendPath(path: string, segment: string): string {
  return path ? `${path}${PATH_SEPARATOR}${segment}` : segment;
}

function getOwnValue(value: Record<string, unknown>, fieldName: string): unknown {
  return Object.hasOwn(value, fieldName) ? value[fieldName] : undefined;
}

function isSensitiveFieldName(fieldName: string): boolean {
  const normalized = fieldName.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (SENSITIVE_FIELD_NAMES.has(normalized)) return true;

  const words = fieldName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return SENSITIVE_FIELD_MARKERS.some((marker) =>
    words.includes(marker) || normalized.startsWith(marker) || normalized.endsWith(marker)
  );
}

function isSensitivePath(fieldName: string): boolean {
  return fieldName.split(PATH_SEPARATOR).some(isSensitiveFieldName);
}

function containsSensitiveField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveField);
  if (!isPlainObject(value)) return false;

  return Object.keys(value).some((fieldName) =>
    isSensitiveFieldName(fieldName) || containsSensitiveField(getOwnValue(value, fieldName))
  );
}

function toPersistentValue(value: unknown): unknown {
  return value === undefined ? MISSING_VALUE_DISPLAY : value;
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
      ...Object.keys(newValue).filter((fieldName) => !Object.hasOwn(oldValue, fieldName))
    ];
    for (const fieldName of fieldNames) {
      collectChanges(
        getOwnValue(oldValue, fieldName),
        getOwnValue(newValue, fieldName),
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
    userId,
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
  const changes = diffSettings(input.oldValue, input.newValue)
    .filter((change) =>
      !isSensitivePath(change.fieldName)
      && !containsSensitiveField(change.oldValue)
      && !containsSensitiveField(change.newValue)
    )
    .map((change) => ({
      ...change,
      oldValue: toPersistentValue(change.oldValue),
      newValue: toPersistentValue(change.newValue)
    }));
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
