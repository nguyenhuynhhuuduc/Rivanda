"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type AuthState } from "@/app/(auth)/actions";
import { PasswordField } from "./PasswordField";
import { inputCls, linkCls, primaryBtnCls } from "./styles";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(loginAction, {});
  const error = state.error ?? initialError;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />

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
          defaultValue={state.values?.email}
          className={inputCls}
        />
      </div>

      <PasswordField autoComplete="current-password" />
      <p className="text-right text-sm">
        <Link href="/forgot-password" className={linkCls}>Quên mật khẩu?</Link>
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button disabled={pending} className={primaryBtnCls}>
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>

      <p className="text-center text-sm text-muted">
        Chưa có tài khoản?{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className={linkCls}>
          Đăng ký
        </Link>
      </p>
    </form>
  );
}
