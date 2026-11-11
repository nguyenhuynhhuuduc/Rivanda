"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type AuthState } from "@/app/(auth)/actions";
import { inputCls, primaryBtnCls } from "./styles";

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(forgotPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <label className="sr-only" htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required maxLength={255} autoComplete="email"
        placeholder="Email đã đăng ký" defaultValue={state.values?.email} className={inputCls} />
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={primaryBtnCls}>{pending ? "Đang gửi..." : "Gửi liên kết đặt lại"}</button>
    </form>
  );
}
