import { describe, expect, it } from "vitest";
import { customerRequestedAgent } from "./chatbot-orchestrator.js";

describe("customer handoff condition", () => {
  it.each(["Gặp nhân viên", "GẶP NHÂN VIÊN!", "  gặp   nhân viên  "])(
    "recognizes the explicit customer choice: %s",
    (content) => {
      expect(customerRequestedAgent(content)).toBe(true);
    }
  );

  it.each(["tư vấn", "Em chưa có đủ thông tin, nhân viên sẽ hỗ trợ.", "Tôi cần hỏi nhân viên về đơn hàng"])(
    "does not treat ordinary customer text as an explicit handoff: %s",
    (content) => {
      expect(customerRequestedAgent(content)).toBe(false);
    }
  );
});
