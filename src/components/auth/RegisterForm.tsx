"use client";

import { useActionState } from "react";
import { registerAction, type AuthState } from "@/app/(auth)/actions";
import { PasswordField } from "./PasswordField";
import { inputCls, primaryBtnCls } from "./styles";

export function RegisterForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(registerAction, {});
  const error = state.error ?? initialError;
  const v = state.values;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="sr-only" htmlFor="lastName">Họ</label>
          <input
            id="lastName"
            name="lastName"
            maxLength={60}
            autoComplete="family-name"
            placeholder="Họ"
            defaultValue={v?.lastName}
            className={inputCls}
          />
        </div>
        <div>
          <label className="sr-only" htmlFor="firstName">Tên</label>
          <input
            id="firstName"
            name="firstName"
            required
            maxLength={60}
            autoComplete="given-name"
            placeholder="Tên"
            defaultValue={v?.firstName}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="sr-only" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={255}
          autoComplete="email"
          placeholder="Email"
          defaultValue={v?.email}
          className={inputCls}
        />
      </div>

      <div>
        <PasswordField
          placeholder="Mật khẩu (ít nhất 8 ký tự)"
          autoComplete="new-password"
          minLength={8}
        />
      </div>

      <label className="flex items-start gap-3 text-sm text-muted">
        <input
          type="checkbox"
          name="agree"
          required
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#b58b57]"
        />
        <span>
          Tôi đồng ý với{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-4">
            điều khoản sử dụng
          </a>{" "}
          và{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-4">
            chính sách quyền riêng tư
          </a>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button disabled={pending} className={primaryBtnCls}>
        {pending ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
      </button>
    </form>
  );
}
