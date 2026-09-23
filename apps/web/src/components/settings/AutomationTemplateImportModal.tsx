import * as React from "react";
import { useState } from "react";

import type { AutomationTemplateImportRow } from "../../lib/automation-template-import.js";

interface AutomationTemplateImportModalProps {
  isSaving: boolean;
  onClose: () => void;
  onImport: (rows: AutomationTemplateImportRow[]) => Promise<void>;
}

export function AutomationTemplateImportModal({
  isSaving,
  onClose,
  onImport
}: AutomationTemplateImportModalProps) {
  const [preview, setPreview] = useState<AutomationTemplateImportRow[]>([]);
  const [errors, setErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [isReading, setIsReading] = useState(false);

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setIsReading(true);
    try {
      const { parseAutomationTemplateFile } = await import("../../lib/automation-template-import.js");
      const result = await parseAutomationTemplateFile(file);
      setPreview(result.rows);
      setErrors(result.errors);
    } catch {
      setPreview([]);
      setErrors([{ row: 0, message: "Không thể đọc file. Vui lòng kiểm tra lại định dạng." }]);
    } finally {
      setIsReading(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" role="presentation" onMouseDown={onClose}>
    <section className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="automation-template-import-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900" id="automation-template-import-title">Import kịch bản</h3>
          <p className="mt-1 text-xs text-gray-400">Chọn file .xlsx hoặc .csv gồm 4 cột: Tên mẫu, Từ khóa, Nội dung trả lời, Đang bật.</p>
        </div>
        <button className="cursor-pointer transition-opacity hover:opacity-80" type="button" aria-label="Đóng" onClick={onClose}>×</button>
      </div>
      <label className="mt-5 block cursor-pointer rounded-xl border border-dashed border-sky-300 text-gray-900  px-4 py-5 text-center text-sm font-semibold text-gray-900">
        <span>{isReading ? "Đang đọc file..." : "Chọn file Excel hoặc CSV"}</span>
        <input className="sr-only" type="file" accept=".xlsx,.csv" onChange={(event) => void selectFile(event.target.files?.[0])} disabled={isReading || isSaving} />
      </label>
      {errors.length > 0 && <div className="mt-4 max-h-36 overflow-y-auto rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
        {errors.map((error) => <p key={`${error.row}-${error.message}`}>Dòng {error.row}: {error.message}</p>)}
      </div>}
      {preview.length > 0 && <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
        <p className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">Xem trước {preview.length} mẫu</p>
        <table className="w-full text-left text-xs">
          <tbody>{preview.slice(0, 20).map((row) => <tr className="border-b border-gray-50 last:border-0" key={`${row.name}-${row.keywords.join(",")}`}><td className="px-3 py-2 font-semibold text-gray-700">{row.name}</td><td className="px-3 py-2 text-gray-500">{row.keywords.join(", ")}</td><td className="px-3 py-2 text-gray-500">{row.responseTemplate}</td><td className="px-3 py-2">{row.enabled ? "Có" : "Không"}</td></tr>)}</tbody>
        </table>
      </div>}
      <div className="mt-5 flex justify-end gap-2">
        <button className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-500 cursor-pointer transition-opacity hover:opacity-80" type="button" onClick={onClose}>Hủy</button>
        <button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed" type="button" disabled={preview.length === 0 || errors.length > 0 || isReading || isSaving} onClick={() => void onImport(preview)}>{isSaving ? "Đang nhập..." : "Xác nhận nhập"}</button>
      </div>
    </section>
  </div>;
}
