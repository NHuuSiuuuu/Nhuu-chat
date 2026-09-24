import * as XLSX from "xlsx";

export interface AutomationTemplateImportRow {
  name: string;
  keywords: string[];
  responseTemplate: string;
  enabled: boolean;
}

export interface AutomationTemplateImportError {
  row: number;
  message: string;
}

export interface AutomationTemplateImportPreview {
  rows: AutomationTemplateImportRow[];
  errors: AutomationTemplateImportError[];
}

const MAX_IMPORT_ROWS = 500;
const REQUIRED_HEADERS = ["Tên mẫu", "Từ khóa", "Nội dung trả lời", "Đang bật"] as const;

function normalizedHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

function parseEnabled(value: unknown): boolean | null {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d");
  if (["co", "yes", "true", "1"].includes(normalized)) return true;
  if (["khong", "no", "false", "0"].includes(normalized)) return false;
  return null;
}

function parseKeywords(value: unknown): string[] {
  return String(value ?? "")
    .split(/[,|;]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

// Đọc sheet đầu tiên và biến file import thành dữ liệu an toàn để xem trước trước khi lưu.
export async function parseAutomationTemplateFile(file: File): Promise<AutomationTemplateImportPreview> {
  const isCsv = file.name.toLocaleLowerCase("vi").endsWith(".csv") || file.type === "text/csv";
  const workbook = isCsv
    ? XLSX.read(await file.text(), { type: "string", raw: false })
    : XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!firstSheet) return { rows: [], errors: [{ row: 0, message: "File không có sheet dữ liệu" }] };

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: false });
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow?.length) return { rows: [], errors: [{ row: 0, message: "File chưa có dòng tiêu đề" }] };
  if (dataRows.length > MAX_IMPORT_ROWS)
    return { rows: [], errors: [{ row: 0, message: "File chỉ được chứa tối đa 500 dòng dữ liệu" }] };

  const headerIndexes = new Map<string, number>();
  for (const [index, value] of headerRow.entries()) {
    const key = normalizedHeader(value);
    if (key) headerIndexes.set(key, index);
  }
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerIndexes.has(normalizedHeader(header)));
  if (missingHeaders.length > 0)
    return { rows: [], errors: [{ row: 1, message: `Thiếu cột: ${missingHeaders.join(", ")}` }] };

  const rows: AutomationTemplateImportRow[] = [];
  const errors: AutomationTemplateImportError[] = [];
  const names = new Set<string>();
  for (const [index, dataRow] of dataRows.entries()) {
    const row = index + 2;
    const name = String(dataRow[headerIndexes.get(normalizedHeader("Tên mẫu"))!] ?? "").trim();
    const keywords = parseKeywords(dataRow[headerIndexes.get(normalizedHeader("Từ khóa"))!]);
    const responseTemplate = String(dataRow[headerIndexes.get(normalizedHeader("Nội dung trả lời"))!] ?? "").trim();
    const enabled = parseEnabled(dataRow[headerIndexes.get(normalizedHeader("Đang bật"))!]);
    const rowErrors: string[] = [];
    if (!name) rowErrors.push("Tên mẫu không được để trống");
    if (name && names.has(normalizedHeader(name))) rowErrors.push("Tên mẫu bị trùng trong file");
    if (keywords.length === 0) rowErrors.push("Từ khóa không được để trống");
    if (!responseTemplate) rowErrors.push("Nội dung trả lời không được để trống");
    if (enabled === null) rowErrors.push("Đang bật phải là Có/Không hoặc true/false");
    if (rowErrors.length > 0) {
      errors.push({ row, message: rowErrors.join("; ") });
      continue;
    }
    names.add(normalizedHeader(name));
    rows.push({ name, keywords, responseTemplate, enabled: enabled ?? false });
  }
  return errors.length > 0 ? { rows: [], errors } : { rows, errors };
}
