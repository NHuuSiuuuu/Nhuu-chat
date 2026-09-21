import { describe, expect, it } from "vitest";

import { buildKnowledgeQuery } from "./conversation-query.js";

describe("conversation knowledge query", () => {
  it("keeps the previous bot answer when the customer confirms a follow-up question", () => {
    expect(buildKnowledgeQuery("có", [
      { role: "customer", content: "mất gốc" },
      { role: "bot", content: "Bạn có muốn em tư vấn học phí và lịch học không ạ?" }
    ])).toBe("mất gốc\nBạn có muốn em tư vấn học phí và lịch học không ạ?\ncó");
  });

  it("expands the customer abbreviation sv while preserving the conversation topic", () => {
    expect(buildKnowledgeQuery("sv", [
      { role: "customer", content: "tôi muốn học khóa học" },
      { role: "bot", content: "Anh/Chị đang tìm hiểu tiếng Anh cho đối tượng nào ạ?" }
    ])).toBe("tôi muốn học khóa học\nAnh/Chị đang tìm hiểu tiếng Anh cho đối tượng nào ạ?\nsinh viên");
  });

  it("uses the current message alone for a normal question", () => {
    expect(buildKnowledgeQuery("địa chỉ ở đâu", [
      { role: "bot", content: "Bạn muốn hỏi thêm thông tin gì ạ?" }
    ])).toBe("địa chỉ ở đâu");
  });

  it("keeps the previous bot answer when the customer sends a phone number", () => {
    expect(buildKnowledgeQuery("0344497636", [
      { role: "bot", content: "Cho em xin số điện thoại để xếp lịch test đầu vào khóa cho người mất gốc nhé ạ!" }
    ])).toBe("Cho em xin số điện thoại để xếp lịch test đầu vào khóa cho người mất gốc nhé ạ!\n0344497636");
  });
});
