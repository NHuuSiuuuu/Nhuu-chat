import type { AssistantContract } from "@nhuu-chat/contracts";

import { AppError } from "../common/errors.js";
import { AssistantModel } from "../models/assistant.model.js";

export type AssistantInput = Omit<AssistantContract, "id" | "ownerId" | "createdAt" | "updatedAt">;
export type AssistantPatch = Partial<AssistantInput>;

const DEFAULT_ASSISTANT_INDEX = "unique_default_assistant_per_owner";

interface AssistantRow extends AssistantInput {
  _id: unknown;
  ownerId: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function assistantNotFound(): AppError {
  return new AppError(404, "ASSISTANT_NOT_FOUND", "Assistant was not found");
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

async function withDefaultAssistantConstraint<T>(mutation: () => Promise<T>): Promise<T> {
  try {
    // Tạo ràng buộc tại MongoDB để hai request đồng thời không thể cùng tạo mặc định.
    await AssistantModel.collection.createIndex(
      { ownerId: 1, isDefault: 1 },
      {
        unique: true,
        partialFilterExpression: { isDefault: true },
        name: DEFAULT_ASSISTANT_INDEX
      }
    );
    return await mutation();
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(409, "DUPLICATE_RESOURCE", "Resource already exists");
    }
    throw error;
  }
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAssistant(row: AssistantRow): AssistantContract {
  return {
    id: String(row._id),
    ownerId: String(row.ownerId),
    name: row.name,
    instructions: row.instructions,
    modelTier: row.modelTier,
    enabled: row.enabled,
    fallbackMessage: row.fallbackMessage,
    channelScope: {
      mode: row.channelScope.mode,
      identifiers: [...row.channelScope.identifiers]
    },
    isDefault: row.isDefault,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

export async function listAssistants(ownerId: string): Promise<{ assistants: AssistantContract[] }> {
  const rows = await AssistantModel.find({ ownerId }).sort({ createdAt: 1, _id: 1 }).lean();
  return { assistants: rows.map((row) => toAssistant(row as unknown as AssistantRow)) };
}

export async function createAssistant(ownerId: string, input: AssistantInput): Promise<AssistantContract> {
  if (!input.isDefault) {
    const row = await AssistantModel.create({ ownerId, ...input });
    return toAssistant(row as unknown as AssistantRow);
  }

  return withDefaultAssistantConstraint(() => AssistantModel.db.transaction(async (session) => {
    // Đổi trợ lý mặc định trong cùng transaction để không lộ trạng thái có hai mặc định.
    await AssistantModel.updateMany(
      { ownerId, isDefault: true },
      { $set: { isDefault: false } },
      { session }
    );
    const [row] = await AssistantModel.create([{ ownerId, ...input }], { session });
    return toAssistant(row as unknown as AssistantRow);
  }));
}

export async function updateAssistant(
  ownerId: string,
  assistantId: string,
  patch: AssistantPatch
): Promise<AssistantContract> {
  if (!patch.isDefault) {
    const row = await AssistantModel.findOneAndUpdate(
      { _id: assistantId, ownerId },
      { $set: patch },
      { new: true, runValidators: true }
    ).lean();
    if (!row) throw assistantNotFound();
    return toAssistant(row as unknown as AssistantRow);
  }

  return withDefaultAssistantConstraint(() => AssistantModel.db.transaction(async (session) => {
    await AssistantModel.updateMany(
      { ownerId, isDefault: true, _id: { $ne: assistantId } },
      { $set: { isDefault: false } },
      { session }
    );
    const row = await AssistantModel.findOneAndUpdate(
      { _id: assistantId, ownerId },
      { $set: patch },
      { new: true, runValidators: true, session }
    ).lean();
    if (!row) throw assistantNotFound();
    return toAssistant(row as unknown as AssistantRow);
  }));
}

export async function deleteAssistant(ownerId: string, assistantId: string): Promise<void> {
  const row = await AssistantModel.findOneAndDelete({ _id: assistantId, ownerId }).lean();
  if (!row) throw assistantNotFound();
}

export async function resolveAssistant(
  ownerId: string,
  platform: string,
  channelId: string
): Promise<AssistantContract | null> {
  const channelIdentifier = `${platform}:${channelId}`;
  const direct = await AssistantModel.findOne({
    ownerId,
    enabled: true,
    "channelScope.mode": "channels",
    "channelScope.identifiers": channelIdentifier
  }).lean();
  if (direct) return toAssistant(direct as unknown as AssistantRow);

  const fallback = await AssistantModel.findOne({ ownerId, enabled: true, isDefault: true }).lean();
  return fallback ? toAssistant(fallback as unknown as AssistantRow) : null;
}
