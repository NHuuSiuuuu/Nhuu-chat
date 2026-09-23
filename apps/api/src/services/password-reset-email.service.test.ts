import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  return { sendMailMock, createTransportMock: vi.fn(() => ({ sendMail: sendMailMock, close: vi.fn() })) };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock }
}));

import { sendPasswordResetEmail } from "./password-reset-email.service.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  sendMailMock.mockReset().mockResolvedValue({ messageId: "mail-1" });
  createTransportMock.mockClear();
});

describe("sendPasswordResetEmail", () => {
  it("sends the reset link through the configured SMTP transport", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("SMTP_USER", "mailer@example.com");
    vi.stubEnv("SMTP_PASS", "smtp-secret");

    await sendPasswordResetEmail("member@example.com", "https://app.example.com/reset-password?token=raw-token");

    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "mailer@example.com", pass: "smtp-secret" }
    });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: "mailer@example.com",
      to: "member@example.com",
      subject: "Đặt lại mật khẩu NhuuChat",
      text: expect.stringContaining("https://app.example.com/reset-password?token=raw-token"),
      html: expect.stringContaining("https://app.example.com/reset-password?token=raw-token")
    });
    const sentEmail = sendMailMock.mock.calls[0][0];
    expect(sentEmail.html).toContain("https://app.example.com/nhuu-logo-landing.svg");
    expect(sentEmail.html).toContain("Đặt lại mật khẩu");
    expect(sentEmail.html).toContain("30 phút");
    expect(sentEmail.html).toContain("Nếu bạn không yêu cầu");
    expect(sentEmail.text).toContain("Nếu bạn không yêu cầu");
  });

  it("escapes the reset link before embedding it in HTML", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "mailer@example.com");
    vi.stubEnv("SMTP_PASS", "smtp-secret");

    await sendPasswordResetEmail("member@example.com", "https://app.example.com/reset?token=a&next=<script>");

    const sentEmail = sendMailMock.mock.calls[0][0];
    expect(sentEmail.html).toContain("token=a&amp;next=&lt;script&gt;");
    expect(sentEmail.html).not.toContain("<script>");
    expect(sentEmail.text).toContain("token=a&next=<script>");
  });

  it("fails without SMTP configuration and logs no credentials", async () => {
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendPasswordResetEmail("member@example.com", "https://app.example.com/reset-password?token=x"))
      .rejects.toThrow("Password reset email is not configured");
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("PASSWORD_RESET_EMAIL_CONFIGURATION_MISSING");
  });

  it("logs a safe error when SMTP delivery fails", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "465");
    vi.stubEnv("SMTP_SECURE", "true");
    vi.stubEnv("SMTP_USER", "mailer@example.com");
    vi.stubEnv("SMTP_PASS", "smtp-secret");
    sendMailMock.mockRejectedValue(new Error("provider failure smtp-secret"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendPasswordResetEmail("member@example.com", "https://app.example.com/reset-password?token=x"))
      .rejects.toThrow("Password reset email delivery failed");
    expect(errorSpy).toHaveBeenCalledWith("PASSWORD_RESET_EMAIL_DELIVERY_FAILED");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("smtp-secret");
  });
});
