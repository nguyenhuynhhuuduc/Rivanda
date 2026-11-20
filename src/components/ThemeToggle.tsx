"use client";

import { useSyncExternalStore } from "react";
import styles from "./ThemeToggle.module.css";

const KEY = "personal-site-theme";
const EVENT = "personal-site-theme-change";

function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage có thể bị chặn */ }
    const theme = saved === "light" || saved === "dark" ? saved : media.matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", sync);
  media.addEventListener("change", sync);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", sync);
    media.removeEventListener("change", sync);
  };
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.35 5.35l1.5 1.5M17.15 17.15l1.5 1.5M18.65 5.35l-1.5 1.5M6.85 17.15l-1.5 1.5" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18.6 15.1A7.4 7.4 0 0 1 8.9 5.4a7.7 7.7 0 1 0 9.7 9.7Z" />
      <path
        d="M15.6 7.5l.55 1.3 1.3.55-1.3.55-.55 1.3-.55-1.3-1.3-.55 1.3-.55.55-1.3Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M18.6 5.2l.32.78.78.32-.78.32-.32.78-.32-.78-.78-.32.78-.32.32-.78Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme ?? "light",
    () => "light",
  );

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* vẫn đổi theme trong phiên hiện tại */ }
    window.dispatchEvent(new Event(EVENT));
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggle}
      className={styles.toggle}
      aria-label="Chuyển chế độ sáng / tối"
      title={isDark ? "Đang ở chế độ tối — Nhấn để chuyển sang sáng" : "Đang ở chế độ sáng — Nhấn để chuyển sang tối"}
    >
      <span className={styles.trackIcons} aria-hidden="true">
        <span className={`${styles.trackSlot} ${styles.trackSun}`}>
          <SunIcon />
        </span>
        <span className={`${styles.trackSlot} ${styles.trackMoon}`}>
          <MoonIcon />
        </span>
      </span>

      <span className={styles.knob} aria-hidden="true">
        <SunIcon className={`${styles.knobIcon} ${styles.knobSun}`} />
        <MoonIcon className={`${styles.knobIcon} ${styles.knobMoon}`} />
      </span>
    </button>
  );
}
