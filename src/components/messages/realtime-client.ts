"use client";

import type { ChatRealtimeEvent } from "@/lib/chat/realtime";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

type EventListener = (event: ChatRealtimeEvent) => void;
type StateListener = (state: ConnectionState) => void;

const EVENT_NAMES: Array<ChatRealtimeEvent["type"]> = [
  "message:new",
  "message:delivered",
  "message:read",
  "typing:start",
  "typing:stop",
  "presence:online",
  "presence:offline",
];

class RealtimeHub {
  private source: EventSource | null = null;
  private eventListeners = new Set<EventListener>();
  private stateListeners = new Set<StateListener>();
  private state: ConnectionState = "disconnected";
  private closeTimer: number | null = null;

  private setState(next: ConnectionState) {
    if (this.state === next) return;
    this.state = next;
    for (const cb of this.stateListeners) {
      try {
        cb(next);
      } catch {
        // Bỏ qua lỗi listener đơn lẻ
      }
    }
  }

  private ensureConnected() {
    if (typeof window === "undefined") return;
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.source && this.source.readyState !== EventSource.CLOSED) return;

    this.setState(this.state === "disconnected" ? "connecting" : "reconnecting");
    const es = new EventSource("/api/messages/stream", { withCredentials: true });
    this.source = es;

    es.addEventListener("connected", () => {
      this.setState("connected");
    });

    es.onopen = () => {
      this.setState("connected");
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        this.setState("disconnected");
      } else {
        this.setState("reconnecting");
      }
    };

    for (const name of EVENT_NAMES) {
      es.addEventListener(name, (raw) => {
        try {
          const parsed = JSON.parse((raw as MessageEvent).data) as ChatRealtimeEvent;
          for (const cb of this.eventListeners) {
            try {
              cb(parsed);
            } catch {
              // Bỏ qua lỗi từng listener
            }
          }
        } catch {
          // Bỏ qua payload lỗi định dạng
        }
      });
    }
  }

  private maybeScheduleClose() {
    if (this.eventListeners.size > 0 || this.stateListeners.size > 0) return;
    if (typeof window === "undefined") return;
    this.closeTimer = window.setTimeout(() => {
      if (this.eventListeners.size === 0 && this.stateListeners.size === 0 && this.source) {
        this.source.close();
        this.source = null;
        this.setState("disconnected");
      }
      this.closeTimer = null;
    }, 1500);
  }

  subscribeEvents(cb: EventListener): () => void {
    this.eventListeners.add(cb);
    this.ensureConnected();
    return () => {
      this.eventListeners.delete(cb);
      this.maybeScheduleClose();
    };
  }

  subscribeState(cb: StateListener): () => void {
    this.stateListeners.add(cb);
    cb(this.state);
    this.ensureConnected();
    return () => {
      this.stateListeners.delete(cb);
      this.maybeScheduleClose();
    };
  }

  reconnect() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.setState("reconnecting");
    this.ensureConnected();
  }
}

const hub = new RealtimeHub();

export function subscribeChatEvents(cb: EventListener): () => void {
  return hub.subscribeEvents(cb);
}

export function subscribeChatConnection(cb: StateListener): () => void {
  return hub.subscribeState(cb);
}

export function reconnectChatStream(): void {
  hub.reconnect();
}
