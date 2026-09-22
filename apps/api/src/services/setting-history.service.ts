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
const EMPTY_OBJECT_VALUE = Symbol("empty-object");
const EMPTY_ARRAY_VALUE = Symbol("empty-array");
const SENSITIVE_FIELD_NAMES = new Set([
  "pageaccesstoken",
  "encryptedpageaccesstoken",
  "accesstoken",
  "token",
  "password",
  "secret",
  "cookie",
  "authorization",
  "clientsecret",
  "sessioncookie"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getOwnValue(value: Record<string, unknown>, fieldName: string): unknown {
  return Object.hasOwn(value, fieldName) ? value[fieldName] : undefined;
}

function isSensitiveFieldName(fieldName: string): boolean {
  const normalized = fieldName.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return SENSITIVE_FIELD_NAMES.has(normalized);
}

function toPersistentValue(value: unknown): unknown {
  return value === undefined ? MISSING_VALUE_DISPLAY : value;
}

// Làm phẳng dữ liệu thành các lá an toàn, giữ riêng container rỗng và bỏ toàn bộ nhánh bí mật.
function collectLeafValues(
  value: unknown,
  path: string[],
  leaves: Map<string, unknown>
): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      leaves.set(JSON.stringify(path), EMPTY_ARRAY_VALUE);
      return;
    }
    for (let index = 0; index < value.length; index += 1) {
      collectLeafValues(value[index], [...path, String(index)], leaves);
    }
    return;
  }

  if (isPlainObject(value)) {
    const fieldNames = Object.keys(value);
    if (fieldNames.length === 0) {
      leaves.set(JSON.stringify(path), EMPTY_OBJECT_VALUE);
      return;
    }
    for (const fieldName of fieldNames) {
      if (isSensitiveFieldName(fieldName)) continue;
      collectLeafValues(
        getOwnValue(value, fieldName),
        [...path, fieldName],
        leaves
      );
    }
    return;
  }

  leaves.set(JSON.stringify(path), value);
}

function toDiffValue(value: unknown): unknown {
  if (value === EMPTY_OBJECT_VALUE) return {};
  if (value === EMPTY_ARRAY_VALUE) return [];
  return value;
}

// So sánh đệ quy dữ liệu cài đặt và giữ nguyên kiểu giá trị để tránh tuần tự hóa dữ liệu nhạy cảm.
export function diffSettings(oldValue: unknown, newValue: unknown): SettingHistoryChange[] {
  const oldLeaves = new Map<string, unknown>();
  const newLeaves = new Map<string, unknown>();
  collectLeafValues(oldValue, [], oldLeaves);
  collectLeafValues(newValue, [], newLeaves);

  const changes: SettingHistoryChange[] = [];
  const pathKeys = [
    ...oldLeaves.keys(),
    ...[...newLeaves.keys()].filter((pathKey) => !oldLeaves.has(pathKey))
  ];
  for (const pathKey of pathKeys) {
    const oldLeaf = oldLeaves.get(pathKey);
    const newLeaf = newLeaves.get(pathKey);
    if (Object.is(oldLeaf, newLeaf)) continue;
    const path: string[] = JSON.parse(pathKey);
    // Gốc cùng kiểu container chỉ ghi thay đổi ở các lá, kể cả khi chỉ có nhánh bí mật.
    if (path.length === 0 && (
      (isPlainObject(oldValue) && isPlainObject(newValue)) ||
      (Array.isArray(oldValue) && Array.isArray(newValue))
    )) continue;
    changes.push({
      fieldName: path.length === 0 ? "value" : path.join(PATH_SEPARATOR),
      oldValue: toDiffValue(oldLeaf),
      newValue: toDiffValue(newLeaf)
    });
  }
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
