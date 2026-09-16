import { describe, expect, it } from "vitest";

import {
  CONTACT_CAPTURE_REQUEST,
  customerContactCaptured,
  enforceContactCapturePolicy
} from "./contact-capture.js";

describe("customer contact capture", () => {
  it("accepts a Vietnamese phone number from a customer message", () => {
    expect(customerContactCaptured([
      { role: "customer", content: "Số của em là 0912 345 678" }
    ])).toBe(true);
  });

  it("accepts an explicit Zalo identifier from a customer message", () => {
    expect(customerContactCaptured([
      { role: "customer", content: "Zalo của em là global.english" }
    ])).toBe(true);
  });

  it("does not treat bot claims or a confirmation as customer contact", () => {
    expect(customerContactCaptured([
      { role: "bot", content: "Cảm ơn Anh/Chị đã để lại thông tin liên hệ." },
      { role: "customer", content: "có" }
    ])).toBe(false);
  });

  it("replaces a false contact-confirmation claim when no customer contact exists", () => {
    expect(enforceContactCapturePolicy(
      "Dạ em cảm ơn Anh/Chị đã để lại thông tin liên hệ ạ! Nhân viên sẽ gọi lại.",
      false
    )).toBe(CONTACT_CAPTURE_REQUEST);
  });

  it("keeps the contact-confirmation claim after a customer contact is captured", () => {
    const answer = "Dạ em cảm ơn Anh/Chị đã để lại thông tin liên hệ ạ!";
    expect(enforceContactCapturePolicy(answer, true)).toBe(answer);
  });
});
