import { describe, expect, it } from "vitest";

import { buildKnowledgeQuery } from "./conversation-query.js";

describe("conversation knowledge query", () => {
  it("keeps the previous bot answer when the customer confirms a follow-up question", () => {
    expect(buildKnowledgeQuery("có", [
      { role: "customer", content: "mất gốc" },
      { role: "bot", content: "Bạn có muốn em tư vấn học phí và lịch học không ạ?" }
    ])).toBe("Bạn có muốn em tư vấn học phí và lịch học không ạ?\ncó");
  });

  it("uses the current message alone for a normal question", () => {
    expect(buildKnowledgeQuery("địa chỉ ở đâu", [
      { role: "bot", content: "Bạn muốn hỏi thêm thông tin gì ạ?" }
    ])).toBe("địa chỉ ở đâu");
  });
});
