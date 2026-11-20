"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { subscribeChatEvents } from "./realtime-client";

export function MessageNavIcon({
  userId,
  initialUnread,
}: {
  userId: string;
  initialUnread: number;
}) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread, userId]);

  useEffect(() => {
    let stopped = false;

    const syncUnread = async () => {
      try {
        const res = await fetch("/api/messages/unread", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: unknown };
        if (!stopped && Number.isSafeInteger(data.unread) && (data.unread as number) >= 0) {
          setUnread(data.unread as number);
        }
      } catch {
        // Giữ giá trị hiện tại khi mạng gián đoạn tạm thời
      }
    };

    const unsub = subscribeChatEvents((event) => {
      if (event.type === "message:new" && event.message.senderId !== userId) {
        void syncUnread();
      } else if (event.type === "message:read" && event.byUserId === userId) {
        void syncUnread();
      }
    });

    return () => {
      stopped = true;
      unsub();
    };
  }, [userId]);

  const active = pathname === "/messages" || pathname.startsWith("/messages/");

  return (
    <Link
      href="/messages"
      aria-label={`Tin nhắn${unread ? `, ${unread} chưa đọc` : ""}`}
      title="Tin nhắn"
      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link ${
        active
          ? "border-gold/70 bg-gold/10 text-fg"
          : "border-line text-muted hover:bg-card hover:text-fg"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="19"
        height="19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 17.5 3.5 21l3.9-1.2A8.5 8.5 0 1 0 5 17.5Z" />
        <path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01" strokeWidth="2.4" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg shadow"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
