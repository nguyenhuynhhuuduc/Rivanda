"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/kit";
import type { ChatMessageDTO, ChatRealtimeEvent } from "@/lib/chat/realtime";
import type { ConversationPeer } from "@/lib/chat/store";
import { subscribeChatEvents } from "./realtime-client";
import styles from "./MiniChat.module.css";

type LocalMsg = ChatMessageDTO & {
  pending?: boolean;
  failed?: boolean;
  localPreviewUrl?: string | null;
  retryFile?: File | null;
};

const QUICK_EMOJIS = [
  "😀", "😄", "😊", "🥰", "😍", "🤩", "😎", "🤔",
  "😂", "🥹", "😅", "🙏", "👍", "👏", "🔥", "✨",
  "❤️", "💛", "🎉", "🌟", "☕", "📸", "🌍", "✈️",
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeClientMsgId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `mc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const MiniChatWindow = memo(function MiniChatWindow({
  currentUserId,
  conversationId,
  peer,
  canSend,
  focusTick,
  initialDraft = "",
  onDraftPersist,
  onMinimize,
  onClose,
  onReadClear,
}: {
  currentUserId: string;
  conversationId: string;
  peer: ConversationPeer;
  canSend: boolean;
  focusTick: number;
  initialDraft?: string;
  onDraftPersist: (conversationId: string, value: string) => void;
  onMinimize: (conversationId: string) => void;
  onClose: (conversationId: string) => void;
  onReadClear: (conversationId: string) => void;
}) {
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [draft, setDraft] = useState(initialDraft);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState("");
  const [typingName, setTypingName] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const stopTypingRef = useRef<number | null>(null);
  const onReadClearRef = useRef(onReadClear);
  const readInFlightRef = useRef(false);

  useEffect(() => {
    onReadClearRef.current = onReadClear;
  }, [onReadClear]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const markRead = useCallback(async () => {
    if (readInFlightRef.current) return;
    readInFlightRef.current = true;
    try {
      await fetch(`/api/messages/conversations/${conversationId}/read`, {
        method: "POST",
        credentials: "same-origin",
      });
      onReadClearRef.current(conversationId);
    } catch {
      // Bỏ qua lỗi mạng tạm thời
    } finally {
      readInFlightRef.current = false;
    }
  }, [conversationId]);

  // Tải lịch sử tin nhắn ĐÚNG 1 LẦN theo conversationId (không bao giờ phụ thuộc callback thay đổi)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const res = await fetch(`/api/messages/conversations/${conversationId}/messages?limit=30`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = (await res.json()) as {
          messages?: ChatMessageDTO[];
          nextBefore?: string | null;
          hasMore?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Chưa tải được lịch sử tin nhắn.");
          return;
        }
        const loaded = data.messages ?? [];
        setMessages(loaded);
        setNextBefore(data.nextBefore ?? null);
        setHasMore(Boolean(data.hasMore));
        // Chỉ gọi markRead nếu thực sự có tin nhắn chưa đọc từ đối phương
        if (loaded.some((m) => m.senderId !== currentUserId && !m.readAt)) {
          void markRead();
        }
        window.requestAnimationFrame(() => scrollToBottom(false));
      } catch {
        if (!cancelled) setError("Không thể kết nối máy chủ.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, currentUserId, markRead, scrollToBottom]);

  // Chỉ focus ô nhập khi focusTick thực sự thay đổi (người dùng chủ động mở/chọn cửa sổ)
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusTick]);

  // Thu hồi object URL khi đổi/xóa ảnh preview
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Đóng emoji popover bằng click ngoài / ESC
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  // Đồng bộ sự kiện realtime từ SSE hub dùng chung — chỉ cập nhật state khi dữ liệu thực sự thay đổi
  useEffect(() => {
    const unsub = subscribeChatEvents((event: ChatRealtimeEvent) => {
      if (event.type === "typing:start" && event.conversationId === conversationId) {
        setTypingName((prev) => (prev === event.displayName ? prev : event.displayName));
        if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = window.setTimeout(() => setTypingName(null), 6000);
        return;
      }
      if (event.type === "typing:stop" && event.conversationId === conversationId) {
        setTypingName((prev) => (prev === null ? prev : null));
        if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
        return;
      }
      if (event.type === "message:delivered" && event.conversationId === conversationId) {
        const set = new Set(event.messageIds);
        setMessages((prev) => {
          let changed = false;
          const next = prev.map((m) => {
            if (!set.has(m.id) || m.deliveredAt) return m;
            changed = true;
            return { ...m, deliveredAt: event.deliveredAt };
          });
          return changed ? next : prev;
        });
        return;
      }
      if (
        event.type === "message:read" &&
        event.conversationId === conversationId &&
        event.byUserId !== currentUserId
      ) {
        setMessages((prev) => {
          let changed = false;
          const next = prev.map((m) => {
            if (m.senderId !== currentUserId || m.readAt) return m;
            changed = true;
            return {
              ...m,
              deliveredAt: m.deliveredAt ?? event.readAt,
              readAt: event.readAt,
            };
          });
          return changed ? next : prev;
        });
        return;
      }
      if (event.type === "message:new" && event.conversationId === conversationId) {
        const incoming = event.message;
        const isMine = incoming.senderId === currentUserId;
        if (!isMine) setTypingName((prev) => (prev === null ? prev : null));
        const nearBottom = isNearBottom();
        let inserted = false;
        setMessages((prev) => {
          const idx = prev.findIndex(
            (m) =>
              m.id === incoming.id ||
              (incoming.clientMsgId && m.clientMsgId === incoming.clientMsgId),
          );
          if (idx >= 0) {
            const existing = prev[idx];
            if (!existing.pending && !existing.failed && existing.id === incoming.id) {
              return prev;
            }
            const copy = [...prev];
            if (existing.localPreviewUrl) URL.revokeObjectURL(existing.localPreviewUrl);
            copy[idx] = { ...incoming, pending: false, failed: false };
            return copy;
          }
          inserted = true;
          return [...prev, incoming];
        });
        if (inserted && (isMine || nearBottom)) {
          window.requestAnimationFrame(() => scrollToBottom(true));
        }
        if (!isMine && document.visibilityState === "visible") {
          void markRead();
        }
      }
    });
    return () => {
      unsub();
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (stopTypingRef.current) window.clearTimeout(stopTypingRef.current);
    };
  }, [conversationId, currentUserId, isNearBottom, markRead, scrollToBottom]);

  const emitTyping = useCallback(
    (typing: boolean) => {
      void fetch(`/api/messages/conversations/${conversationId}/typing`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing }),
      }).catch(() => {});
    },
    [conversationId],
  );

  function handleDraftChange(val: string) {
    setDraft(val);
    onDraftPersist(conversationId, val);
    if (error) setError("");
    const now = Date.now();
    if (val.trim()) {
      if (now - lastTypingSentRef.current > 2500) {
        lastTypingSentRef.current = now;
        emitTyping(true);
      }
      if (stopTypingRef.current) window.clearTimeout(stopTypingRef.current);
      stopTypingRef.current = window.setTimeout(() => {
        emitTyping(false);
        lastTypingSentRef.current = 0;
      }, 3000);
    } else {
      if (stopTypingRef.current) window.clearTimeout(stopTypingRef.current);
      emitTyping(false);
      lastTypingSentRef.current = 0;
    }
  }

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(picked.type)) {
      setError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
      e.target.value = "";
      return;
    }
    if (picked.size > 5 * 1024 * 1024) {
      setError("Ảnh tối đa 5MB.");
      e.target.value = "";
      return;
    }
    setError("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  }

  async function loadOlder() {
    if (!nextBefore || loadingOlder) return;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/messages/conversations/${conversationId}/messages?before=${encodeURIComponent(nextBefore)}&limit=30`,
        { cache: "no-store", credentials: "same-origin" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages?: ChatMessageDTO[];
        nextBefore?: string | null;
        hasMore?: boolean;
      };
      const older = data.messages ?? [];
      if (older.length) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !seen.has(m.id)), ...prev];
        });
      }
      setNextBefore(data.nextBefore ?? null);
      setHasMore(Boolean(data.hasMore));
      window.requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function dispatch(opts: {
    body: string;
    attachFile: File | null;
    clientMsgId: string;
    existingTempId?: string;
  }) {
    const { body, attachFile, clientMsgId, existingTempId } = opts;
    const tempId = existingTempId ?? `temp-${clientMsgId}`;
    const localUrl = attachFile ? URL.createObjectURL(attachFile) : null;

    const optimistic: LocalMsg = {
      id: tempId,
      conversationId,
      senderId: currentUserId,
      clientMsgId,
      body,
      attachments: localUrl
        ? [{ id: tempId, url: localUrl, mimeType: "image/webp", fileSize: attachFile?.size ?? 0, width: null, height: null }]
        : [],
      deliveredAt: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
      failed: false,
      localPreviewUrl: localUrl,
      retryFile: attachFile,
    };

    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === tempId || m.clientMsgId === clientMsgId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = optimistic;
        return copy;
      }
      return [...prev, optimistic];
    });
    window.requestAnimationFrame(() => scrollToBottom(true));

    try {
      let res: Response;
      if (attachFile) {
        const fd = new FormData();
        fd.set("body", body);
        fd.set("clientMsgId", clientMsgId);
        fd.set("image", attachFile);
        res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        });
      } else {
        res = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ body, clientMsgId }),
        });
      }

      const data = (await res.json()) as { message?: ChatMessageDTO; error?: string };
      if (!res.ok || !data.message) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId || m.clientMsgId === clientMsgId ? { ...m, pending: false, failed: true } : m)),
        );
        setError(data.error || "Chưa gửi được tin nhắn.");
        return;
      }

      const saved = data.message;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === tempId || m.clientMsgId === clientMsgId) {
            if (m.localPreviewUrl) URL.revokeObjectURL(m.localPreviewUrl);
            return { ...saved, pending: false, failed: false };
          }
          return m;
        }),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId || m.clientMsgId === clientMsgId ? { ...m, pending: false, failed: true } : m)),
      );
      setError("Mất kết nối. Nhấn Thử lại để gửi tiếp.");
    }
  }

  async function handleSend() {
    if (!canSend) return;
    const trimmed = draft.trim();
    const attach = file;
    if (!trimmed && !attach) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("Bạn đang ngoại tuyến. Nội dung đang soạn vẫn được giữ lại.");
      return;
    }

    setError("");
    setEmojiOpen(false);
    setDraft("");
    onDraftPersist(conversationId, "");
    clearImage();
    if (stopTypingRef.current) window.clearTimeout(stopTypingRef.current);
    emitTyping(false);
    lastTypingSentRef.current = 0;

    await dispatch({
      body: trimmed,
      attachFile: attach,
      clientMsgId: makeClientMsgId(),
    });
    inputRef.current?.focus();
  }

  return (
    <section
      className={styles.window}
      aria-label={`Trò chuyện nhanh với ${peer.displayName}`}
    >
      <header className={styles.header}>
        <div className={styles.headerPeer}>
          <span className={styles.avatarBox}>
            <Avatar name={peer.displayName} url={peer.avatarUrl} size={34} />
            <span
              aria-hidden="true"
              className={`${styles.statusDot} ${peer.online ? styles.statusOnline : ""}`}
            />
          </span>
          <div className={styles.peerMeta}>
            <Link href={peer.profileUrl} className={styles.peerName}>
              {peer.displayName}
            </Link>
            <span
              className={`${styles.peerSub} ${
                typingName
                  ? styles.peerSubTyping
                  : peer.online
                    ? styles.peerSubOnline
                    : ""
              }`}
            >
              {typingName
                ? "Đang nhập…"
                : peer.online
                  ? "Đang hoạt động"
                  : "Ngoại tuyến"}
            </span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <Link
            href={`/messages?c=${encodeURIComponent(conversationId)}`}
            className={styles.hdrBtn}
            title="Mở trong trang Tin nhắn đầy đủ"
            aria-label="Mở trong trang Tin nhắn đầy đủ"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={() => onMinimize(conversationId)}
            className={styles.hdrBtn}
            title="Thu nhỏ"
            aria-label={`Thu nhỏ cửa sổ chat với ${peer.displayName}`}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => onClose(conversationId)}
            className={styles.hdrBtn}
            title="Đóng"
            aria-label={`Đóng cửa sổ chat với ${peer.displayName}`}
          >
            ×
          </button>
        </div>
      </header>

      <div ref={scrollRef} className={styles.messages}>
        {hasMore && (
          <button
            type="button"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            className={styles.loadOlderBtn}
          >
            {loadingOlder ? "Đang tải…" : "Xem tin nhắn cũ hơn"}
          </button>
        )}

        {loading && (
          <p className="my-auto text-center text-xs text-muted">Đang tải lịch sử…</p>
        )}

        {!loading && messages.length === 0 && (
          <p className="my-auto px-4 text-center text-xs leading-relaxed text-muted">
            Bắt đầu cuộc trò chuyện cùng <strong className="text-fg">{peer.displayName}</strong>.
          </p>
        )}

        {messages.map((m) => {
          const isMine = m.senderId === currentUserId;
          const statusLabel = m.pending
            ? "Đang gửi…"
            : m.failed
              ? "Lỗi"
              : m.readAt
                ? "Đã xem"
                : m.deliveredAt
                  ? "Đã nhận"
                  : "Đã gửi";

          return (
            <div
              key={m.id}
              className={`${styles.msgRow} ${isMine ? styles.msgMine : styles.msgPeer}`}
            >
              {!isMine && <Avatar name={peer.displayName} url={peer.avatarUrl} size={24} />}
              <div className={styles.msgCol}>
                {m.attachments.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setLightboxUrl(att.url)}
                    className={styles.attachImgBtn}
                    aria-label="Xem ảnh lớn"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={att.url} alt="" className={styles.attachImg} />
                  </button>
                ))}
                {m.body && (
                  <div
                    className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubblePeer} ${
                      m.failed ? styles.bubbleFailed : ""
                    }`}
                  >
                    {m.body}
                  </div>
                )}
                <div className={styles.msgMeta}>
                  <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
                  {isMine && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{statusLabel}</span>
                      {m.failed && m.clientMsgId && (
                        <button
                          type="button"
                          onClick={() =>
                            void dispatch({
                              body: m.body,
                              attachFile: m.retryFile ?? null,
                              clientMsgId: m.clientMsgId!,
                              existingTempId: m.id,
                            })
                          }
                          className={styles.retryBtn}
                        >
                          Thử lại
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {typingName && (
          <div className={styles.typingRow} aria-live="polite">
            <span className={styles.typingDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>{typingName} đang nhập…</span>
          </div>
        )}
      </div>

      <div className={styles.composer}>
        {!canSend ? (
          <p className="py-1 text-center text-xs text-muted">
            Cần follow hai chiều để gửi tin nhắn mới.
          </p>
        ) : (
          <>
            {error && (
              <p role="alert" className={styles.errorLine}>
                {error}
              </p>
            )}

            {previewUrl && file && (
              <div className={styles.previewBar}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="" className={styles.previewThumb} />
                <span className="min-w-0 flex-1 truncate text-xs text-fg">{file.name}</span>
                <button
                  type="button"
                  onClick={clearImage}
                  aria-label="Bỏ ảnh"
                  className="text-xs text-muted hover:text-fg"
                >
                  ×
                </button>
              </div>
            )}

            {emojiOpen && (
              <div ref={emojiRef} className={styles.emojiPopover} role="dialog" aria-label="Emoji">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      handleDraftChange(draft + em);
                      inputRef.current?.focus();
                    }}
                    className={styles.emojiCell}
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.composerRow}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePickImage}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Gửi ảnh"
                title="Gửi ảnh (JPG, PNG, WebP ≤ 5MB)"
                className={styles.toolBtn}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2.5" />
                  <circle cx="8.5" cy="9.5" r="1.5" />
                  <path d="m21 15-4.5-4.5L7 20" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setEmojiOpen((v) => !v)}
                aria-label="Emoji"
                className={styles.toolBtn}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2" />
                  <circle cx="9" cy="10" r=".8" fill="currentColor" />
                  <circle cx="15" cy="10" r=".8" fill="currentColor" />
                </svg>
              </button>

              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                maxLength={4000}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Nhắn tin…"
                aria-label={`Nhập tin nhắn cho ${peer.displayName}`}
                className={styles.textarea}
              />

              <button
                type="button"
                disabled={!draft.trim() && !file}
                onClick={() => void handleSend()}
                aria-label="Gửi tin nhắn"
                className={styles.sendBtn}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M22 2 11 13" />
                  <path d="m22 2-7 20-4-9-9-4 20-7Z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className={styles.lightbox}
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            className={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
});
