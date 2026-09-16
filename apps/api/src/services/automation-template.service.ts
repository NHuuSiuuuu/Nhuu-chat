import type { AutomationTemplateContract } from "@nhuu-chat/contracts";

import { AppError } from "../common/errors.js";
import { AssistantModel } from "../models/assistant.model.js";
import { AutomationTemplateModel } from "../models/automation-template.model.js";

export type AutomationTemplateInput = Omit<
  AutomationTemplateContract,
  "id" | "ownerId" | "createdAt" | "updatedAt"
>;
export type AutomationTemplatePatch = Partial<AutomationTemplateInput>;
export type AutomationTemplateImportInput = Omit<AutomationTemplateInput, "assistantId" | "allowAiRewrite" | "priority" | "channelScope">;

interface AutomationTemplateRow extends Omit<AutomationTemplateInput, "assistantId"> {
  _id: unknown;
  ownerId: unknown;
  assistantId: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function assistantNotFound(): AppError {
  return new AppError(404, "ASSISTANT_NOT_FOUND", "Assistant was not found");
}

function templateNotFound(): AppError {
  return new AppError(404, "AUTOMATION_TEMPLATE_NOT_FOUND", "Automation template was not found");
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAutomationTemplate(row: AutomationTemplateRow): AutomationTemplateContract {
  return {
    id: String(row._id),
    ownerId: String(row.ownerId),
    assistantId: String(row.assistantId),
    name: row.name,
    keywords: [...row.keywords],
    responseTemplate: row.responseTemplate,
    allowAiRewrite: row.allowAiRewrite,
    priority: row.priority,
    enabled: row.enabled,
    channelScope: {
      mode: row.channelScope.mode,
      identifiers: [...row.channelScope.identifiers]
    },
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt)
  };
}

async function requireOwnedAssistant(ownerId: string, assistantId: string): Promise<void> {
  const assistant = await AssistantModel.findOne({ _id: assistantId, ownerId }).lean();
  if (!assistant) throw assistantNotFound();
}

const defaultGreetingTemplate = {
  name: "Chào khách hàng",
  keywords: ["hi", "hello", "alo", "xin chao", "chao"],
  responseTemplate: "Xin chào anh/chị! Em là trợ lý AI, em có thể hỗ trợ anh/chị theo hướng dẫn của mình ạ.",
  allowAiRewrite: false,
  priority: 100,
  enabled: true,
  channelScope: { mode: "all" as const, identifiers: [] }
};

export async function ensureDefaultGreetingTemplate(ownerId: string, assistantId: string): Promise<void> {
  const existing = await AutomationTemplateModel.findOne({
    ownerId,
    assistantId,
    keywords: { $in: [...defaultGreetingTemplate.keywords, "xin chào"] }
  })
    .lean();
  if (existing) return;
  await AutomationTemplateModel.findOneAndUpdate(
    { ownerId, assistantId, name: defaultGreetingTemplate.name },
    { $setOnInsert: { ownerId, assistantId, ...defaultGreetingTemplate } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

export async function listAutomationTemplates(
  ownerId: string,
  assistantId: string
): Promise<{ templates: AutomationTemplateContract[] }> {
  await requireOwnedAssistant(ownerId, assistantId);
  const rows = await AutomationTemplateModel.find({ ownerId, assistantId })
    .sort({ priority: -1, createdAt: 1, _id: 1 })
    .lean();
  return { templates: rows.map((row) => toAutomationTemplate(row as unknown as AutomationTemplateRow)) };
}

export async function createAutomationTemplate(
  ownerId: string,
  input: AutomationTemplateInput
): Promise<AutomationTemplateContract> {
  await requireOwnedAssistant(ownerId, input.assistantId);
  const row = await AutomationTemplateModel.create({ ownerId, ...input });
  return toAutomationTemplate(row as unknown as AutomationTemplateRow);
}

// Lưu hàng loạt mẫu đã được frontend xem trước; owner và trợ lý luôn lấy từ route đã xác thực.
export async function importAutomationTemplates(
  ownerId: string,
  assistantId: string,
  inputs: AutomationTemplateImportInput[]
): Promise<{ imported: number; templates: AutomationTemplateContract[] }> {
  await requireOwnedAssistant(ownerId, assistantId);
  const rows = await AutomationTemplateModel.insertMany(inputs.map((input) => ({
    ownerId,
    assistantId,
    ...input,
    allowAiRewrite: false,
    priority: 0,
    channelScope: { mode: "all" as const, identifiers: [] }
  })));
  return {
    imported: rows.length,
    templates: rows.map((row) => toAutomationTemplate(row as unknown as AutomationTemplateRow))
  };
}

export async function updateAutomationTemplate(
  ownerId: string,
  assistantId: string,
  templateId: string,
  patch: AutomationTemplatePatch
): Promise<AutomationTemplateContract> {
  await requireOwnedAssistant(ownerId, assistantId);
  if (patch.assistantId !== undefined && patch.assistantId !== assistantId) {
    await requireOwnedAssistant(ownerId, patch.assistantId);
  }
  const row = await AutomationTemplateModel.findOneAndUpdate(
    { _id: templateId, ownerId, assistantId },
    { $set: patch },
    { new: true, runValidators: true }
  ).lean();
  if (!row) throw templateNotFound();
  return toAutomationTemplate(row as unknown as AutomationTemplateRow);
}

export async function deleteAutomationTemplate(
  ownerId: string,
  assistantId: string,
  templateId: string
): Promise<void> {
  await requireOwnedAssistant(ownerId, assistantId);
  const row = await AutomationTemplateModel.findOneAndDelete({ _id: templateId, ownerId, assistantId }).lean();
  if (!row) throw templateNotFound();
}
