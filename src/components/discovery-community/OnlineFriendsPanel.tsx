"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/kit";
import { subscribeChatEvents } from "@/components/messages/realtime-client";
import { useMiniChat } from "@/components/messages/MiniChatProvider";
import type { MutualPresenceList, MutualPresenceUser } from "@/lib/discovery-community/presence";
import styles from "./OnlineFriendsPanel.module.css";

const POLL_INTERVAL_MS = 30_000;

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Ngoại tuyến";
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(diffSec) || diffSec < 90) return "Vừa mới ngoại tuyến";
  if (diffSec < 3600) return `Hoạt động ${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `Hoạt động ${Math.floor(diffSec / 3600)} giờ trước`;
  return "Ngoại tuyến";
}

function ChatBubbleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
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
  );
}

export function OnlineFriendsPanel({
  loggedIn,
  loginHref,
  initialData,
  onSelectForChat,
}: {
  loggedIn: boolean;
  loginHref: string;
  initialData: MutualPresenceList | null;
  onSelectForChat?: (friend: MutualPresenceUser) => void;
}) {
  const miniChat = useMiniChat();
  const [data, setData] = useState<MutualPresenceList | null>(initialData);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatNotice, setChatNotice] = useState<string>("");
  const openingId = miniChat?.openingPeerId ?? null;

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Đồng bộ presence online/offline thời gian thực qua kênh SSE dùng chung
  useEffect(() => {
    if (!loggedIn) return;
    const unsub = subscribeChatEvents((event) => {
      if (event.type !== "presence:online" && event.type !== "presence:offline") return;
      const online = event.type === "presence:online";
      const target = event.userId.toLowerCase();
      setData((prev) => {
        if (!prev) return prev;
        let touched = false;
        const nextUsers = prev.users.map((u) => {
          if (u.id.toLowerCase() !== target) return u;
          if (u.online === online && u.lastSeenAt === event.lastSeenAt) return u;
          touched = true;
          return { ...u, online, lastSeenAt: event.lastSeenAt };
        });
        if (!touched) return prev;
        nextUsers.sort((a, b) => {
          if (a.online !== b.online) return a.online ? -1 : 1;
          return a.displayName.localeCompare(b.displayName, "vi");
        });
        return {
          ...prev,
          users: nextUsers,
          onlineCount: nextUsers.reduce((acc, u) => acc + (u.online ? 1 : 0), 0),
        };
      });
    });
    return unsub;
  }, [loggedIn]);

  // Làm mới trạng thái online/offline theo nhịp thực tế khi tab đang hiển thị
  useEffect(() => {
    if (!loggedIn) return;
    let stopped = false;
    let controller: AbortController | null = null;

    const refresh = async () => {
      if (stopped || document.visibilityState !== "visible" || controller) return;
      const current = new AbortController();
      controller = current;
      const timeout = window.setTimeout(() => current.abort(), 10_000);
      try {
        const res = await fetch("/api/discovery/presence", {
          cache: "no-store",
          credentials: "same-origin",
          signal: current.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as MutualPresenceList;
        if (!stopped && Array.isArray(json.users)) {
          setData((prev) => {
            if (
              prev &&
              prev.onlineCount === json.onlineCount &&
              prev.totalCount === json.totalCount &&
              prev.users.length === json.users.length &&
              prev.users.every(
                (u, idx) =>
                  u.id === json.users[idx]?.id &&
                  u.online === json.users[idx]?.online &&
                  u.displayName === json.users[idx]?.displayName &&
                  u.avatarUrl === json.users[idx]?.avatarUrl,
              )
            ) {
              return prev;
            }
            return json;
          });
        }
      } catch {
        // Giữ nguyên danh sách gần nhất khi mạng gián đoạn tạm thời
      } finally {
        window.clearTimeout(timeout);
        if (controller === current) controller = null;
      }
    };

    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      controller?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loggedIn]);

  async function handleChatIntent(friend: MutualPresenceUser) {
    if (onSelectForChat) {
      onSelectForChat(friend);
      return;
    }
    if (!miniChat) {
      setChatNotice("Chưa sẵn sàng mở Mini Chat. Hãy tải lại trang.");
      return;
    }
    setChatNotice("");
    const result = await miniChat.openWithPeer(friend);
    if (!result.ok && result.error) {
      setChatNotice(result.error);
    }
  }

  const users = data?.users ?? [];
  const onlineUsers = users.filter((u) => u.online);
  const offlineUsers = users.filter((u) => !u.online);
  const onlineCount = data?.onlineCount ?? onlineUsers.length;

  const renderFriendRow = (friend: MutualPresenceUser) => (
    <li
      key={friend.id}
      className={styles.row}
      data-chat-user-id={friend.id}
      data-presence={friend.online ? "online" : "offline"}
      onClick={() => void handleChatIntent(friend)}
    >
      <button
        type="button"
        disabled={openingId === friend.id}
        onClick={(e) => {
          e.stopPropagation();
          void handleChatIntent(friend);
        }}
        className={styles.avatarBtn}
        aria-label={`Mở Mini Chat với ${friend.displayName} (${friend.online ? "Đang hoạt động" : "Ngoại tuyến"})`}
        title={`Nhấn để mở Mini Chat với ${friend.displayName}`}
      >
        <Avatar name={friend.displayName} url={friend.avatarUrl} size={36} />
        <span
          aria-hidden="true"
          className={`${styles.statusDot} ${friend.online ? styles.statusOnline : ""}`}
        />
      </button>

      <div className={styles.info}>
        {/* CHỈ nhấn tên người dùng mới điều hướng sang trang cá nhân; chặn nổi bọt để không mở Mini Chat */}
        <Link
          href={friend.profileUrl}
          onClick={(e) => e.stopPropagation()}
          className={styles.nameLink}
          title={`Xem trang cá nhân của ${friend.displayName}`}
        >
          {friend.displayName}
        </Link>
        <span className={`${styles.statusText} ${friend.online ? styles.statusTextOnline : ""}`}>
          {openingId === friend.id
            ? "Đang mở Mini Chat…"
            : friend.online
              ? "Đang hoạt động"
              : formatLastSeen(friend.lastSeenAt)}
        </span>
      </div>

      <button
        type="button"
        disabled={openingId === friend.id}
        onClick={(e) => {
          e.stopPropagation();
          void handleChatIntent(friend);
        }}
        className={styles.chatBtn}
        aria-label={`Nhắn tin với ${friend.displayName}`}
        title={`Mở Mini Chat với ${friend.displayName}`}
      >
        <ChatBubbleIcon />
      </button>
    </li>
  );

  return (
    <section className={styles.card} aria-label="Bạn bè đang hoạt động">
      {/* Header thu gọn cho mobile/tablet (< 1100px) */}
      <button
        type="button"
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-expanded={mobileOpen}
        aria-controls="discovery-online-users"
        className={styles.headerBtn}
      >
        <span className={styles.titleRow}>
          <span
            aria-hidden="true"
            className={`${styles.liveDot} ${onlineCount === 0 ? styles.liveDotIdle : ""}`}
          />
          <span className={styles.title}>Người dùng đang hoạt động</span>
        </span>
        <span className={styles.mobileToggleMeta}>
          {loggedIn && <span className={styles.countPill}>{onlineCount} online</span>}
          <span aria-hidden="true">{mobileOpen ? "−" : "＋"}</span>
        </span>
      </button>

      {/* Header cố định cho desktop (>= 1100px) */}
      <div className={styles.headerDesktop}>
        <div className={styles.headerMain}>
          <div className={styles.titleRow}>
            <span
              aria-hidden="true"
              className={`${styles.liveDot} ${onlineCount === 0 ? styles.liveDotIdle : ""}`}
            />
            <h2 className={styles.title}>Bạn bè đang hoạt động</h2>
          </div>
          <p className={styles.subtitle}></p>
        </div>
        {loggedIn && (
          <span className={styles.countPill} aria-live="polite">
            {onlineCount} online
          </span>
        )}
      </div>

      <div
        id="discovery-online-users"
        className={`${styles.body} ${mobileOpen ? "" : styles.bodyCollapsed}`}
      >
        {!loggedIn ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3" />
                <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                <circle cx="16.5" cy="9.5" r="2.5" />
                <path d="M15.5 19h5a4 4 0 0 0-4-4" />
              </svg>
            </span>
            <p className={styles.emptyTitle}>Kết nối với bạn bè trực tuyến</p>
            <p className={styles.emptyText}>
              Đăng nhập để xem những bạn bè đang hoạt động trên Rivanda.
            </p>
            <Link href={loginHref} className={styles.emptyAction}>
              Đăng nhập ngay →
            </Link>
          </div>
        ) : users.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3" />
                <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
                <path d="M17 8v6M14 11h6" />
              </svg>
            </span>
            <p className={styles.emptyTitle}>Chưa có bạn bè</p>
            <p className={styles.emptyText}>
              Danh sách chỉ hiển thị thành viên khi cả hai cùng theo dõi nhau. Hãy khám phá và kết nối thêm thành viên mới.
            </p>
            <Link href="/discovery?tab=users" className={styles.emptyAction}>
              Tìm thành viên →
            </Link>
          </div>
        ) : (
          <>
            {chatNotice && (
              <div role="status" className={styles.chatNotice}>
                <span>{chatNotice}</span>
                <button
                  type="button"
                  onClick={() => setChatNotice("")}
                  aria-label="Đóng thông báo"
                  className={styles.noticeClose}
                >
                  ×
                </button>
              </div>
            )}

            <div className={styles.listScroll}>
              {onlineUsers.length > 0 && (
                <>
                  <div className={styles.groupLabel}>
                    <span>Đang trực tuyến</span>
                    <span>{onlineUsers.length}</span>
                  </div>
                  <ul className={styles.list}>{onlineUsers.map(renderFriendRow)}</ul>
                </>
              )}

              {offlineUsers.length > 0 && (
                <>
                  <div className={styles.groupLabel}>
                    <span>Ngoại tuyến</span>
                    <span>{offlineUsers.length}</span>
                  </div>
                  <ul className={styles.list}>{offlineUsers.map(renderFriendRow)}</ul>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
