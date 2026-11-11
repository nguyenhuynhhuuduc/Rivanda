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
  const id = p === "google" ? process.env.GOOGLE_CLIENT_ID : process.env.FACEBOOK_APP_ID;
  const secret =
    p === "google" ? process.env.GOOGLE_CLIENT_SECRET : process.env.FACEBOOK_APP_SECRET;
  return id && secret ? { id, secret } : null;
}

export function isConfigured(p: Provider): boolean {
  return creds(p) !== null;
}

export function authorizeUrl(p: Provider, state: string, codeChallenge?: string): string {
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
    if (codeChallenge) { params.set("code_challenge", codeChallenge); params.set("code_challenge_method", "S256"); }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  params.set("scope", "email,public_profile");
  return `https://www.facebook.com/${FB_VERSION}/dialog/oauth?${params}`;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  if (!res.ok) throw new Error(`OAuth lỗi ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function fetchProfile(p: Provider, code: string, codeVerifier?: string): Promise<OAuthProfile> {
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
    if (typeof token.access_token !== "string" || !token.access_token) throw new Error("OAuth token không hợp lệ.");
    const u = await json(
      await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${String(token.access_token)}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      })
    );
    if (typeof u.sub !== "string" || !u.sub) throw new Error("OAuth profile không hợp lệ.");
    return {
      id: String(u.sub),
      email: typeof u.email === "string" ? u.email : null,
      emailVerified: u.email_verified === true,
      firstName: typeof u.given_name === "string" ? u.given_name : "",
      lastName: typeof u.family_name === "string" ? u.family_name : "",
      avatarUrl: typeof u.picture === "string" && /^https:\/\//.test(u.picture) && u.picture.length <= 500 ? u.picture : null,
    };
  }

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
  const meParams = new URLSearchParams({
    fields: "id,first_name,last_name,email",
    access_token: String(token.access_token),
  });
  const u = await json(await fetch(`https://graph.facebook.com/${FB_VERSION}/me?${meParams}`, { cache: "no-store", signal: AbortSignal.timeout(10000) }));
  if (typeof u.id !== "string" || !u.id) throw new Error("OAuth profile không hợp lệ.");
  return {
    id: String(u.id),
    email: typeof u.email === "string" ? u.email : null,
    emailVerified: false, // không tự liên kết với tài khoản có sẵn
    firstName: typeof u.first_name === "string" ? u.first_name : "",
    lastName: typeof u.last_name === "string" ? u.last_name : "",
    avatarUrl: null,
  };
}
