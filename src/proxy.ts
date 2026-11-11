import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

const equal = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** Cổng staging bảo vệ cả API/Server Action/file; quyền ứng dụng vẫn kiểm tra ở server. */
export function proxy(request: NextRequest) {
  const staging = process.env.APP_ENV === "staging" || process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === "staging";
  if (!staging) return NextResponse.next();
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive", "Vary": "Authorization" };
  if (request.nextUrl.pathname === "/api/health" && ["GET", "HEAD"].includes(request.method)) return NextResponse.next({ headers });
  const username = process.env.STAGING_AUTH_USERNAME ?? "";
  const password = process.env.STAGING_AUTH_PASSWORD ?? "";
  if (!username || username.includes(":") || password.length < 20) return new NextResponse("Staging chưa được cấu hình bảo vệ.", { status: 503, headers });
  const auth = request.headers.get("authorization") ?? "";
  let valid = false;
  if (auth.length <= 4096 && /^Basic [A-Za-z0-9+/]+={0,2}$/i.test(auth)) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator >= 0) {
      const correctUser = equal(decoded.slice(0, separator), username);
      const correctPassword = equal(decoded.slice(separator + 1), password);
      valid = correctUser && correctPassword;
    }
  }
  return valid ? NextResponse.next({ headers }) : new NextResponse("Cần quyền truy cập staging.", {
    status: 401, headers: { ...headers, "WWW-Authenticate": 'Basic realm="Personal Site Staging", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/:path*"] };
