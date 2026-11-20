import { createHmac } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export type Provider = "google" | "facebook";

export type OAuthProfile = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

const FB_VERSION = process.env.FACEBOOK_API_VERSION ?? "v23.0";
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 10000 });

export function isProvider(v: string): v is Provider {
  return v === "google" || v === "facebook";
}

export function appUrl(): string {
  const url = new URL(process.env.APP_URL ?? "http://localhost:3000");
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("APP_URL phải là origin http(s) hợp lệ.");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("APP_URL production cần HTTPS.");
  return url.origin;
}

export function redirectUri(p: Provider): string {
  return `${appUrl()}/api/auth/${p}/callback`;
}

function creds(p: Provider): { id: string; secret: string } | null {
  const id = (p === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.FACEBOOK_APP_ID)?.trim() ?? "";
  const secret =
    (p === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.FACEBOOK_APP_SECRET)?.trim() ?? "";
  return id && secret ? { id, secret } : null;
}

function splitName(fullName: unknown, first: unknown, last: unknown): { firstName: string; lastName: string } {
  const f = typeof first === "string" ? first.trim() : "";
  const l = typeof last === "string" ? last.trim() : "";
  if (f || l) return { firstName: f, lastName: l };
  const raw = typeof fullName === "string" ? fullName.trim().replace(/\s+/g, " ") : "";
  if (!raw) return { firstName: "", lastName: "" };
  const parts = raw.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[parts.length - 1], lastName: parts.slice(0, -1).join(" ") };
}

export function isConfigured(p: Provider): boolean {
  return creds(p) !== null;
}

export function authorizeUrl(p: Provider, state: string, codeChallenge?: string, nonce?: string): string {
  const c = creds(p);
  if (!c) throw new Error("Chưa cấu hình đăng nhập " + p);
  const params = new URLSearchParams({
    client_id: c.id,
    redirect_uri: redirectUri(p),
    response_type: "code",
    state,
  });
  if (p === "google") {
    params.set("scope", "openid email profile");
    params.set("prompt", "select_account");
    if (nonce) params.set("nonce", nonce);
    if (codeChallenge) { params.set("code_challenge", codeChallenge); params.set("code_challenge_method", "S256"); }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  if (!/^v\d+\.0$/.test(FB_VERSION)) throw new Error("FACEBOOK_API_VERSION không hợp lệ.");
  params.set("scope", "email,public_profile");
  params.set("auth_type", "rerequest");
  return `https://www.facebook.com/${FB_VERSION}/dialog/oauth?${params}`;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  if (!res.ok) throw new Error(`OAuth lỗi ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchProfile(p: Provider, code: string, codeVerifier?: string, nonce?: string): Promise<OAuthProfile> {
  const c = creds(p);
  if (!c) throw new Error("Chưa cấu hình đăng nhập " + p);

  if (p === "google") {
    const token = await json(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: c.id,
          client_secret: c.secret,
          redirect_uri: redirectUri(p),
          grant_type: "authorization_code",
          ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        }),
      })
    );
    if (typeof token.id_token !== "string" || !nonce) throw new Error("OAuth token không hợp lệ.");
    const { payload: u } = await jwtVerify(token.id_token, googleKeys, { algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"], audience: c.id, requiredClaims: ["sub", "exp", "iat"] });
    if (u.nonce !== nonce || (u.azp !== undefined && u.azp !== c.id) || (Array.isArray(u.aud) && u.aud.length > 1 && u.azp !== c.id) || typeof u.sub !== "string" || !u.sub) throw new Error("OAuth profile không hợp lệ.");
    const names = splitName(u.name, u.given_name, u.family_name);
    return {
      id: String(u.sub),
      email: typeof u.email === "string" ? u.email : null,
      emailVerified: u.email_verified === true,
      firstName: names.firstName,
      lastName: names.lastName,
      avatarUrl: typeof u.picture === "string" && /^https:\/\//.test(u.picture) && u.picture.length <= 500 ? u.picture : null,
    };
  }

  if (!/^v\d+\.0$/.test(FB_VERSION)) throw new Error("FACEBOOK_API_VERSION không hợp lệ.");
  const tokenParams = new URLSearchParams({
    client_id: c.id,
    client_secret: c.secret,
    redirect_uri: redirectUri(p),
    code,
  });
  const token = await json(
    await fetch(`https://graph.facebook.com/${FB_VERSION}/oauth/access_token?${tokenParams}`, { cache: "no-store", signal: AbortSignal.timeout(10000) })
  );
  if (typeof token.access_token !== "string" || !token.access_token) throw new Error("OAuth token không hợp lệ.");
  const debugParams = new URLSearchParams({ input_token: token.access_token });
  const debug = await json(await fetch(`https://graph.facebook.com/${FB_VERSION}/debug_token?${debugParams}`, { headers: { Authorization: `Bearer ${c.id}|${c.secret}` }, cache: "no-store", signal: AbortSignal.timeout(10000) }));
  const info = debug.data as Record<string, unknown> | undefined;
  const now = Math.floor(Date.now() / 1000);
  if (!info || info.is_valid !== true || info.app_id !== c.id || info.type !== "USER" || typeof info.user_id !== "string" || typeof info.expires_at !== "number" || info.expires_at <= now || (typeof info.data_access_expires_at === "number" && info.data_access_expires_at > 0 && info.data_access_expires_at <= now)) throw new Error("OAuth token không hợp lệ.");
  const meParams = new URLSearchParams({
    fields: "id,name,first_name,last_name,email",
    appsecret_proof: createHmac("sha256", c.secret).update(token.access_token).digest("hex"),
  });
  const u = await json(await fetch(`https://graph.facebook.com/${FB_VERSION}/me?${meParams}`, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) }));
  if (typeof u.id !== "string" || !u.id || u.id !== info.user_id) throw new Error("OAuth profile không hợp lệ.");
  const names = splitName(u.name, u.first_name, u.last_name);
  return {
    id: String(u.id),
    email: typeof u.email === "string" ? u.email : null,
    emailVerified: false, // không tự liên kết với tài khoản có sẵn
    firstName: names.firstName,
    lastName: names.lastName,
    avatarUrl: null,
  };
}
