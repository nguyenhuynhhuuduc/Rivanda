import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { appUrl, authorizeUrl, isConfigured, isProvider } from "@/lib/oauth";
import { createOAuthFlow, OAUTH_COOKIE, oauthCookieOptions } from "@/lib/oauth-state";
import { safeNext } from "@/lib/url";

async function start(req: NextRequest, ctx: { params: Promise<{ provider: string }> }, linking: boolean) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  // Linking is a deliberate same-origin POST from Security, never a login-side email merge.
  if (linking && req.headers.get("origin") !== appUrl()) return new Response("Forbidden", { status: 403 });
  const next = linking ? "/account/security" : safeNext(req.nextUrl.searchParams.get("next"));
  const user = await getCurrentUser();
  if (linking && !user) return NextResponse.redirect(new URL("/login?next=%2Faccount%2Fsecurity", appUrl()), 303);
  if (!linking && user) return NextResponse.redirect(new URL(next, appUrl()));
  const jar = await cookies();
  const session = jar.get("session")?.value;
  if (linking && !session) return new Response("Forbidden", { status: 403 });
  if (!isConfigured(provider)) {
    return NextResponse.redirect(new URL(`${linking ? "/account/security" : "/login"}?${new URLSearchParams({ error: "provider_unavailable", next })}`, appUrl()), 303);
  }
  const { flow, token } = await createOAuthFlow(provider, next, linking ? { id: user!.id, session: session! } : undefined);
  jar.set(OAUTH_COOKIE, token, oauthCookieOptions);
  return NextResponse.redirect(authorizeUrl(provider, flow.state, provider === "google" ? createHash("sha256").update(flow.verifier).digest("base64url") : undefined, flow.nonce), 303);
}
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) { return start(req, ctx, false); }
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) { return start(req, ctx, true); }
