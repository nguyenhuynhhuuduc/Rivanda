"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/kit";
import { subscribeChatEvents } from "@/components/messages/realtime-client";
import { readNotificationAction } from "@/app/(light)/account/notifications/actions";
import styles from "./NotificationBell.module.css";

type DropdownNotification = {
  id: string;
  type: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  actorName: string | null;
  actorAvatar: string | null;
};

type FeedResponse = {
  items: DropdownNotification[];
  unread: number;
  ready: boolean;
  error?: string;
};

const DROPDOWN_LIMIT = 7;

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(diffSec)) return "";
  if (diffSec < 45) return "Vừa xong";
  if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)} ngày trước`;
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatExactTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sourceLabel(item: DropdownNotification): string {
  if (item.actorName) return item.actorName;
  if (item.type === "message") return "Tin nhắn mới";
  if (item.type === "moderation") return "Kiểm duyệt Rivanda";
  if (item.type.includes("follow")) return "Kết nối thành viên";
  if (item.type.includes("comment") || item.type.includes("reply")) return "Bình luận";
  return "Hệ thống Rivanda";
}

function TypeGlyph({ type, size = 14 }: { type: string; size?: number }) {
  if (type === "message") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17.5 3.5 21l3.9-1.2A8.5 8.5 0 1 0 5 17.5Z" />
        <path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01" strokeWidth="2.4" />
      </svg>
    );
  }
  if (type.includes("like")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
        <path d="M12 20.4 4.8 13.6a4.7 4.7 0 0 1 6.7-6.6L12 7.5l.5-.5a4.7 4.7 0 0 1 6.7 6.6L12 20.4Z" />
      </svg>
    );
  }
  if (type.includes("follow")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9.5" cy="7.5" r="3.2" />
        <path d="M3.5 19a6 6 0 0 1 12 0M18.5 8v6M15.5 11h6" />
      </svg>
    );
  }
  if (type.includes("comment") || type.includes("reply")) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17.5 3.5 21l3.9-1.2A8.5 8.5 0 1 0 5 17.5Z" />
      </svg>
    );
  }
  if (type === "moderation") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 5 6v6c0 4.6 3 7.8 7 9 4-1.2 7-4.4 7-9V6l-7-3Z" />
        <path d="m9.5 12.2 1.8 1.8 3.5-3.6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15z" />
      <path d="M10 21h4" />
    </svg>
  );
}

export function NotificationBell({ unread, userId }: { unread: number; userId?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const feedAbortRef = useRef<AbortController | null>(null);

  const [count, setCount] = useState(unread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DropdownNotification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  // Đồng bộ badge khi server prop thay đổi (vd: sau revalidatePath hoặc đổi tài khoản)
  useEffect(() => {
    setCount(unread);
  }, [unread, userId]);

  // Xóa cache dropdown nếu đổi tài khoản
  useEffect(() => {
    setItems(null);
    setError("");
    setActionError("");
    setOpen(false);
  }, [userId]);

  // Tự đóng dropdown khi điều hướng sang route khác
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Đồng bộ badge thông báo ngay lập tức khi có tin nhắn mới hoặc đã đọc tin nhắn qua kênh realtime
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    const syncBell = async () => {
      try {
        const res = await fetch("/api/discovery/notifications/unread", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: unknown };
        if (!stopped && Number.isSafeInteger(data.unread) && (data.unread as number) >= 0) {
          setCount(data.unread as number);
        }
      } catch {
        // Bỏ qua lỗi mạng tạm thời
      }
    };
    const unsub = subscribeChatEvents((event) => {
      if (
        (event.type === "message:new" && event.message.senderId !== userId) ||
        (event.type === "message:read" && event.byUserId === userId)
      ) {
        void syncBell();
      }
    });
    return () => {
      stopped = true;
      unsub();
    };
  }, [userId]);

  // Polling số lượng chưa đọc định kỳ (giữ nguyên cơ chế hiện tại)
  useEffect(() => {
    let controller: AbortController | null = null;
    let last = Date.now();
    let stopped = false;

    const refreshUnread = async () => {
      if (stopped || document.visibilityState !== "visible" || controller || Date.now() - last < 30000) return;
      last = Date.now();
      const current = new AbortController();
      controller = current;
      const timeout = setTimeout(() => current.abort(), 10000);
      try {
        const response = await fetch("/api/discovery/notifications/unread", {
          cache: "no-store",
          credentials: "same-origin",
          signal: current.signal,
        });
        if (response.status === 401) {
          if (!stopped) setCount(0);
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped && Number.isSafeInteger(data.unread) && data.unread >= 0) {
          setCount(data.unread);
        }
      } catch {
        // Giữ nguyên badge gần nhất khi mạng gián đoạn tạm thời
      } finally {
        clearTimeout(timeout);
        if (controller === current) controller = null;
      }
    };

    const timer = setInterval(() => void refreshUnread(), 90000);
    const onFocus = () => void refreshUnread();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      controller?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [userId]);

  const fetchLatest = useCallback(async (showSpinner: boolean) => {
    feedAbortRef.current?.abort();
    const controller = new AbortController();
    feedAbortRef.current = controller;
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/discovery/notifications?limit=${DROPDOWN_LIMIT}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const data = (await response.json()) as FeedResponse;
      if (response.status === 401) {
        setCount(0);
        setItems([]);
        setError(data.error || "Phiên đăng nhập đã hết hạn.");
        return;
      }
      if (!response.ok) {
        throw new Error(data.error || "Chưa tải được thông báo. Vui lòng thử lại.");
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      if (Number.isSafeInteger(data.unread) && data.unread >= 0) {
        setCount(data.unread);
      }
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Chưa tải được thông báo. Vui lòng thử lại.");
    } finally {
      if (feedAbortRef.current === controller) {
        feedAbortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => feedAbortRef.current?.abort(), []);

  // Click ngoài hoặc nhấn ESC để đóng popup (giữ nguyên danh sách đã tải)
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleToggle() {
    setActionError("");
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        void fetchLatest(items === null);
      }
      return next;
    });
  }

  async function handleItemClick(item: DropdownNotification) {
    setActionError("");
    const wasUnread = !item.isRead;
    if (wasUnread) {
      setItems((prev) => (prev ? prev.map((x) => (x.id === item.id ? { ...x, isRead: true } : x)) : prev));
      setCount((c) => Math.max(0, c - 1));
    }

    const markPromise = wasUnread
      ? (() => {
          const fd = new FormData();
          fd.set("operation", "one");
          fd.set("id", item.id);
          return readNotificationAction({}, fd);
        })()
      : null;

    if (item.link) {
      setOpen(false);
      if (markPromise) {
        void markPromise.then((res) => {
          if (res.error) {
            setItems((prev) => (prev ? prev.map((x) => (x.id === item.id ? { ...x, isRead: false } : x)) : prev));
            setCount((c) => c + 1);
          }
        });
      }
      router.push(item.link);
      return;
    }

    if (markPromise) {
      const res = await markPromise;
      if (res.error) {
        setItems((prev) => (prev ? prev.map((x) => (x.id === item.id ? { ...x, isRead: false } : x)) : prev));
        setCount((c) => c + 1);
        setActionError(res.error);
      }
    }
  }

  async function handleMarkAllRead() {
    if (markingAll || count <= 0) return;
    setActionError("");
    setMarkingAll(true);
    const prevItems = items;
    const prevCount = count;

    setItems((prev) => (prev ? prev.map((x) => ({ ...x, isRead: true })) : prev));
    setCount(0);

    try {
      const fd = new FormData();
      fd.set("operation", "all");
      const res = await readNotificationAction({}, fd);
      if (res.error) {
        setItems(prevItems);
        setCount(prevCount);
        setActionError(res.error);
      }
    } catch {
      setItems(prevItems);
      setCount(prevCount);
      setActionError("Chưa cập nhật được thông báo. Vui lòng thử lại.");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="navbar-notifications-panel"
        aria-label={`Thông báo${count ? `, ${count} chưa đọc` : ", không có thông báo chưa đọc"}`}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15z" />
          <path d="M10 21h4" />
        </svg>
        {count > 0 && (
          <span aria-hidden="true" className={styles.badge}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          id="navbar-notifications-panel"
          role="dialog"
          aria-label="Thông báo gần đây"
          className={styles.panel}
        >
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <h2 className={styles.title}>Thông báo</h2>
              {count > 0 && <span className={styles.unreadPill}>{count} chưa đọc</span>}
            </div>
            {count > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className={styles.markAllBtn}
              >
                {markingAll ? "Đang xử lý…" : "Đánh dấu đã đọc"}
              </button>
            )}
          </div>

          <div className={styles.listWrap}>
            {actionError && (
              <p role="alert" className={styles.inlineAlert}>
                {actionError}
              </p>
            )}

            {loading && items === null && (
              <div className={styles.loadingList} aria-busy="true">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className={styles.skeletonRow}>
                    <div className={`${styles.skeleton} h-9 w-9 shrink-0 rounded-full`} />
                    <div className="flex-1 space-y-1.5">
                      <div className={`${styles.skeleton} h-3 w-1/3`} />
                      <div className={`${styles.skeleton} h-3.5 w-11/12`} />
                      <div className={`${styles.skeleton} h-2.5 w-1/4`} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {error && items === null && (
              <div className={styles.stateBox} role="alert">
                <p className={styles.stateTitle}>Chưa tải được thông báo</p>
                <p className={styles.stateText}>{error}</p>
                <button type="button" onClick={() => void fetchLatest(true)} className={styles.retryBtn}>
                  Thử lại
                </button>
              </div>
            )}

            {items !== null && items.length === 0 && (
              <div className={styles.stateBox}>
                <span className={styles.stateIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15z" />
                    <path d="M10 21h4" />
                  </svg>
                </span>
                <p className={styles.stateTitle}>Chưa có thông báo nào</p>
                <p className={styles.stateText}>
                  Những tương tác mới trên Discovery hoặc cập nhật tài khoản sẽ hiển thị tại đây.
                </p>
              </div>
            )}

            {items !== null && items.length > 0 && (
              <ul className={styles.list}>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void handleItemClick(item)}
                      className={`${styles.itemBtn} ${item.isRead ? styles.itemRead : styles.itemUnread}`}
                    >
                      <span className={styles.avatarWrap} aria-hidden="true">
                        {item.actorName ? (
                          <>
                            <Avatar name={item.actorName} url={item.actorAvatar} size={38} />
                            <span className={styles.typeMini}>
                              <TypeGlyph type={item.type} size={10} />
                            </span>
                          </>
                        ) : (
                          <span className={styles.typeIconBox}>
                            <TypeGlyph type={item.type} size={17} />
                          </span>
                        )}
                      </span>

                      <span className={styles.body}>
                        <span className={styles.source}>{sourceLabel(item)}</span>
                        <span className={styles.message}>{item.message}</span>
                        <span className={styles.meta}>
                          <time dateTime={item.createdAt} title={formatExactTime(item.createdAt)}>
                            {formatRelativeTime(item.createdAt)}
                          </time>
                          <span aria-hidden="true">·</span>
                          <span className={!item.isRead ? styles.statusUnread : undefined}>
                            {item.isRead ? "Đã đọc" : "Chưa đọc"}
                          </span>
                        </span>
                      </span>

                      <span className={styles.dotWrap} aria-hidden="true">
                        {!item.isRead && <span className={styles.dot} />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/account/notifications"
            onClick={() => setOpen(false)}
            className={styles.footer}
          >
            <span>Xem tất cả thông báo</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </div>
  );
}
