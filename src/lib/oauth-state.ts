import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { isProvider, type Provider } from "./oauth";
import { safeNext } from "./url";

export const OAUTH_COOKIE = "oauth_flow";
export const oauthCookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
type Flow = { provider: Provider; state: string; next: string; verifier: string; nonce: string; userId: string | null; sessionHash: string | null };
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET chưa hợp lệ.");
  return createHash("sha256").update("oauth-flow-v1\0" + secret).digest();
}
export const sessionFingerprint = (session: string) => createHash("sha256").update(session).digest("hex");

export async function createOAuthFlow(provider: Provider, next: string, account?: { id: string; session: string }) {
  const flow: Flow = { provider, next: safeNext(next), state: randomBytes(32).toString("hex"), verifier: randomBytes(32).toString("base64url"), nonce: randomBytes(32).toString("hex"), userId: account?.id ?? null, sessionHash: account ? sessionFingerprint(account.session) : null };
  const token = await new SignJWT(flow).setProtectedHeader({ alg: "HS256" }).setAudience("oauth-flow-v1").setIssuedAt().setExpirationTime("10m").sign(key());
  return { flow, token };
}

export type OAuthFlowReadResult =
  | { ok: true; flow: Flow }
  | { ok: false; reason: "expired" | "invalid" };

export async function readOAuthFlowDetailed(
  token: string,
  provider: Provider,
  state: string,
): Promise<OAuthFlowReadResult> {
  if (!token) return { ok: false, reason: "expired" };
  try {
    const { payload: p } = await jwtVerify(token, key(), { algorithms: ["HS256"], audience: "oauth-flow-v1", maxTokenAge: "10m" });
    if (!isProvider(String(p.provider)) || p.provider !== provider || typeof p.state !== "string" || !/^[a-f0-9]{64}$/.test(p.state) || !/^[a-f0-9]{64}$/.test(state) || !timingSafeEqual(Buffer.from(p.state), Buffer.from(state))) return { ok: false, reason: "invalid" };
    if (typeof p.verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(p.verifier) || typeof p.nonce !== "string" || !/^[a-f0-9]{64}$/.test(p.nonce) || typeof p.next !== "string") return { ok: false, reason: "invalid" };
    if (p.userId !== null && (typeof p.userId !== "string" || !/^[a-f0-9-]{36}$/i.test(p.userId) || typeof p.sessionHash !== "string" || !/^[a-f0-9]{64}$/.test(p.sessionHash))) return { ok: false, reason: "invalid" };
    if (p.userId === null && p.sessionHash !== null) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      flow: { provider, state, next: safeNext(p.next), verifier: p.verifier, nonce: p.nonce, userId: p.userId as string | null, sessionHash: p.sessionHash as string | null },
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "ERR_JWT_EXPIRED") return { ok: false, reason: "expired" };
    return { ok: false, reason: "invalid" };
  }
}

export async function readOAuthFlow(token: string, provider: Provider, state: string): Promise<Flow | null> {
  const res = await readOAuthFlowDetailed(token, provider, state);
  return res.ok ? res.flow : null;
}
