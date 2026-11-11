import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { appUrl, authorizeUrl, isConfigured, isProvider } from "@/lib/oauth";
import { safeNext } from "@/lib/url";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  const next = safeNext(req.nextUrl.searchParams.get("next"));

  if (!isConfigured(provider)) {
    return NextResponse.redirect(new URL(`/login?${new URLSearchParams({ error: "provider_unavailable", next })}`, appUrl()));
  }

  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  const jar = await cookies();
  jar.set("oauth_state", state, opts);
  jar.set("oauth_next", next, opts);
  jar.set("oauth_provider", provider, opts);
  if (provider === "google") jar.set("oauth_verifier", verifier, opts);
  else jar.delete("oauth_verifier");

  return NextResponse.redirect(authorizeUrl(provider, state, provider === "google" ? createHash("sha256").update(verifier).digest("base64url") : undefined));
}
