export type ChatAttachmentDTO = {
  id: string;
  url: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
};

export type ChatMessageDTO = {
  id: string;
  conversationId: string;
  senderId: string;
  clientMsgId: string | null;
  body: string;
  attachments: ChatAttachmentDTO[];
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ChatRealtimeEvent =
  | {
      type: "message:new";
      conversationId: string;
      message: ChatMessageDTO;
      senderName: string;
      senderAvatar: string | null;
    }
  | {
      type: "message:delivered";
      conversationId: string;
      messageIds: string[];
      deliveredAt: string;
      byUserId: string;
    }
  | {
      type: "message:read";
      conversationId: string;
      lastReadMessageId: string | null;
      readAt: string;
      byUserId: string;
    }
  | {
      type: "typing:start";
      conversationId: string;
      userId: string;
      displayName: string;
    }
  | {
      type: "typing:stop";
      conversationId: string;
      userId: string;
    }
  | {
      type: "presence:online";
      userId: string;
      lastSeenAt: string;
    }
  | {
      type: "presence:offline";
      userId: string;
      lastSeenAt: string | null;
    };

type Subscriber = (event: ChatRealtimeEvent) => void;

type ChatBroker = {
  subscribers: Map<string, Set<Subscriber>>;
  rateBuckets: Map<string, number[]>;
};

type GlobalWithBroker = typeof globalThis & { __rivandaChatBroker?: ChatBroker };
const g = globalThis as GlobalWithBroker;

function broker(): ChatBroker {
  if (!g.__rivandaChatBroker) {
    g.__rivandaChatBroker = {
      subscribers: new Map(),
      rateBuckets: new Map(),
    };
  }
  return g.__rivandaChatBroker;
}

export function subscribeUserStream(
  userId: string,
  listener: Subscriber,
): { unsubscribe: () => { remaining: number }; becameOnline: boolean } {
  const key = userId.toLowerCase();
  const map = broker().subscribers;
  let set = map.get(key);
  const becameOnline = !set || set.size === 0;
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(listener);

  return {
    becameOnline,
    unsubscribe: () => {
      const current = map.get(key);
      if (!current) return { remaining: 0 };
      current.delete(listener);
      if (current.size === 0) {
        map.delete(key);
        return { remaining: 0 };
      }
      return { remaining: current.size };
    },
  };
}

export function hasActiveStream(userId: string): boolean {
  const set = broker().subscribers.get(userId.toLowerCase());
  return !!set && set.size > 0;
}

export function publishToUsers(userIds: Iterable<string>, event: ChatRealtimeEvent): void {
  const map = broker().subscribers;
  const delivered = new Set<string>();
  for (const rawId of userIds) {
    const key = rawId.toLowerCase();
    if (delivered.has(key)) continue;
    delivered.add(key);
    const set = map.get(key);
    if (!set || set.size === 0) continue;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        // Không để lỗi 1 kết nối làm gián đoạn kết nối khác
      }
    }
  }
}

export function checkChatRateLimit(
  userId: string,
  action: "message" | "upload" | "typing",
  maxCount: number,
  windowMs: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const buckets = broker().rateBuckets;
  const key = `${action}:${userId.toLowerCase()}`;
  const cutoff = now - windowMs;
  const times = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (times.length >= maxCount) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - times[0])) / 1000));
    buckets.set(key, times);
    return { ok: false, retryAfterSeconds };
  }
  times.push(now);
  buckets.set(key, times);
  return { ok: true };
}
