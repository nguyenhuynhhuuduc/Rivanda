"use client";

import { useState } from "react";
import { inputCls } from "./styles";

type Props = {
  name?: string;
  placeholder?: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
};

export function PasswordField({
  name = "password",
  placeholder = "Mật khẩu",
  autoComplete,
  minLength,
}: Props) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={name}>
        {placeholder}
      </label>
      <input
        id={name}
        name={name}
        type={show ? "text" : "password"}
        required
        minLength={minLength}
        maxLength={128}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${inputCls} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={show}
        className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-fg"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {show ? (
            <>
              <path d="M3 3l18 18" />
              <path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 8.5 4 9.5 6-.4.8-1.3 2.1-2.6 3.3M6.6 7.6C4.6 9 3.3 10.9 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </>
          ) : (
            <>
              <path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
