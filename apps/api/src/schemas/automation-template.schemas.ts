import { z } from "zod";

const channelScopeSchema = z.object({
  mode: z.enum(["all", "channels"]),
  identifiers: z.array(z.string().trim().min(1)).default([])
}).strict();

// Chuẩn hóa từ khóa để matcher không xử lý lặp các biến thể viết hoa/thừa khoảng trắng.
const keywordsSchema = z.array(z.string().trim().min(1).max(80)).min(1).transform((keywords) => {
  const seen = new Set<string>();
  return keywords.filter((keyword) => {
    const key = keyword.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

const automationTemplateFields = {
  assistantId: z.string().regex(/^[0-9a-f]{24}$/i),
  name: z.string().trim().min(1).max(100),
  keywords: keywordsSchema,
  responseTemplate: z.string().trim().min(1).max(2000),
  allowAiRewrite: z.boolean(),
  priority: z.number().int().min(0).max(1000),
  enabled: z.boolean(),
  channelScope: channelScopeSchema
};

export const automationTemplateCreateSchema = z.object({
  ...automationTemplateFields,
  allowAiRewrite: automationTemplateFields.allowAiRewrite.default(false),
  priority: automationTemplateFields.priority.default(0),
  enabled: automationTemplateFields.enabled.default(true),
  channelScope: automationTemplateFields.channelScope.default({ mode: "all", identifiers: [] })
}).strict();

export const automationTemplatePatchSchema = z.object(automationTemplateFields).partial().strict();

const automationTemplateImportRowSchema = z.object({
  name: automationTemplateFields.name,
  keywords: automationTemplateFields.keywords,
  responseTemplate: automationTemplateFields.responseTemplate,
  enabled: automationTemplateFields.enabled
}).strict();

export const automationTemplateImportSchema = z.object({
  templates: z.array(automationTemplateImportRowSchema).min(1).max(500)
}).strict();
