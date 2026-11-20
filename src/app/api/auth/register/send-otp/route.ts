import { headers } from "next/headers";
import { isSmtpConfigured, sendMail } from "@/lib/mail";
import { hashPassword } from "@/lib/password";
import {
  buildOtpEmailContent,
  checkSendRateLimit,
  createPendingOtpSession,
  maskEmail,
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  rollbackPendingOtpSession,
  validateRegisterInput,
} from "@/lib/register-otp";
import { findUserByEmail } from "@/lib/users";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400, headers: responseHeaders });
    }

    const validated = validateRegisterInput({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      password: body.password,
      confirmPassword: body.confirmPassword,
      agree: body.agree,
    });
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: 400, headers: responseHeaders });
    }

    // Không bao giờ giả lập gửi email thành công khi chưa cấu hình SMTP
    if (!isSmtpConfigured()) {
      return Response.json(
        {
          error:
            "Dịch vụ gửi email xác thực (SMTP) chưa được cấu hình trên máy chủ. Vui lòng cấu hình SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD và EMAIL_FROM.",
        },
        { status: 503, headers: responseHeaders },
      );
    }

    const { firstName, lastName, email, password } = validated.value;
    const ip = await clientIp();

    const rate = checkSendRateLimit(email, ip);
    if (!rate.ok) {
      return Response.json(
        { error: rate.error, retryAfterSeconds: rate.retryAfterSeconds },
        { status: 429, headers: responseHeaders },
      );
    }

    if (await findUserByEmail(email)) {
      return Response.json(
        { error: "Email này đã được đăng ký. Hãy đăng nhập." },
        { status: 409, headers: responseHeaders },
      );
    }

    const passwordHash = await hashPassword(password);
    const { sessionId, otp } = createPendingOtpSession({
      firstName,
      lastName,
      email,
      passwordHash,
      ip,
    });

    const mail = buildOtpEmailContent(otp, firstName);
    const sent = await sendMail(email, mail.subject, mail.text, mail.html);
    if (!sent) {
      rollbackPendingOtpSession(sessionId, email, ip);
      return Response.json(
        { error: "Chưa thể gửi email xác thực lúc này. Vui lòng kiểm tra cấu hình SMTP hoặc thử lại sau." },
        { status: 503, headers: responseHeaders },
      );
    }

    // Không bao giờ trả OTP ra API response hay ghi log
    return Response.json(
      {
        ok: true,
        sessionId,
        maskedEmail: maskEmail(email),
        expiresInSeconds: Math.round(OTP_TTL_MS / 1000),
        resendCooldownSeconds: Math.round(RESEND_COOLDOWN_MS / 1000),
      },
      { headers: responseHeaders },
    );
  } catch {
    return Response.json(
      { error: "Chưa thể xử lý yêu cầu xác thực lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: responseHeaders },
    );
  }
}
