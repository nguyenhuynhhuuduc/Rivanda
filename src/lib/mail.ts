// Không ghi địa chỉ, OTP, token hoặc nội dung email vào log kể cả khi chưa cấu hình SMTP.

function trimmedEnv(key: string): string {
  return (process.env[key] ?? "").trim();
}

export function mailSenderAddress(): string {
  return trimmedEnv("EMAIL_FROM") || trimmedEnv("MAIL_FROM") || trimmedEnv("SMTP_USER");
}

export function isSmtpConfigured(): boolean {
  const host = trimmedEnv("SMTP_HOST");
  if (!host) return false;
  const port = Number(trimmedEnv("SMTP_PORT") || "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const user = trimmedEnv("SMTP_USER");
  const pass = trimmedEnv("SMTP_PASSWORD");
  if (user && !pass) return false;
  if (!mailSenderAddress()) return false;
  return true;
}

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<boolean> {
  if (!isSmtpConfigured()) {
    return false;
  }
  const host = trimmedEnv("SMTP_HOST");
  const port = Number(trimmedEnv("SMTP_PORT") || "587");
  const user = trimmedEnv("SMTP_USER");
  const pass = trimmedEnv("SMTP_PASSWORD");
  try {
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
    await transporter.sendMail({
      from: mailSenderAddress(),
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });
    return true;
  } catch {
    console.error("Không gửi được email. Kiểm tra cấu hình SMTP trong biến môi trường.");
    return false;
  }
}
