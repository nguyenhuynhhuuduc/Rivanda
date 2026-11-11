"use client";

import { useSyncExternalStore } from "react";

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

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? "light", () => "light");
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* vẫn đổi theme trong phiên hiện tại */ }
    window.dispatchEvent(new Event(EVENT));
  }
  return (
    <button type="button" onClick={toggle} className="theme-toggle" aria-label="Chuyển chế độ sáng / tối" title="Chuyển chế độ sáng / tối" aria-pressed={theme === "dark"}>
      <svg className="theme-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
      <svg className="theme-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.5 14A8.6 8.6 0 0 1 10 3.5 8.7 8.7 0 1 0 20.5 14Z" /></svg>
      <span className="hidden sm:inline">Giao diện</span>
    </button>
  );
}
