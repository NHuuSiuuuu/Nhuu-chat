import { describe, expect, it } from "vitest";
import { parseAutomationTemplateFile } from "./automation-template-import.js";

function csvFile(content: string): File {
  return new File([content], "templates.csv", { type: "text/csv" });
}

describe("automation template import", () => {
  it("parses the four supported columns and normalizes enabled values", async () => {
    await expect(parseAutomationTemplateFile(csvFile([
      "Tên mẫu,Từ khóa,Nội dung trả lời,Đang bật",
      "Chào khách hàng,hi | hello,Xin chào ạ!,Có"
    ].join("\n")))).resolves.toEqual({
      rows: [{
        name: "Chào khách hàng",
        keywords: ["hi", "hello"],
        responseTemplate: "Xin chào ạ!",
        enabled: true
      }],
      errors: []
    });
  });

  it("reports missing columns, invalid rows and duplicate keywords with row numbers", async () => {
    await expect(parseAutomationTemplateFile(csvFile([
      "Tên mẫu,Từ khóa,Đang bật",
      "Thiếu nội dung,hi,Có"
    ].join("\n")))).resolves.toMatchObject({
      rows: [],
      errors: [{ row: 1, message: expect.stringContaining("Nội dung trả lời") }]
    });

    await expect(parseAutomationTemplateFile(csvFile([
      "Tên mẫu,Từ khóa,Nội dung trả lời,Đang bật",
      "Mẫu lỗi,hi | hi,Nội dung,maybe"
    ].join("\n")))).resolves.toMatchObject({
      rows: [],
      errors: [{ row: 2, message: expect.stringContaining("Đang bật") }]
    });
  });

  it("rejects duplicate template names and more than 500 data rows", async () => {
    const rows = ["Tên mẫu,Từ khóa,Nội dung trả lời,Đang bật"];
    for (let index = 0; index < 501; index++)
      rows.push(`Mẫu ${index},kw-${index},Nội dung,Có`);
    const result = await parseAutomationTemplateFile(csvFile(rows.join("\n")));
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ row: 0, message: "File chỉ được chứa tối đa 500 dòng dữ liệu" }]);

    await expect(parseAutomationTemplateFile(csvFile([
      "Tên mẫu,Từ khóa,Nội dung trả lời,Đang bật",
      "Chào,hi,Nội dung,Có",
      "Chào,alo,Nội dung,Có"
    ].join("\n")))).resolves.toMatchObject({
      rows: [],
      errors: [{ row: 3, message: "Tên mẫu bị trùng trong file" }]
    });
  });
});
