"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordField } from "./PasswordField";
import { inputCls, linkCls, primaryBtnCls } from "./styles";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatCountdown(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RegisterForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();

  // Bước 1: thông tin tài khoản
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agree, setAgree] = useState(false);

  const [touched, setTouched] = useState<{
    firstName?: boolean;
    email?: boolean;
    password?: boolean;
    confirmPassword?: boolean;
    agree?: boolean;
  }>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Bước 2: xác thực Email OTP
  const [step, setStep] = useState<"details" | "otp">("details");
  const [sessionId, setSessionId] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [expiresLeft, setExpiresLeft] = useState(0);
  const [resendLeft, setResendLeft] = useState(0);
  const [sessionLocked, setSessionLocked] = useState(false);

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [serverError, setServerError] = useState(initialError ?? "");
  const [statusMessage, setStatusMessage] = useState("");

  // Đếm ngược hiệu lực OTP (5 phút) và thời gian chờ gửi lại mã (60 giây)
  useEffect(() => {
    if (step !== "otp") return;
    if (expiresLeft <= 0 && resendLeft <= 0) return;
    const timer = window.setInterval(() => {
      setExpiresLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setResendLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, expiresLeft, resendLeft]);

  const trimmedFirst = firstName.trim();
  const trimmedEmail = email.trim().toLowerCase();

  const fieldErrors = {
    firstName: !trimmedFirst ? "Vui lòng nhập tên của bạn." : "",
    email: !EMAIL_RE.test(trimmedEmail) ? "Địa chỉ email chưa đúng định dạng." : "",
    password:
      password.length < 8
        ? "Mật khẩu cần tối thiểu 8 ký tự."
        : password.length > 128
          ? "Mật khẩu tối đa 128 ký tự."
          : "",
    confirmPassword:
      !confirmPassword
        ? "Vui lòng nhập lại mật khẩu."
        : confirmPassword !== password
          ? "Mật khẩu nhập lại chưa khớp."
          : "",
    agree: !agree ? "Bạn cần đồng ý với điều khoản và chính sách để tiếp tục." : "",
  };

  const isDetailsValid =
    !fieldErrors.firstName &&
    !fieldErrors.email &&
    !fieldErrors.password &&
    !fieldErrors.confirmPassword &&
    !fieldErrors.agree;

  const showError = (key: keyof typeof fieldErrors) =>
    Boolean((submitAttempted || touched[key]) && fieldErrors[key]);

  async function requestOtp(isResend = false) {
    setSubmitAttempted(true);
    setServerError("");
    setStatusMessage("");

    if (!isDetailsValid) return;

    setSending(true);
    try {
      const res = await fetch("/api/auth/register/send-otp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          lastName: lastName.trim(),
          firstName: trimmedFirst,
          email: trimmedEmail,
          password,
          confirmPassword,
          agree,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        sessionId?: string;
        maskedEmail?: string;
        expiresInSeconds?: number;
        resendCooldownSeconds?: number;
        retryAfterSeconds?: number;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.sessionId) {
        if (typeof data.retryAfterSeconds === "number" && data.retryAfterSeconds > 0) {
          setResendLeft(data.retryAfterSeconds);
        }
        setServerError(data.error || "Chưa thể gửi mã xác thực lúc này.");
        return;
      }

      setSessionId(data.sessionId);
      setMaskedEmail(data.maskedEmail || trimmedEmail);
      setExpiresLeft(data.expiresInSeconds ?? 300);
      setResendLeft(data.resendCooldownSeconds ?? 60);
      setSessionLocked(false);
      setOtp("");
      setStep("otp");
      setStatusMessage(
        isResend
          ? "Đã gửi mã xác thực mới. Mã cũ trước đó đã hết hiệu lực."
          : "Mã xác thực 6 chữ số đã được gửi tới email của bạn.",
      );
    } catch {
      setServerError("Không thể kết nối máy chủ để gửi mã xác thực. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  }

  async function handleSendSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await requestOtp(false);
  }

  async function handleVerifySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError("");
    setStatusMessage("");

    if (otp.length !== 6) {
      setServerError("Vui lòng nhập đủ 6 chữ số của mã xác thực.");
      return;
    }
    if (expiresLeft <= 0) {
      setServerError("Mã xác thực đã hết hạn. Vui lòng nhấn Gửi lại mã.");
      return;
    }
    if (sessionLocked) {
      setServerError("Phiên xác thực đã bị khóa do nhập sai quá nhiều lần. Hãy nhấn Gửi lại mã.");
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch("/api/auth/register/verify-otp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sessionId,
          email: trimmedEmail,
          otp,
          next,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        redirectTo?: string;
        locked?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        if (data.locked) setSessionLocked(true);
        setServerError(data.error || "Mã xác thực không hợp lệ.");
        return;
      }

      router.push(data.redirectTo || next || "/");
      router.refresh();
    } catch {
      setServerError("Không thể kết nối máy chủ để xác thực mã. Vui lòng thử lại.");
    } finally {
      setVerifying(false);
    }
  }

  if (step === "otp") {
    const expired = expiresLeft <= 0;
    return (
      <form onSubmit={handleVerifySubmit} className="space-y-4" noValidate>
        <div className="rounded-2xl border border-gold/35 bg-card/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-link">
              Xác thực email · Bước 2/2
            </span>
            <span
              className={`font-mono text-xs font-semibold ${
                expired ? "text-danger" : "text-link"
              }`}
              aria-live="polite"
            >
              {expired ? "Mã đã hết hạn" : `Hiệu lực ${formatCountdown(expiresLeft)}`}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Nhập mã xác thực 6 chữ số đã gửi tới{" "}
            <strong className="font-semibold text-fg">{maskedEmail}</strong> để hoàn tất tạo tài khoản.
          </p>
        </div>

        <div>
          <label htmlFor="register-otp" className="mb-1.5 block text-xs font-semibold text-fg">
            Mã xác thực OTP (6 chữ số)
          </label>
          <input
            id="register-otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 6);
              setOtp(digitsOnly);
              if (serverError) setServerError("");
            }}
            disabled={verifying || sending}
            placeholder="000000"
            className={`${inputCls} text-center font-mono text-xl font-semibold tracking-[0.42em]`}
            autoFocus
          />
        </div>

        {statusMessage && !serverError && (
          <p role="status" className="text-sm text-success">
            {statusMessage}
          </p>
        )}

        {serverError && (
          <p role="alert" className="text-sm text-danger">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={verifying || sending || otp.length !== 6 || expired || sessionLocked}
          className={primaryBtnCls}
        >
          {verifying ? "Đang xác thực & tạo tài khoản..." : "Xác thực & tạo tài khoản"}
        </button>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
          <button
            type="button"
            disabled={sending || verifying || resendLeft > 0}
            onClick={() => void requestOtp(true)}
            className="font-medium text-link underline underline-offset-4 transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending
              ? "Đang gửi lại mã..."
              : resendLeft > 0
                ? `Gửi lại mã (${resendLeft}s)`
                : "Gửi lại mã xác thực"}
          </button>

          <button
            type="button"
            disabled={sending || verifying}
            onClick={() => {
              setStep("details");
              setServerError("");
              setStatusMessage("");
              setOtp("");
            }}
            className="text-muted underline underline-offset-4 transition hover:text-fg disabled:opacity-50"
          >
            Chỉnh sửa thông tin
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="sr-only" htmlFor="lastName">
            Họ
          </label>
          <input
            id="lastName"
            name="lastName"
            maxLength={60}
            autoComplete="family-name"
            placeholder="Họ"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={sending}
            className={inputCls}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="firstName">
            Tên
          </label>
          <input
            id="firstName"
            name="firstName"
            required
            maxLength={60}
            autoComplete="given-name"
            placeholder="Tên"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
            disabled={sending}
            aria-invalid={showError("firstName") || undefined}
            aria-describedby={showError("firstName") ? "err-firstName" : undefined}
            className={`${inputCls} ${showError("firstName") ? "border-danger focus:border-danger" : ""}`}
          />
          {showError("firstName") && (
            <p id="err-firstName" className="mt-1.5 text-xs text-danger">
              {fieldErrors.firstName}
            </p>
          )}
        </div>
      </div>

      <div>
        <label className="sr-only" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={255}
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          disabled={sending}
          aria-invalid={showError("email") || undefined}
          aria-describedby={showError("email") ? "err-email" : undefined}
          className={`${inputCls} ${showError("email") ? "border-danger focus:border-danger" : ""}`}
        />
        {showError("email") && (
          <p id="err-email" className="mt-1.5 text-xs text-danger">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <PasswordField
          id="password"
          name="password"
          placeholder="Mật khẩu (tối thiểu 8 ký tự)"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(val) => setPassword(val)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          disabled={sending}
          invalid={showError("password")}
          describedBy={showError("password") ? "err-password" : undefined}
        />
        {showError("password") && (
          <p id="err-password" className="mt-1.5 text-xs text-danger">
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div>
        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          placeholder="Nhập lại mật khẩu"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(val) => setConfirmPassword(val)}
          onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
          disabled={sending}
          invalid={showError("confirmPassword")}
          describedBy={showError("confirmPassword") ? "err-confirmPassword" : undefined}
        />
        {showError("confirmPassword") && (
          <p id="err-confirmPassword" className="mt-1.5 text-xs text-danger">
            {fieldErrors.confirmPassword}
          </p>
        )}
      </div>

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-muted">
          <input
            type="checkbox"
            name="agree"
            checked={agree}
            onChange={(e) => {
              setAgree(e.target.checked);
              setTouched((t) => ({ ...t, agree: true }));
            }}
            disabled={sending}
            required
            className="mt-1 h-4 w-4 shrink-0 rounded accent-[#b58b57]"
          />
          <span className="min-w-0 flex-1">
            Tôi đồng ý với{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className={linkCls}
            >
              điều khoản sử dụng
            </a>{" "}
            và{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className={linkCls}
            >
              chính sách quyền riêng tư
            </a>
          </span>
        </label>
        {showError("agree") && (
          <p className="mt-1.5 text-xs text-danger">{fieldErrors.agree}</p>
        )}
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-danger">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={sending || !isDetailsValid}
        className={primaryBtnCls}
      >
        {sending ? "Đang gửi mã xác thực..." : "Gửi mã xác thực"}
      </button>
    </form>
  );
}
