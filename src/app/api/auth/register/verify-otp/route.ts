import { createSession } from "@/lib/auth";
import { verifyAndConsumePendingOtp } from "@/lib/register-otp";
import { safeNext } from "@/lib/url";
import { createUser, findUserByEmail, isDuplicateError, touchLogin } from "@/lib/users";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Dữ liệu xác thực không hợp lệ." }, { status: 400, headers: responseHeaders });
    }

    const sessionId = String(body.sessionId ?? "").trim();
    const email = String(body.email ?? "").trim();
    const otp = String(body.otp ?? "").trim();
    const next = safeNext(String(body.next ?? ""));

    const verification = verifyAndConsumePendingOtp({ sessionId, email, otp });
    if (!verification.ok) {
      return Response.json(
        { error: verification.error, locked: verification.locked ?? false },
        { status: verification.status, headers: responseHeaders },
      );
    }

    const { firstName, lastName, email: verifiedEmail, passwordHash } = verification.payload;

    if (await findUserByEmail(verifiedEmail)) {
      return Response.json(
        { error: "Email này đã được đăng ký. Hãy đăng nhập." },
        { status: 409, headers: responseHeaders },
      );
    }

    let createdUserId: string;
    let createdPasswordHash: string | null;
    try {
      const user = await createUser({
        email: verifiedEmail,
        passwordHash,
        firstName,
        lastName,
      });
      createdUserId = user.id;
      createdPasswordHash = user.passwordHash;
    } catch (err) {
      if (isDuplicateError(err)) {
        return Response.json(
          { error: "Email này đã được đăng ký. Hãy đăng nhập." },
          { status: 409, headers: responseHeaders },
        );
      }
      return Response.json(
        { error: "Chưa thể tạo tài khoản. Hãy thử lại sau hoặc liên hệ quản trị viên." },
        { status: 500, headers: responseHeaders },
      );
    }

    await touchLogin(createdUserId);
    await createSession(createdUserId, createdPasswordHash);

    return Response.json({ ok: true, redirectTo: next }, { headers: responseHeaders });
  } catch {
    return Response.json(
      { error: "Chưa thể xác thực lúc này. Vui lòng thử lại sau." },
      { status: 500, headers: responseHeaders },
    );
  }
}
