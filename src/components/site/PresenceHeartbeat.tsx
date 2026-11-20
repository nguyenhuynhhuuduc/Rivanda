"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 30_000;
const MIN_PING_GAP_MS = 10_000;

export function PresenceHeartbeat({ userId }: { userId: string }) {
  useEffect(() => {
    let stopped = false;
    let lastPing = 0;

    const sendHeartbeat = (force = false) => {
      if (stopped) return;
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!force && now - lastPing < MIN_PING_GAP_MS) return;
      lastPing = now;
      void fetch("/api/discovery/presence", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "online" }),
        keepalive: true,
      }).catch(() => {
        // Bỏ qua lỗi mạng tạm thời, nhịp tiếp theo sẽ tự gửi lại
      });
    };

    const sendOffline = () => {
      if (typeof navigator.sendBeacon === "function") {
        const blob = new Blob([JSON.stringify({ status: "offline" })], {
          type: "application/json",
        });
        navigator.sendBeacon("/api/discovery/presence", blob);
      }
    };

    sendHeartbeat(true);

    const timer = window.setInterval(() => sendHeartbeat(false), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") sendHeartbeat(false);
    };
    const onFocus = () => sendHeartbeat(false);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", sendOffline);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", sendOffline);
    };
  }, [userId]);

  return null;
}
