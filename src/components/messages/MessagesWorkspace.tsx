"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/kit";
import type { ChatMessageDTO, ChatRealtimeEvent } from "@/lib/chat/realtime";
import type { ConversationSummary } from "@/lib/chat/store";
import type { MutualPresenceUser } from "@/lib/discovery-community/presence";
import {
  reconnectChatStream,
  subscribeChatConnection,
  subscribeChatEvents,
  type ConnectionState,
} from "./realtime-client";
import styles from "./Messages.module.css";

type LocalMessage = ChatMessageDTO & {
  pending?: boolean;
  failed?: boolean;
  localPreviewUrl?: string | null;
  retryFile?: File | null;
};

const EMOJIS = [
  "😀", "😄", "😊", "🥰", "😍", "🤩", "😎", "🤔",
  "😂", "🥹", "😅", "🙏", "👍", "👏", "🔥", "✨",
  "❤️", "💛", "🎉", "🌟", "☕", "📸", "🌍", "✈️",
  "🏔️", "🌅", "🎵", "💡", "💻", "🛡️", "🤝", "👋",
];

function formatShortTime(iso: string): string {
  const date = new Date(iso);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(diffSec)) return "";
  if (diffSec < 60) return "Vừa xong";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}p`;
  if (diffSec < 86400) {
    return date.toLocaleTimeString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Ngoại tuyến";
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(diffSec) || diffSec < 90) return "Vừa ngoại tuyến";
  if (diffSec < 3600) return `Hoạt động ${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `Hoạt động ${Math.floor(diffSec / 3600)} giờ trước`;
  return "Ngoại tuyến";
}

function makeClientMsgId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function MessagesWorkspace({
  currentUserId,
  initialConversations,
  initialMutualFriends,
  initialActiveId,
  initialMessages,
  initialNextBefore,
  initialHasMore,
  initialOpenError,
}: {
  currentUserId: string;
  initialConversations: ConversationSummary[];
  initialMutualFriends: MutualPresenceUser[];
  initialActiveId: string | null;
  initialMessages: ChatMessageDTO[];
  initialNextBefore: string | null;
  initialHasMore: boolean;
  initialOpenError?: string;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
  const [mutualFriends, setMutualFriends] = useState<MutualPresenceUser[]>(initialMutualFriends);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [search, setSearch] = useState("");
  const [connState, setConnState] = useState<ConnectionState>("connecting");

  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages);
  const [nextBefore, setNextBefore] = useState<string | null>(initialNextBefore);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Giữ bản nháp theo từng hội thoại để không bao giờ mất nội dung đang soạn khi mất kết nối hoặc đổi phòng
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [composerError, setComposerError] = useState(initialOpenError ?? "");
  const [startingPeerId, setStartingPeerId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Trạng thái đang nhập theo từng conversationId
  const [typingByConv, setTypingByConv] = useState<Record<string, string>>({});
  const [showJumpNew, setShowJumpNew] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(activeId);
  const typingTimerRef = useRef<Record<string, number>>({});
  const lastTypingSentRef = useRef<number>(0);
  const stopTypingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  const currentDraft = activeId ? (drafts[activeId] ?? "") : "";

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setShowJumpNew(false);
  }, []);

  // Tự cuộn xuống cuối khi mở hội thoại lần đầu
  useEffect(() => {
    if (!activeId) return;
    const frame = window.requestAnimationFrame(() => scrollToBottom(false));
    return () => window.cancelAnimationFrame(frame);
  }, [activeId, scrollToBottom]);

  // Thu hồi object URL của ảnh preview chọn gửi
  useEffect(() => {
    return () => {
      if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
    };
  }, [selectedPreviewUrl]);

  // Đóng emoji popover khi nhấn ESC hoặc click ngoài
  useEffect(() => {
    if (!emojiOpen) return;
    function onDown(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEmojiOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  // Đóng lightbox bằng ESC
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  const notifyRead = useCallback(async (convId: string) => {
    try {
      await fetch(`/api/messages/conversations/${convId}/read`, {
        method: "POST",
        credentials: "same-origin",
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)),
      );
    } catch {
      // Bỏ qua nếu mạng gián đoạn tạm thời
    }
  }, []);

  const notifyDelivered = useCallback(async (convId: string) => {
    try {
      await fetch(`/api/messages/conversations/${convId}/delivered`, {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Bỏ qua
    }
  }, []);

  const refreshConversationsList = useCallback(async () => {
    try {
      const res = await fetch("/api/messages/conversations", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { conversations?: ConversationSummary[] };
      if (Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      }
    } catch {
      // Giữ danh sách hiện tại
    }
  }, []);

  const openConversation = useCallback(
    async (convId: string) => {
      setActiveId(convId);
      setComposerError("");
      setEmojiOpen(false);
      setShowJumpNew(false);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `/messages?c=${encodeURIComponent(convId)}`);
      }
      setLoadingHistory(true);
      try {
        const res = await fetch(`/api/messages/conversations/${convId}/messages?limit=30`, {
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = (await res.json()) as {
          messages?: ChatMessageDTO[];
          nextBefore?: string | null;
          hasMore?: boolean;
          error?: string;
        };
        if (!res.ok) {
          setComposerError(data.error || "Chưa tải được lịch sử tin nhắn.");
          return;
        }
        setMessages(data.messages ?? []);
        setNextBefore(data.nextBefore ?? null);
        setHasMore(Boolean(data.hasMore));
        void notifyRead(convId);
        window.requestAnimationFrame(() => scrollToBottom(false));
      } catch {
        setComposerError("Mất kết nối khi tải lịch sử tin nhắn.");
      } finally {
        setLoadingHistory(false);
      }
    },
    [notifyRead, scrollToBottom],
  );

  // Đánh dấu đã đọc ngay cho hội thoại mở sẵn từ SSR
  useEffect(() => {
    if (initialActiveId) {
      void notifyRead(initialActiveId);
    }
  }, [initialActiveId, notifyRead]);

  // Đăng ký kênh realtime SSE thống nhất (message:new, delivered, read, typing, presence)
  useEffect(() => {
    const unsubState = subscribeChatConnection((next) => {
      setConnState((prev) => {
        if ((prev === "reconnecting" || prev === "disconnected") && next === "connected") {
          void refreshConversationsList();
          if (activeIdRef.current) {
            void openConversation(activeIdRef.current);
          }
        }
        return next;
      });
    });

    const unsubEvents = subscribeChatEvents((event: ChatRealtimeEvent) => {
      if (event.type === "presence:online" || event.type === "presence:offline") {
        const online = event.type === "presence:online";
        const target = event.userId.toLowerCase();
        setConversations((prev) =>
          prev.map((c) =>
            c.peer.id.toLowerCase() === target
              ? { ...c, peer: { ...c.peer, online, lastSeenAt: event.lastSeenAt } }
              : c,
          ),
        );
        setMutualFriends((prev) =>
          prev.map((f) =>
            f.id.toLowerCase() === target
              ? { ...f, online, lastSeenAt: event.lastSeenAt }
              : f,
          ),
        );
        return;
      }

      if (event.type === "typing:start") {
        const convId = event.conversationId;
        setTypingByConv((prev) => ({ ...prev, [convId]: event.displayName }));
        if (typingTimerRef.current[convId]) {
          window.clearTimeout(typingTimerRef.current[convId]);
        }
        typingTimerRef.current[convId] = window.setTimeout(() => {
          setTypingByConv((prev) => {
            const copy = { ...prev };
            delete copy[convId];
            return copy;
          });
        }, 6000);
        return;
      }

      if (event.type === "typing:stop") {
        const convId = event.conversationId;
        if (typingTimerRef.current[convId]) {
          window.clearTimeout(typingTimerRef.current[convId]);
          delete typingTimerRef.current[convId];
        }
        setTypingByConv((prev) => {
          if (!(convId in prev)) return prev;
          const copy = { ...prev };
          delete copy[convId];
          return copy;
        });
        return;
      }

      if (event.type === "message:delivered") {
        if (activeIdRef.current === event.conversationId) {
          const idSet = new Set(event.messageIds);
          setMessages((prev) =>
            prev.map((m) =>
              idSet.has(m.id) ? { ...m, deliveredAt: m.deliveredAt ?? event.deliveredAt } : m,
            ),
          );
        }
        return;
      }

      if (event.type === "message:read") {
        if (activeIdRef.current === event.conversationId && event.byUserId !== currentUserId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.senderId === currentUserId
                ? {
                    ...m,
                    deliveredAt: m.deliveredAt ?? event.readAt,
                    readAt: m.readAt ?? event.readAt,
                  }
                : m,
            ),
          );
        }
        if (event.byUserId === currentUserId) {
          setConversations((prev) =>
            prev.map((c) => (c.id === event.conversationId ? { ...c, unreadCount: 0 } : c)),
          );
        }
        return;
      }

      if (event.type === "message:new") {
        const incoming = event.message;
        const isFromMe = incoming.senderId === currentUserId;
        const isViewing = activeIdRef.current === event.conversationId;

        // Xóa trạng thái đang nhập khi đối phương vừa gửi tin
        if (!isFromMe) {
          setTypingByConv((prev) => {
            if (!(event.conversationId in prev)) return prev;
            const copy = { ...prev };
            delete copy[event.conversationId];
            return copy;
          });
        }

        // Cập nhật danh sách hội thoại & đưa hội thoại mới nhất lên đầu
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === event.conversationId);
          if (!exists) {
            void refreshConversationsList();
            return prev;
          }
          const updated = prev.map((c) => {
            if (c.id !== event.conversationId) return c;
            return {
              ...c,
              unreadCount: isFromMe || isViewing ? 0 : c.unreadCount + 1,
              lastMessage: {
                id: incoming.id,
                senderId: incoming.senderId,
                body: incoming.body,
                hasAttachment: incoming.attachments.length > 0,
                createdAt: incoming.createdAt,
              },
              updatedAt: incoming.createdAt,
            };
          });
          updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          return updated;
        });

        if (isViewing) {
          const nearBottom = isNearBottom();
          setMessages((prev) => {
            // Tránh trùng nếu đã có theo id hoặc clientMsgId (tin lạc quan của chính mình)
            const idx = prev.findIndex(
              (m) =>
                m.id === incoming.id ||
                (incoming.clientMsgId && m.clientMsgId === incoming.clientMsgId),
            );
            if (idx >= 0) {
              const copy = [...prev];
              const old = copy[idx];
              if (old.localPreviewUrl) URL.revokeObjectURL(old.localPreviewUrl);
              copy[idx] = { ...incoming, pending: false, failed: false };
              return copy;
            }
            return [...prev, incoming];
          });

          if (isFromMe || nearBottom) {
            window.requestAnimationFrame(() => scrollToBottom(true));
          } else {
            setShowJumpNew(true);
          }

          if (!isFromMe && document.visibilityState === "visible") {
            void notifyRead(event.conversationId);
          } else if (!isFromMe) {
            void notifyDelivered(event.conversationId);
          }
        } else if (!isFromMe) {
          void notifyDelivered(event.conversationId);
        }
      }
    });

    return () => {
      unsubState();
      unsubEvents();
      for (const timer of Object.values(typingTimerRef.current)) {
        window.clearTimeout(timer);
      }
    };
  }, [
    currentUserId,
    isNearBottom,
    notifyDelivered,
    notifyRead,
    openConversation,
    refreshConversationsList,
    scrollToBottom,
  ]);

  async function startChatWithFriend(peerUserId: string) {
    if (startingPeerId) return;
    setStartingPeerId(peerUserId);
    setComposerError("");
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ peerUserId }),
      });
      const data = (await res.json()) as { conversation?: ConversationSummary; error?: string };
      if (!res.ok || !data.conversation) {
        setComposerError(data.error || "Chưa thể mở cuộc trò chuyện.");
        return;
      }
      const conv = data.conversation;
      setConversations((prev) => {
        const rest = prev.filter((c) => c.id !== conv.id);
        return [conv, ...rest];
      });
      await openConversation(conv.id);
    } catch {
      setComposerError("Không kết nối được máy chủ để tạo hội thoại.");
    } finally {
      setStartingPeerId(null);
    }
  }

  async function loadOlderMessages() {
    if (!activeId || !nextBefore || loadingOlder) return;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/messages/conversations/${activeId}/messages?before=${encodeURIComponent(nextBefore)}&limit=30`,
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
          const existingIds = new Set(prev.map((m) => m.id));
          return [...older.filter((m) => !existingIds.has(m.id)), ...prev];
        });
      }
      setNextBefore(data.nextBefore ?? null);
      setHasMore(Boolean(data.hasMore));
      window.requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = el.scrollHeight - prevHeight + prevTop;
        }
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  const sendTypingSignal = useCallback((convId: string, typing: boolean) => {
    void fetch(`/api/messages/conversations/${convId}/typing`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typing }),
    }).catch(() => {});
  }, []);

  function handleDraftChange(val: string) {
    if (!activeId) return;
    setDrafts((prev) => ({ ...prev, [activeId]: val }));
    if (composerError) setComposerError("");

    const now = Date.now();
    if (val.trim()) {
      if (now - lastTypingSentRef.current > 2500) {
        lastTypingSentRef.current = now;
        sendTypingSignal(activeId, true);
      }
      if (stopTypingTimerRef.current) window.clearTimeout(stopTypingTimerRef.current);
      stopTypingTimerRef.current = window.setTimeout(() => {
        sendTypingSignal(activeId, false);
        lastTypingSentRef.current = 0;
      }, 3200);
    } else {
      if (stopTypingTimerRef.current) window.clearTimeout(stopTypingTimerRef.current);
      sendTypingSignal(activeId, false);
      lastTypingSentRef.current = 0;
    }
  }

  function clearSelectedImage() {
    if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
    setSelectedFile(null);
    setSelectedPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setComposerError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setComposerError("Ảnh đính kèm tối đa 5MB.");
      e.target.value = "";
      return;
    }
    setComposerError("");
    if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
    setSelectedFile(file);
    setSelectedPreviewUrl(URL.createObjectURL(file));
  }

  async function dispatchMessage(opts: {
    convId: string;
    body: string;
    file: File | null;
    clientMsgId: string;
    existingOptimisticId?: string;
  }) {
    const { convId, body, file, clientMsgId, existingOptimisticId } = opts;
    const tempId = existingOptimisticId ?? `temp-${clientMsgId}`;
    const previewUrl = file ? URL.createObjectURL(file) : null;

    const optimistic: LocalMessage = {
      id: tempId,
      conversationId: convId,
      senderId: currentUserId,
      clientMsgId,
      body,
      attachments: previewUrl
        ? [{ id: tempId, url: previewUrl, mimeType: "image/webp", fileSize: file?.size ?? 0, width: null, height: null }]
        : [],
      deliveredAt: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
      failed: false,
      localPreviewUrl: previewUrl,
      retryFile: file,
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
      if (file) {
        const fd = new FormData();
        fd.set("body", body);
        fd.set("clientMsgId", clientMsgId);
        fd.set("image", file);
        res = await fetch(`/api/messages/conversations/${convId}/messages`, {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        });
      } else {
        res = await fetch(`/api/messages/conversations/${convId}/messages`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ body, clientMsgId }),
        });
      }

      const data = (await res.json()) as { message?: ChatMessageDTO; error?: string };
      if (!res.ok || !data.message) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId || m.clientMsgId === clientMsgId
              ? { ...m, pending: false, failed: true }
              : m,
          ),
        );
        setComposerError(data.error || "Chưa gửi được tin nhắn.");
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
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                lastMessage: {
                  id: saved.id,
                  senderId: saved.senderId,
                  body: saved.body,
                  hasAttachment: saved.attachments.length > 0,
                  createdAt: saved.createdAt,
                },
                updatedAt: saved.createdAt,
              }
            : c,
        );
        updated.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return updated;
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId || m.clientMsgId === clientMsgId
            ? { ...m, pending: false, failed: true }
            : m,
        ),
      );
      setComposerError("Mất kết nối. Nhấn Thử gửi lại trên tin nhắn hoặc kiểm tra mạng.");
    }
  }

  async function handleSend() {
    if (!activeConv || !activeConv.canSend) return;
    const trimmed = currentDraft.trim();
    const fileToSend = selectedFile;
    if (!trimmed && !fileToSend) return;

    const convId = activeConv.id;
    const clientMsgId = makeClientMsgId();

    // Nếu đang mất kết nối rõ ràng, giữ nguyên draft để không mất nội dung người dùng đang soạn
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setComposerError("Bạn đang ngoại tuyến. Nội dung đang soạn vẫn được giữ lại.");
      return;
    }

    setComposerError("");
    setEmojiOpen(false);
    setDrafts((prev) => ({ ...prev, [convId]: "" }));
    clearSelectedImage();
    if (stopTypingTimerRef.current) window.clearTimeout(stopTypingTimerRef.current);
    sendTypingSignal(convId, false);
    lastTypingSentRef.current = 0;

    await dispatchMessage({
      convId,
      body: trimmed,
      file: fileToSend,
      clientMsgId,
    });
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function insertEmoji(emoji: string) {
    if (!activeId) return;
    handleDraftChange(currentDraft + emoji);
    textareaRef.current?.focus();
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filteredConvs = useMemo(() => {
    if (!normalizedSearch) return conversations;
    return conversations.filter((c) => {
      const name = c.peer.displayName.toLowerCase();
      const preview = (c.lastMessage?.body ?? "").toLowerCase();
      return name.includes(normalizedSearch) || preview.includes(normalizedSearch);
    });
  }, [conversations, normalizedSearch]);

  const existingPeerIds = useMemo(
    () => new Set(conversations.map((c) => c.peer.id.toLowerCase())),
    [conversations],
  );

  const friendsWithoutConv = useMemo(() => {
    return mutualFriends.filter((f) => {
      if (existingPeerIds.has(f.id.toLowerCase())) return false;
      if (!normalizedSearch) return true;
      return f.displayName.toLowerCase().includes(normalizedSearch);
    });
  }, [mutualFriends, existingPeerIds, normalizedSearch]);

  const connLabel =
    connState === "connected"
      ? "Realtime"
      : connState === "reconnecting"
        ? "Đang kết nối lại…"
        : connState === "connecting"
          ? "Đang kết nối…"
          : "Mất kết nối";

  const connClass =
    connState === "connected"
      ? styles.connConnected
      : connState === "reconnecting" || connState === "connecting"
        ? styles.connReconnecting
        : styles.connDisconnected;

  const activeTypingName = activeId ? typingByConv[activeId] : undefined;

  return (
    <div className={styles.shell}>
      <div
        className={`${styles.frame} ${activeId ? styles.mobileHideSidebar : styles.mobileHideMain}`}
      >
        {/* ===== Cột trái: Danh sách hội thoại ===== */}
        <aside className={styles.sidebar} aria-label="Danh sách cuộc trò chuyện">
          <div className={styles.sidebarHead}>
            <div className={styles.sidebarTitleRow}>
              <h1 className={`${styles.sidebarTitle} font-display`}>Tin nhắn</h1>
              <span className={`${styles.connPill} ${connClass}`} aria-live="polite">
                <span className={styles.connDot} aria-hidden="true" />
                {connLabel}
              </span>
            </div>

            <div className={styles.searchWrap}>
              <svg
                className={styles.searchIcon}
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm cuộc trò chuyện, bạn bè…"
                aria-label="Tìm cuộc trò chuyện hoặc bạn bè"
                className={styles.searchInput}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Xóa tìm kiếm"
                  className={styles.clearSearch}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className={styles.convScroll}>
            {filteredConvs.length > 0 && (
              <>
                <div className={styles.sectionLabel}>Hội thoại gần đây</div>
                <ul className={styles.convList}>
                  {filteredConvs.map((conv) => {
                    const isActive = conv.id === activeId;
                    const isTypingHere = Boolean(typingByConv[conv.id]);
                    const previewText = isTypingHere
                      ? "Đang nhập…"
                      : conv.lastMessage
                        ? `${conv.lastMessage.senderId === currentUserId ? "Bạn: " : ""}${
                            conv.lastMessage.body || (conv.lastMessage.hasAttachment ? "Đã gửi một hình ảnh" : "")
                          }`
                        : "Bắt đầu cuộc trò chuyện";
                    return (
                      <li key={conv.id}>
                        <button
                          type="button"
                          onClick={() => void openConversation(conv.id)}
                          className={`${styles.convItem} ${isActive ? styles.convActive : ""}`}
                        >
                          <span className={styles.avatarBox}>
                            <Avatar name={conv.peer.displayName} url={conv.peer.avatarUrl} size={42} />
                            <span
                              aria-hidden="true"
                              className={`${styles.presenceDot} ${
                                conv.peer.online ? styles.presenceOnline : ""
                              }`}
                            />
                          </span>
                          <span className={styles.convBody}>
                            <span className={styles.convTop}>
                              <span className={styles.convName}>{conv.peer.displayName}</span>
                              <span className={styles.convTime}>
                                {formatShortTime(conv.lastMessage?.createdAt ?? conv.updatedAt)}
                              </span>
                            </span>
                            <span className={styles.convBottom}>
                              <span
                                className={`${styles.convPreview} ${
                                  conv.unreadCount > 0 ? styles.convPreviewUnread : ""
                                }`}
                              >
                                {previewText}
                              </span>
                              {conv.unreadCount > 0 && (
                                <span className={styles.unreadBadge}>
                                  {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {friendsWithoutConv.length > 0 && (
              <>
                <div className={styles.sectionLabel}>Bạn bè follow hai chiều</div>
                <ul className={styles.convList}>
                  {friendsWithoutConv.map((friend) => (
                    <li key={friend.id}>
                      <button
                        type="button"
                        disabled={startingPeerId === friend.id}
                        onClick={() => void startChatWithFriend(friend.id)}
                        className={styles.convItem}
                      >
                        <span className={styles.avatarBox}>
                          <Avatar name={friend.displayName} url={friend.avatarUrl} size={40} />
                          <span
                            aria-hidden="true"
                            className={`${styles.presenceDot} ${
                              friend.online ? styles.presenceOnline : ""
                            }`}
                          />
                        </span>
                        <span className={styles.convBody}>
                          <span className={styles.convTop}>
                            <span className={styles.convName}>{friend.displayName}</span>
                          </span>
                          <span className={styles.convBottom}>
                            <span className={styles.convPreview}>
                              {startingPeerId === friend.id
                                ? "Đang mở hội thoại…"
                                : friend.online
                                  ? "Đang hoạt động · Nhấn để nhắn tin"
                                  : "Ngoại tuyến · Nhấn để nhắn tin"}
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {filteredConvs.length === 0 && friendsWithoutConv.length === 0 && (
              <div className="px-4 py-10 text-center text-xs leading-relaxed text-muted">
                {search
                  ? `Không tìm thấy hội thoại hay bạn bè khớp “${search}”.`
                  : "Chưa có bạn bè follow hai chiều để nhắn tin. Hãy kết nối thêm thành viên tại Community."}
                {!search && (
                  <Link href="/discovery?tab=users" className="mt-3 block text-link underline underline-offset-4">
                    Tìm thành viên →
                  </Link>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ===== Khu vực trò chuyện chính ===== */}
        <section className={styles.main} aria-label="Cửa sổ trò chuyện">
          {connState === "disconnected" || connState === "reconnecting" ? (
            <div role="status" className={styles.connBanner}>
              <span>
                {connState === "reconnecting"
                  ? "Kết nối realtime tạm gián đoạn — đang tự động kết nối lại…"
                  : "Mất kết nối realtime. Nội dung đang soạn vẫn được giữ lại."}
              </span>
              <button type="button" onClick={reconnectChatStream} className={styles.reconnectBtn}>
                Kết nối lại
              </button>
            </div>
          ) : null}

          {!activeConv ? (
            <div className={styles.emptyPane}>
              <div className={styles.emptyCard}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 17.5 3.5 21l3.9-1.2A8.5 8.5 0 1 0 5 17.5Z" />
                    <path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01" strokeWidth="2.4" />
                  </svg>
                </div>
                <h2 className={`${styles.emptyTitle} font-display`}>Rivanda Direct Messaging</h2>
                <p className={styles.emptyText}>
                  Chọn một cuộc trò chuyện bên trái hoặc nhấn vào bạn bè follow hai chiều để bắt đầu nhắn tin trực tiếp theo thời gian thực.
                </p>
                {composerError && (
                  <p role="alert" className="mt-3 text-xs text-danger">
                    {composerError}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <header className={styles.chatHeader}>
                <div className={styles.chatHeaderLeft}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(null);
                      if (typeof window !== "undefined") {
                        window.history.replaceState(null, "", "/messages");
                      }
                    }}
                    aria-label="Quay lại danh sách hội thoại"
                    className={styles.backBtn}
                  >
                    ←
                  </button>
                  <span className={styles.avatarBox}>
                    <Avatar name={activeConv.peer.displayName} url={activeConv.peer.avatarUrl} size={40} />
                    <span
                      aria-hidden="true"
                      className={`${styles.presenceDot} ${
                        activeConv.peer.online ? styles.presenceOnline : ""
                      }`}
                    />
                  </span>
                  <div className="min-w-0">
                    <Link href={activeConv.peer.profileUrl} className={styles.peerName}>
                      {activeConv.peer.displayName}
                    </Link>
                    <span
                      className={`${styles.peerStatus} ${
                        activeTypingName
                          ? styles.peerStatusTyping
                          : activeConv.peer.online
                            ? styles.peerStatusOnline
                            : ""
                      }`}
                    >
                      {activeTypingName
                        ? "Đang nhập tin nhắn…"
                        : activeConv.peer.online
                          ? "Đang hoạt động"
                          : formatLastSeen(activeConv.peer.lastSeenAt)}
                    </span>
                  </div>
                </div>

                <Link href={activeConv.peer.profileUrl} className={styles.profileBtn}>
                  Xem hồ sơ
                </Link>
              </header>

              <div className={styles.messagesWrap}>
                <div
                  ref={scrollRef}
                  className={styles.messagesScroll}
                  onScroll={() => {
                    if (isNearBottom()) setShowJumpNew(false);
                  }}
                >
                  {hasMore && (
                    <div className={styles.loadMoreWrap}>
                      <button
                        type="button"
                        disabled={loadingOlder}
                        onClick={() => void loadOlderMessages()}
                        className={styles.loadMoreBtn}
                      >
                        {loadingOlder ? "Đang tải tin cũ…" : "Tải tin nhắn cũ hơn"}
                      </button>
                    </div>
                  )}

                  {loadingHistory && (
                    <p className="py-6 text-center text-xs text-muted">Đang tải lịch sử tin nhắn…</p>
                  )}

                  {!loadingHistory && messages.length === 0 && (
                    <div className="my-auto py-8 text-center">
                      <p className="text-sm font-semibold text-fg">
                        Bắt đầu trò chuyện cùng {activeConv.peer.displayName}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Gửi lời chào đầu tiên — tin nhắn được lưu an toàn và gửi đi tức thì.
                      </p>
                    </div>
                  )}

                  {messages.map((m) => {
                    const isMine = m.senderId === currentUserId;
                    const receiptLabel = m.pending
                      ? "Đang gửi…"
                      : m.failed
                        ? "Gửi thất bại"
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
                        {!isMine && (
                          <Avatar
                            name={activeConv.peer.displayName}
                            url={activeConv.peer.avatarUrl}
                            size={28}
                          />
                        )}
                        <div className={styles.msgCol}>
                          {m.attachments.length > 0 && (
                            <div className={styles.attachGrid}>
                              {m.attachments.map((att) => (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => setLightboxUrl(att.url)}
                                  className={styles.attachImgBtn}
                                  aria-label="Xem ảnh kích thước lớn"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={att.url} alt="" className={styles.attachImg} />
                                </button>
                              ))}
                            </div>
                          )}

                          {m.body && (
                            <div
                              className={`${styles.bubble} ${
                                isMine ? styles.bubbleMine : styles.bubblePeer
                              } ${m.failed ? styles.bubbleFailed : ""}`}
                            >
                              {m.body}
                            </div>
                          )}

                          <div className={styles.msgMeta}>
                            <time dateTime={m.createdAt}>{formatMsgTime(m.createdAt)}</time>
                            {isMine && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{receiptLabel}</span>
                                {m.failed && m.clientMsgId && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void dispatchMessage({
                                        convId: activeConv.id,
                                        body: m.body,
                                        file: m.retryFile ?? null,
                                        clientMsgId: m.clientMsgId!,
                                        existingOptimisticId: m.id,
                                      })
                                    }
                                    className={styles.retryMsgBtn}
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

                  {activeTypingName && (
                    <div className={styles.typingRow} aria-live="polite">
                      <span className={styles.typingDots} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                      <span>{activeTypingName} đang nhập…</span>
                    </div>
                  )}
                </div>

                {showJumpNew && (
                  <button
                    type="button"
                    onClick={() => scrollToBottom(true)}
                    className={styles.jumpBottomBtn}
                  >
                    Tin nhắn mới ↓
                  </button>
                )}
              </div>

              <div className={styles.composer}>
                {!activeConv.canSend ? (
                  <div className={styles.blockedNotice}>
                    Hai tài khoản hiện không còn follow nhau hai chiều. Bạn vẫn có thể xem lại lịch sử, nhưng cần follow hai chiều để gửi tin nhắn mới.
                  </div>
                ) : (
                  <>
                    {composerError && (
                      <p role="alert" className={styles.composerError}>
                        {composerError}
                      </p>
                    )}

                    {selectedPreviewUrl && selectedFile && (
                      <div className={styles.attachPreviewBar}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={selectedPreviewUrl} alt="" className={styles.attachPreviewThumb} />
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="truncate font-semibold text-fg">{selectedFile.name}</p>
                          <p className="text-muted">
                            {(selectedFile.size / 1024).toFixed(0)} KB · Sẵn sàng gửi
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={clearSelectedImage}
                          aria-label="Bỏ ảnh đính kèm"
                          className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-card hover:text-fg"
                        >
                          Bỏ ảnh
                        </button>
                      </div>
                    )}

                    {emojiOpen && (
                      <div ref={emojiRef} className={styles.emojiPopover} role="dialog" aria-label="Chọn biểu tượng cảm xúc">
                        {EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => insertEmoji(em)}
                            className={styles.emojiCell}
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={styles.composerRow}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePickImage}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Đính kèm ảnh"
                        title="Đính kèm ảnh (JPG, PNG, WebP ≤ 5MB)"
                        className={styles.iconBtn}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="4" width="18" height="16" rx="2.5" />
                          <circle cx="8.5" cy="9.5" r="1.5" />
                          <path d="m21 15-4.5-4.5L7 20" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEmojiOpen((v) => !v)}
                        aria-label="Chọn emoji"
                        aria-expanded={emojiOpen}
                        title="Biểu tượng cảm xúc"
                        className={styles.iconBtn}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2" />
                          <circle cx="9" cy="10" r=".8" fill="currentColor" />
                          <circle cx="15" cy="10" r=".8" fill="currentColor" />
                        </svg>
                      </button>

                      <textarea
                        ref={textareaRef}
                        rows={1}
                        value={currentDraft}
                        maxLength={4000}
                        onChange={(e) => handleDraftChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)"
                        aria-label="Nội dung tin nhắn"
                        className={styles.textarea}
                      />

                      <button
                        type="button"
                        disabled={!currentDraft.trim() && !selectedFile}
                        onClick={() => void handleSend()}
                        className={styles.sendBtn}
                      >
                        <span>Gửi</span>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M22 2 11 13" />
                          <path d="m22 2-7 20-4-9-9-4 20-7Z" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh đính kèm"
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
    </div>
  );
}
