"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/kit";
import type { ChatRealtimeEvent } from "@/lib/chat/realtime";
import type { ConversationPeer, ConversationSummary } from "@/lib/chat/store";
import type { MutualPresenceUser } from "@/lib/discovery-community/presence";
import { subscribeChatEvents } from "./realtime-client";
import { MiniChatWindow } from "./MiniChatWindow";
import styles from "./MiniChat.module.css";

type DockWindow = {
  conversationId: string;
  peer: ConversationPeer;
  canSend: boolean;
  minimized: boolean;
  unreadCount: number;
  focusTick: number;
};

type MiniChatContextValue = {
  openWithPeer: (peer: MutualPresenceUser) => Promise<{ ok: boolean; error?: string }>;
  openingPeerId: string | null;
};

const MiniChatContext = createContext<MiniChatContextValue | null>(null);

export function useMiniChat(): MiniChatContextValue | null {
  return useContext(MiniChatContext);
}

function maxOpenWindowsForViewport(width: number): number {
  if (width >= 1360) return 3;
  if (width >= 960) return 2;
  return 1;
}

export function MiniChatProvider({
  currentUserId,
  children,
}: {
  currentUserId: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [windows, setWindows] = useState<DockWindow[]>([]);
  const [openingPeerId, setOpeningPeerId] = useState<string | null>(null);
  const openingRef = useRef<string | null>(null);
  const windowsRef = useRef<DockWindow[]>(windows);
  const draftsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    windowsRef.current = windows;
  }, [windows]);

  // Reset cửa sổ nếu đăng xuất hoặc đổi tài khoản
  useEffect(() => {
    draftsRef.current = {};
    setWindows((prev) => (prev.length === 0 ? prev : []));
  }, [currentUserId]);

  // Tự giới hạn số cửa sổ mở đồng thời theo chiều rộng màn hình (chỉ setState khi thực sự vượt giới hạn)
  useEffect(() => {
    function syncLimit() {
      const limit = maxOpenWindowsForViewport(window.innerWidth);
      setWindows((prev) => {
        const openOnes = prev.filter((w) => !w.minimized);
        if (openOnes.length <= limit) return prev;
        const overflowCount = openOnes.length - limit;
        const toMinimize = new Set(openOnes.slice(0, overflowCount).map((w) => w.conversationId));
        return prev.map((w) =>
          toMinimize.has(w.conversationId) ? { ...w, minimized: true } : w,
        );
      });
    }
    syncLimit();
    window.addEventListener("resize", syncLimit);
    return () => window.removeEventListener("resize", syncLimit);
  }, []);

  const hasWindows = windows.length > 0;

  // Đồng bộ presence & số tin chưa đọc — tuyệt đối không tạo mảng mới nếu dữ liệu không thay đổi
  useEffect(() => {
    if (!currentUserId || !hasWindows) return;
    const unsub = subscribeChatEvents((event: ChatRealtimeEvent) => {
      if (event.type === "presence:online" || event.type === "presence:offline") {
        const online = event.type === "presence:online";
        const target = event.userId.toLowerCase();
        setWindows((prev) => {
          let changed = false;
          const next = prev.map((w) => {
            if (w.peer.id.toLowerCase() !== target) return w;
            if (w.peer.online === online && w.peer.lastSeenAt === event.lastSeenAt) return w;
            changed = true;
            return { ...w, peer: { ...w.peer, online, lastSeenAt: event.lastSeenAt } };
          });
          return changed ? next : prev;
        });
        return;
      }

      if (event.type === "message:new" && event.message.senderId !== currentUserId) {
        setWindows((prev) => {
          let changed = false;
          const next = prev.map((w) => {
            if (w.conversationId !== event.conversationId || !w.minimized) return w;
            changed = true;
            void fetch(`/api/messages/conversations/${w.conversationId}/delivered`, {
              method: "POST",
              credentials: "same-origin",
            }).catch(() => {});
            return { ...w, unreadCount: w.unreadCount + 1 };
          });
          return changed ? next : prev;
        });
        return;
      }

      if (event.type === "message:read" && event.byUserId === currentUserId) {
        setWindows((prev) => {
          let changed = false;
          const next = prev.map((w) => {
            if (w.conversationId !== event.conversationId || w.unreadCount === 0) return w;
            changed = true;
            return { ...w, unreadCount: 0 };
          });
          return changed ? next : prev;
        });
      }
    });
    return unsub;
  }, [currentUserId, hasWindows]);

  const bringToOpen = useCallback((list: DockWindow[], convId: string): DockWindow[] => {
    const limit =
      typeof window !== "undefined" ? maxOpenWindowsForViewport(window.innerWidth) : 2;
    const nowTick = Date.now();
    const updated = list.map((w) =>
      w.conversationId === convId
        ? { ...w, minimized: false, unreadCount: 0, focusTick: nowTick }
        : w,
    );
    const openOnes = updated.filter((w) => !w.minimized);
    if (openOnes.length <= limit) return updated;
    const victim = openOnes.find((w) => w.conversationId !== convId);
    if (!victim) return updated;
    return updated.map((w) =>
      w.conversationId === victim.conversationId ? { ...w, minimized: true } : w,
    );
  }, []);

  const handleMinimize = useCallback((convId: string) => {
    setWindows((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.conversationId !== convId || item.minimized) return item;
        changed = true;
        return { ...item, minimized: true };
      });
      return changed ? next : prev;
    });
  }, []);

  const handleClose = useCallback((convId: string) => {
    delete draftsRef.current[convId];
    setWindows((prev) => {
      const next = prev.filter((item) => item.conversationId !== convId);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const handleReadClear = useCallback((convId: string) => {
    setWindows((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item.conversationId !== convId || item.unreadCount === 0) return item;
        changed = true;
        return { ...item, unreadCount: 0 };
      });
      return changed ? next : prev;
    });
  }, []);

  const handleDraftPersist = useCallback((convId: string, value: string) => {
    if (value) draftsRef.current[convId] = value;
    else delete draftsRef.current[convId];
  }, []);

  const openWithPeer = useCallback(
    async (friend: MutualPresenceUser): Promise<{ ok: boolean; error?: string }> => {
      if (!currentUserId) return { ok: false, error: "Hãy đăng nhập để nhắn tin." };

      const existing = windowsRef.current.find(
        (w) => w.peer.id.toLowerCase() === friend.id.toLowerCase(),
      );
      if (existing) {
        setWindows((prev) =>
          bringToOpen(
            prev.map((w) =>
              w.conversationId === existing.conversationId
                ? {
                    ...w,
                    peer: {
                      ...w.peer,
                      online: friend.online,
                      lastSeenAt: friend.lastSeenAt,
                      avatarUrl: friend.avatarUrl,
                      displayName: friend.displayName,
                    },
                  }
                : w,
            ),
            existing.conversationId,
          ),
        );
        return { ok: true };
      }

      if (openingRef.current === friend.id) return { ok: true };
      openingRef.current = friend.id;
      setOpeningPeerId(friend.id);

      try {
        const res = await fetch("/api/messages/conversations", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ peerUserId: friend.id }),
        });
        const data = (await res.json()) as { conversation?: ConversationSummary; error?: string };
        if (!res.ok || !data.conversation) {
          return {
            ok: false,
            error: data.error || `Chưa thể mở cuộc trò chuyện với ${friend.displayName}.`,
          };
        }

        const conv = data.conversation;
        setWindows((prev) => {
          const exists = prev.some((w) => w.conversationId === conv.id);
          const base = exists
            ? prev
            : [
                ...prev,
                {
                  conversationId: conv.id,
                  peer: conv.peer,
                  canSend: conv.canSend,
                  minimized: false,
                  unreadCount: 0,
                  focusTick: Date.now(),
                },
              ];
          return bringToOpen(base, conv.id);
        });
        return { ok: true };
      } catch {
        return { ok: false, error: "Không kết nối được máy chủ để mở Mini Chat." };
      } finally {
        openingRef.current = null;
        setOpeningPeerId(null);
      }
    },
    [bringToOpen, currentUserId],
  );

  // Memoize context value để toàn bộ cây con (trang Discovery) không bị re-render khi trạng thái cửa sổ đổi
  const contextValue = useMemo(
    () => ({ openWithPeer, openingPeerId }),
    [openWithPeer, openingPeerId],
  );

  const hideDock =
    !currentUserId ||
    pathname === "/messages" ||
    pathname.startsWith("/messages/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/admin");

  const openWindows = useMemo(() => windows.filter((w) => !w.minimized), [windows]);
  const minimizedWindows = useMemo(() => windows.filter((w) => w.minimized), [windows]);

  return (
    <MiniChatContext.Provider value={contextValue}>
      {children}

      {!hideDock && hasWindows && (
        <div className={styles.dock} aria-label="Cửa sổ trò chuyện nhanh">
          {openWindows.map((w) => (
            <MiniChatWindow
              key={w.conversationId}
              currentUserId={currentUserId}
              conversationId={w.conversationId}
              peer={w.peer}
              canSend={w.canSend}
              focusTick={w.focusTick}
              initialDraft={draftsRef.current[w.conversationId] ?? ""}
              onDraftPersist={handleDraftPersist}
              onMinimize={handleMinimize}
              onClose={handleClose}
              onReadClear={handleReadClear}
            />
          ))}

          {minimizedWindows.length > 0 && (
            <div className={styles.minimizedColumn} aria-label="Cuộc trò chuyện đang thu nhỏ">
              {minimizedWindows.map((w) => (
                <div key={w.conversationId} className={styles.bubbleWrap}>
                  <button
                    type="button"
                    onClick={() => setWindows((prev) => bringToOpen(prev, w.conversationId))}
                    className={styles.minimizedBtn}
                    title={`Mở lại trò chuyện với ${w.peer.displayName}${w.unreadCount ? ` (${w.unreadCount} tin mới)` : ""}`}
                    aria-label={`Mở lại trò chuyện với ${w.peer.displayName}${w.unreadCount ? `, ${w.unreadCount} tin chưa đọc` : ""}`}
                  >
                    <Avatar name={w.peer.displayName} url={w.peer.avatarUrl} size={42} />
                    <span
                      aria-hidden="true"
                      className={`${styles.statusDot} ${w.peer.online ? styles.statusOnline : ""}`}
                    />
                    {w.unreadCount > 0 && (
                      <span aria-hidden="true" className={styles.minimizedUnread}>
                        {w.unreadCount > 99 ? "99+" : w.unreadCount}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClose(w.conversationId)}
                    className={styles.minimizedClose}
                    aria-label={`Đóng ${w.peer.displayName}`}
                    title="Đóng"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </MiniChatContext.Provider>
  );
}
