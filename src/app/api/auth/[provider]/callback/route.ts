import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createSession } from "@/lib/auth";
import { appUrl, fetchProfile, isConfigured, isProvider } from "@/lib/oauth";
import { safeNext } from "@/lib/url";
import { loginWithOAuth, touchLogin } from "@/lib/users";

function fail(code: string, next = "/") {
  return NextResponse.redirect(new URL(`/login?${new URLSearchParams({ error: code, next: safeNext(next) })}`, appUrl()));
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });

  const jar = await cookies();
  const savedState = jar.get("oauth_state")?.value ?? "";
  const next = safeNext(jar.get("oauth_next")?.value);
  const savedProvider = jar.get("oauth_provider")?.value;
  const verifier = jar.get("oauth_verifier")?.value;
  jar.delete("oauth_state");
  jar.delete("oauth_next");
  jar.delete("oauth_provider");
  jar.delete("oauth_verifier");
  if (!isConfigured(provider)) return fail("provider_unavailable", next);

  const sp = req.nextUrl.searchParams;
  const state = sp.get("state") ?? "";
  const code = sp.get("code");

  // Người dùng bấm "Hủy" ở trang Google/Facebook
  if (sp.get("error") || !code) return fail("oauth_cancelled", next);

  // Chặn giả mạo yêu cầu (CSRF): state trả về phải khớp state đã lưu trong cookie
  const a = Buffer.from(state);
  const b = Buffer.from(savedState);
  if (!savedState || state.length > 128 || savedProvider !== provider || a.length !== b.length || !timingSafeEqual(a, b) || (provider === "google" && (!verifier || !/^[A-Za-z0-9_-]{43}$/.test(verifier)))) {
    return fail("oauth_failed", next);
  }

  try {
    const profile = await fetchProfile(provider, code, verifier);
    const result = await loginWithOAuth(provider, profile);
    if (!result.ok) return fail(result.reason, next);

    await touchLogin(result.user.id);
    await createSession(result.user.id);
    return NextResponse.redirect(new URL(next, appUrl()));
  } catch (err) {
    // Không ghi code/token/URL chứa client secret từ lỗi fetch vào log.
    console.error("Đăng nhập OAuth thất bại:", err instanceof Error ? err.name : "Error");
    return fail("oauth_failed", next);
  }
}
