import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 phút
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 giây giữa các lần gửi mã
export const MAX_VERIFY_ATTEMPTS = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 phút
const MAX_SENDS_PER_EMAIL = 5;
const MAX_SENDS_PER_IP = 15;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const OTP_RE = /^\d{6}$/;
export const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type ValidatedRegisterPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type PendingOtpSession = {
  sessionId: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  otpSalt: string;
  otpHash: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
  consumed: boolean;
};

type OtpStore = {
  sessions: Map<string, PendingOtpSession>;
  latestByEmail: Map<string, string>;
  emailSendLog: Map<string, number[]>;
  ipSendLog: Map<string, number[]>;
  ephemeralSecret?: string;
};

type GlobalWithOtp = typeof globalThis & { __rivandaRegisterOtp?: OtpStore };
const g = globalThis as GlobalWithOtp;

function getStore(): OtpStore {
  if (!g.__rivandaRegisterOtp) {
    g.__rivandaRegisterOtp = {
      sessions: new Map(),
      latestByEmail: new Map(),
      emailSendLog: new Map(),
      ipSendLog: new Map(),
    };
  }
  return g.__rivandaRegisterOtp;
}

function hmacSecret(): string {
  const envSecret = (process.env.SESSION_SECRET ?? "").trim();
  if (envSecret.length >= 32) return envSecret;
  const store = getStore();
  if (!store.ephemeralSecret) {
    store.ephemeralSecret = randomBytes(32).toString("hex");
  }
  return store.ephemeralSecret;
}

function prune(now: number): void {
  const store = getStore();
  for (const [id, session] of store.sessions.entries()) {
    if (session.consumed || now > session.expiresAt + 60_000) {
      store.sessions.delete(id);
      if (store.latestByEmail.get(session.email) === id) {
        store.latestByEmail.delete(session.email);
      }
    }
  }
  const cutoff = now - RATE_WINDOW_MS;
  for (const map of [store.emailSendLog, store.ipSendLog]) {
    for (const [key, times] of map.entries()) {
      const kept = times.filter((t) => t > cutoff);
      if (kept.length) map.set(key, kept);
      else map.delete(key);
    }
  }
}

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 255).toLowerCase();
}

export function validateRegisterInput(input: {
  firstName: unknown;
  lastName: unknown;
  email: unknown;
  password: unknown;
  confirmPassword: unknown;
  agree: unknown;
}): { ok: true; value: ValidatedRegisterPayload } | { ok: false; error: string } {
  const lastName = String(input.lastName ?? "").trim().slice(0, 60);
  const firstName = String(input.firstName ?? "").trim().slice(0, 60);
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");
  const confirmPassword = String(input.confirmPassword ?? "");
  const agree = input.agree === true || input.agree === "on" || input.agree === "true";

  if (!firstName) return { ok: false, error: "Vui lòng nhập tên của bạn." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Địa chỉ email chưa đúng định dạng." };
  if (password.length < 8) return { ok: false, error: "Mật khẩu cần ít nhất 8 ký tự." };
  if (password.length > 128) return { ok: false, error: "Mật khẩu quá dài (tối đa 128 ký tự)." };
  if (password !== confirmPassword) return { ok: false, error: "Mật khẩu nhập lại chưa khớp." };
  if (!agree) return { ok: false, error: "Bạn cần đồng ý với điều khoản và chính sách để tiếp tục." };

  return { ok: true, value: { firstName, lastName, email, password } };
}

export function generateOtpCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

export function hashOtp(sessionId: string, email: string, salt: string, otp: string): string {
  return createHmac("sha256", hmacSecret())
    .update(`register-otp-v1:${sessionId}:${email}:${salt}:${otp}`)
    .digest("hex");
}

function safeHashEqual(aHex: string, bHex: string): boolean {
  if (aHex.length !== bHex.length) return false;
  return timingSafeEqual(Buffer.from(aHex, "hex"), Buffer.from(bHex, "hex"));
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] ?? "*"}***@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(4, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

export function checkSendRateLimit(
  email: string,
  ip: string,
  now = Date.now(),
): { ok: true } | { ok: false; error: string; retryAfterSeconds: number } {
  prune(now);
  const store = getStore();
  const normalized = normalizeEmail(email);
  const cutoff = now - RATE_WINDOW_MS;

  const emailTimes = (store.emailSendLog.get(normalized) ?? []).filter((t) => t > cutoff);
  const lastEmailSend = emailTimes.at(-1);
  if (lastEmailSend && now - lastEmailSend < RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((RESEND_COOLDOWN_MS - (now - lastEmailSend)) / 1000));
    return {
      ok: false,
      error: `Vui lòng đợi ${retryAfterSeconds} giây trước khi gửi lại mã xác thực.`,
      retryAfterSeconds,
    };
  }
  if (emailTimes.length >= MAX_SENDS_PER_EMAIL) {
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - emailTimes[0])) / 1000));
    return {
      ok: false,
      error: "Bạn đã yêu cầu mã xác thực quá nhiều lần. Hãy thử lại sau ít phút.",
      retryAfterSeconds,
    };
  }

  const ipTimes = (store.ipSendLog.get(ip) ?? []).filter((t) => t > cutoff);
  if (ipTimes.length >= MAX_SENDS_PER_IP) {
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - ipTimes[0])) / 1000));
    return {
      ok: false,
      error: "Hệ thống nhận quá nhiều yêu cầu từ kết nối này. Vui lòng thử lại sau ít phút.",
      retryAfterSeconds,
    };
  }

  return { ok: true };
}

export function createPendingOtpSession(
  input: {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
    ip: string;
  },
  now = Date.now(),
): { sessionId: string; otp: string; expiresAt: number } {
  prune(now);
  const store = getStore();
  const email = normalizeEmail(input.email);

  // Vô hiệu hóa mọi phiên OTP cũ của cùng email để mỗi email chỉ dùng mã thuộc phiên hiện tại
  const prevId = store.latestByEmail.get(email);
  if (prevId) {
    store.sessions.delete(prevId);
  }

  const sessionId = randomUUID();
  const otp = generateOtpCode();
  const otpSalt = randomBytes(16).toString("hex");
  const otpHash = hashOtp(sessionId, email, otpSalt, otp);
  const expiresAt = now + OTP_TTL_MS;

  store.sessions.set(sessionId, {
    sessionId,
    email,
    firstName: input.firstName,
    lastName: input.lastName,
    passwordHash: input.passwordHash,
    otpSalt,
    otpHash,
    createdAt: now,
    expiresAt,
    attempts: 0,
    consumed: false,
  });
  store.latestByEmail.set(email, sessionId);

  const cutoff = now - RATE_WINDOW_MS;
  const emailTimes = (store.emailSendLog.get(email) ?? []).filter((t) => t > cutoff);
  emailTimes.push(now);
  store.emailSendLog.set(email, emailTimes);

  const ipTimes = (store.ipSendLog.get(input.ip) ?? []).filter((t) => t > cutoff);
  ipTimes.push(now);
  store.ipSendLog.set(input.ip, ipTimes);

  return { sessionId, otp, expiresAt };
}

export function rollbackPendingOtpSession(sessionId: string, email: string, ip: string): void {
  const store = getStore();
  const normalized = normalizeEmail(email);
  store.sessions.delete(sessionId);
  if (store.latestByEmail.get(normalized) === sessionId) {
    store.latestByEmail.delete(normalized);
  }
  const emailTimes = store.emailSendLog.get(normalized);
  if (emailTimes?.length) {
    emailTimes.pop();
    if (emailTimes.length) store.emailSendLog.set(normalized, emailTimes);
    else store.emailSendLog.delete(normalized);
  }
  const ipTimes = store.ipSendLog.get(ip);
  if (ipTimes?.length) {
    ipTimes.pop();
    if (ipTimes.length) store.ipSendLog.set(ip, ipTimes);
    else store.ipSendLog.delete(ip);
  }
}

export type VerifyOtpResult =
  | {
      ok: true;
      payload: {
        firstName: string;
        lastName: string;
        email: string;
        passwordHash: string;
      };
    }
  | { ok: false; error: string; status: 400 | 410 | 429; locked?: boolean };

export function verifyAndConsumePendingOtp(
  input: { sessionId: string; email: string; otp: string },
  now = Date.now(),
): VerifyOtpResult {
  prune(now);
  const store = getStore();
  const sessionId = String(input.sessionId ?? "").trim();
  const email = normalizeEmail(input.email);
  const otp = String(input.otp ?? "").trim();

  if (!UUID_RE.test(sessionId) || !EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "Phiên xác thực không hợp lệ. Vui lòng yêu cầu mã mới." };
  }
  if (!OTP_RE.test(otp)) {
    return { ok: false, status: 400, error: "Mã xác thực gồm đúng 6 chữ số." };
  }

  const session = store.sessions.get(sessionId);
  if (!session || session.consumed || session.email !== email) {
    return { ok: false, status: 410, error: "Phiên xác thực không tồn tại hoặc đã được sử dụng. Hãy gửi mã mới." };
  }

  // Đảm bảo mã thuộc đúng phiên xác thực mới nhất của email này
  if (store.latestByEmail.get(email) !== sessionId) {
    store.sessions.delete(sessionId);
    return { ok: false, status: 410, error: "Mã xác thực cũ đã hết hiệu lực. Vui lòng dùng mã mới nhất." };
  }

  if (now > session.expiresAt) {
    store.sessions.delete(sessionId);
    store.latestByEmail.delete(email);
    return { ok: false, status: 410, error: "Mã xác thực đã hết hạn sau 5 phút. Vui lòng nhấn Gửi lại mã." };
  }

  if (session.attempts >= MAX_VERIFY_ATTEMPTS) {
    store.sessions.delete(sessionId);
    store.latestByEmail.delete(email);
    return {
      ok: false,
      status: 429,
      locked: true,
      error: "Bạn đã nhập sai quá số lần cho phép. Vui lòng yêu cầu mã xác thực mới.",
    };
  }

  const candidateHash = hashOtp(session.sessionId, session.email, session.otpSalt, otp);
  if (!safeHashEqual(candidateHash, session.otpHash)) {
    session.attempts += 1;
    const remaining = MAX_VERIFY_ATTEMPTS - session.attempts;
    if (remaining <= 0) {
      store.sessions.delete(sessionId);
      store.latestByEmail.delete(email);
      return {
        ok: false,
        status: 429,
        locked: true,
        error: "Bạn đã nhập sai quá 5 lần. Phiên xác thực đã bị khóa, vui lòng gửi lại mã mới.",
      };
    }
    return {
      ok: false,
      status: 400,
      error: `Mã xác thực chưa đúng. Bạn còn ${remaining} lần thử.`,
    };
  }

  // Đánh dấu đã dùng ngay lập tức trước khi tạo user để chống gửi trùng
  session.consumed = true;
  store.sessions.delete(sessionId);
  if (store.latestByEmail.get(email) === sessionId) {
    store.latestByEmail.delete(email);
  }

  return {
    ok: true,
    payload: {
      firstName: session.firstName,
      lastName: session.lastName,
      email: session.email,
      passwordHash: session.passwordHash,
    },
  };
}

export function buildOtpEmailContent(otp: string, firstName: string): {
  subject: string;
  text: string;
  html: string;
} {
  const safeName = firstName.replace(/[<>&"]/g, "");
  const subject = "Mã xác thực đăng ký tài khoản Rivanda";
  const text = [
    `Xin chào ${firstName},`,
    "",
    `Mã xác thực (OTP) để hoàn tất đăng ký tài khoản Rivanda của bạn là: ${otp}`,
    "",
    "Mã có hiệu lực trong 5 phút và chỉ dùng cho phiên đăng ký hiện tại.",
    "Tuyệt đối không chia sẻ mã này cho bất kỳ ai. Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.",
    "",
    "— Rivanda",
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#0f1d30;color:#f4f1ea;border-radius:16px;border:1px solid #2b3d57;">
      <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#d1a974;font-weight:700;">RIVANDA</p>
      <h1 style="margin:0 0 14px;font-size:22px;font-weight:700;color:#f6f2ea;">Xác thực địa chỉ email của bạn</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#cbd5e1;">Xin chào ${safeName}, nhập mã xác thực 6 chữ số bên dưới để hoàn tất tạo tài khoản:</p>
      <div style="margin:0 0 20px;padding:18px;text-align:center;background:#172d46;border:1px solid #b58b57;border-radius:12px;">
        <span style="font-family:'JetBrains Mono',Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:0.32em;color:#f6f2ea;">${otp}</span>
      </div>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#94a3b8;">Mã có hiệu lực trong <strong style="color:#f4f1ea;">5 phút</strong> và chỉ áp dụng cho phiên đăng ký hiện tại.</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">Nếu bạn không thực hiện đăng ký trên Rivanda, vui lòng bỏ qua email này.</p>
    </div>
  `.trim();

  return { subject, text, html };
}
