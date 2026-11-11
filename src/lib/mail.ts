// Không ghi địa chỉ, token hoặc nội dung email vào log kể cả khi chưa cấu hình SMTP.
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    return false;
  }
  try {
    const nodemailer = (await import("nodemailer")).default;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
        : undefined,
    });
    await transporter.sendMail({
      from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    return true;
  } catch {
    console.error("Không gửi được email. Kiểm tra cấu hình nhà cung cấp.");
    return false;
  }
}
