import type { AutomationTemplateContract as AutomationTemplate } from "@nhuu-chat/contracts";

function normalizeText(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/giu, "d")
    .toLocaleLowerCase("vi")
    .replace(/\s+/g, " ");
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeKeyword(message: string, keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegularExpression(normalizedKeyword)}(?=$|[^\\p{L}\\p{N}])`,
    "u"
  );
  return pattern.test(message);
}

function supportsChannel(template: AutomationTemplate, channelIdentifier: string): boolean {
  return template.channelScope.mode === "all" ||
    template.channelScope.identifiers.includes(channelIdentifier);
}

// Chọn mẫu bật có độ ưu tiên cao nhất; thứ tự đầu vào được giữ nguyên khi đồng hạng.
export function matchAutomationTemplate(input: {
  message: string;
  channelIdentifier: string;
  templates: AutomationTemplate[];
}): AutomationTemplate | null {
  const message = normalizeText(input.message);
  if (!message) return null;

  let match: AutomationTemplate | null = null;
  for (const template of input.templates) {
    if (!template.enabled || !supportsChannel(template, input.channelIdentifier)) continue;
    if (!template.keywords.some((keyword) => containsWholeKeyword(message, keyword))) continue;
    if (match === null || template.priority > match.priority) match = template;
  }
  return match;
}
