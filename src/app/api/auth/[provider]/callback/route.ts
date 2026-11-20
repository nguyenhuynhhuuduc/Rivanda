import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createSession, getCurrentUser } from "@/lib/auth";
import { appUrl, fetchProfile, isConfigured, isProvider } from "@/lib/oauth";
import { OAUTH_COOKIE, readOAuthFlowDetailed, sessionFingerprint } from "@/lib/oauth-state";
import { safeNext } from "@/lib/url";
import { linkOAuthIdentity, loginWithOAuth, touchLogin } from "@/lib/users";

function fail(code: string, next = "/", linking = false) {
  return NextResponse.redirect(new URL(`${linking ? "/account/security" : "/login"}?${new URLSearchParams({ error: code, next: safeNext(next) })}`, appUrl()));
}
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  const jar = await cookies();
  const token = jar.get(OAUTH_COOKIE)?.value ?? "";
  jar.delete(OAUTH_COOKIE);
  const sp = req.nextUrl.searchParams;
  const flowRes = await readOAuthFlowDetailed(token, provider, sp.get("state") ?? "");
  if (!flowRes.ok) return fail(flowRes.reason === "expired" ? "oauth_expired" : "oauth_failed");
  const flow = flowRes.flow;
  const linking = flow.userId !== null;
  if (!isConfigured(provider)) return fail("provider_unavailable", flow.next, linking);
  const user = await getCurrentUser();
  if (linking && (!user || user.id !== flow.userId || sessionFingerprint(jar.get("session")?.value ?? "") !== flow.sessionHash)) return fail("link_session_changed", "/account/security");
  // A session opened in another tab must never be silently switched to a different account.
  if (!linking && user) return NextResponse.redirect(new URL(flow.next, appUrl()));
  const oauthError = sp.get("error");
  const code = sp.get("code");
  if (oauthError) {
    const cancelled = oauthError === "access_denied" || sp.get("error_reason") === "user_denied";
    return fail(cancelled ? "oauth_cancelled" : "oauth_failed", flow.next, linking);
  }
  if (!code) return fail("oauth_cancelled", flow.next, linking);
  if (code.length > 4096) return fail("oauth_failed", flow.next, linking);
  try {
    const profile = await fetchProfile(provider, code, flow.verifier, flow.nonce);
    if (linking) {
      const result = await linkOAuthIdentity(user!.id, provider, profile);
      if (!result.ok) return fail(result.reason, flow.next, true);
      return NextResponse.redirect(new URL("/account/security?linked=1", appUrl()));
    }
    const result = await loginWithOAuth(provider, profile);
    if (!result.ok) return fail(result.reason, flow.next);
    await touchLogin(result.user.id);
    await createSession(result.user.id, result.user.passwordHash);
    return NextResponse.redirect(new URL(flow.next, appUrl()));
  } catch (err) {
    // Never log codes, tokens, provider response bodies or fetch URLs.
    console.error("OAuth thất bại:", err instanceof Error ? err.name : "Error");
    return fail("oauth_failed", flow.next, linking);
  }
}
