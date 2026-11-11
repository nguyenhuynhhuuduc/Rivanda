"use client";

import { useActionState } from "react";
import { resetPasswordAction, type AuthState } from "@/app/(auth)/actions";
import { PasswordField } from "./PasswordField";
import { primaryBtnCls } from "./styles";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <PasswordField placeholder="Mật khẩu mới (ít nhất 8 ký tự)" autoComplete="new-password" minLength={8} />
      <PasswordField name="confirm" placeholder="Nhập lại mật khẩu mới" autoComplete="new-password" minLength={8} />
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className={primaryBtnCls}>{pending ? "Đang lưu..." : "Đặt mật khẩu mới"}</button>
    </form>
  );
}
