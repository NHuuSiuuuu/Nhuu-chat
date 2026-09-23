import nodemailer from "nodemailer";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

// Tạo nội dung HTML và văn bản thuần đồng nhất cho email đặt lại mật khẩu.
function createPasswordResetContent(resetUrl: string) {
  const escapedResetUrl = escapeHtml(resetUrl);
  const logoUrl = escapeHtml(new URL(resetUrl).origin + "/nhuu-logo-landing.svg");
  const text = [
    "Xin chào,",
    "",
    "Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản NhuuChat của bạn.",
    `Mở liên kết sau trong vòng 30 phút để tạo mật khẩu mới: ${resetUrl}`,
    "",
    "Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu hiện tại của bạn sẽ không thay đổi."
  ].join("\n");
  const html = `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Đặt lại mật khẩu NhuuChat</title></head>
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Đặt lại mật khẩu NhuuChat trong vòng 30 phút.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5eaf2;border-radius:16px;">
          <tr><td align="center" style="padding:32px 32px 12px;"><img src="${logoUrl}" width="160" alt="NhuuChat" style="display:block;width:160px;max-width:100%;height:auto;border:0;"></td></tr>
          <tr><td style="padding:12px 36px 36px;">
            <h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:#14213d;">Đặt lại mật khẩu</h1>
            <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#475569;">Xin chào,</p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#475569;">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản NhuuChat của bạn. Nhấn nút bên dưới để tạo mật khẩu mới.</p>
            <p style="margin:0 0 24px;text-align:center;"><a href="${escapedResetUrl}" style="display:inline-block;padding:14px 24px;border-radius:9px;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Đặt lại mật khẩu</a></p>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.7;color:#64748b;">Liên kết này có hiệu lực trong <strong>30 phút</strong>. Nếu nút không hoạt động, hãy sao chép liên kết sau vào trình duyệt:</p>
            <p style="margin:0 0 22px;overflow-wrap:anywhere;font-size:12px;line-height:1.6;"><a href="${escapedResetUrl}" style="color:#2563eb;">${escapedResetUrl}</a></p>
            <div style="border-top:1px solid #e8edf4;padding-top:18px;">
              <p style="margin:0;font-size:13px;line-height:1.7;color:#64748b;"><strong>Lưu ý bảo mật:</strong> Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu hiện tại của bạn sẽ không thay đổi.</p>
            </div>
          </td></tr>
          <tr><td style="padding:16px 32px;border-top:1px solid #e8edf4;text-align:center;font-size:12px;line-height:1.6;color:#94a3b8;">Email tự động từ NhuuChat. Vui lòng không trả lời email này.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { html, text };
}

// Gửi liên kết đặt lại qua SMTP và chỉ ghi mã lỗi chung để không lộ thông tin đăng nhập.
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const secureSetting = process.env.SMTP_SECURE?.toLowerCase();

  if (
    !host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password ||
    (secureSetting && secureSetting !== "true" && secureSetting !== "false")
  ) {
    console.error("PASSWORD_RESET_EMAIL_CONFIGURATION_MISSING");
    throw new Error("Password reset email is not configured");
  }

  const secure = secureSetting ? secureSetting === "true" : port === 465;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass: password }
  });

  try {
    const content = createPasswordResetContent(resetUrl);
    await transport.sendMail({
      from: user,
      to: email,
      subject: "Đặt lại mật khẩu NhuuChat",
      ...content
    });
  } catch {
    console.error("PASSWORD_RESET_EMAIL_DELIVERY_FAILED");
    throw new Error("Password reset email delivery failed");
  } finally {
    transport.close();
  }
}
