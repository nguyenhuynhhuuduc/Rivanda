import type { RowDataPacket } from "mysql2";
import { pool } from "../db";
import { displayName } from "../users";
import { idOf } from "./model";

export const ONLINE_TTL_MS = 75_000; // Hết hạn sau 75 giây không có heartbeat (heartbeat 30s)
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

type PresenceEntry = {
  lastSeen: number;
  offline: boolean;
};

type GlobalPresence = typeof globalThis & {
  __rivandaPresence?: Map<string, PresenceEntry>;
  __rivandaPresenceLastPrune?: number;
};

const g = globalThis as GlobalPresence;

function store(): Map<string, PresenceEntry> {
  if (!g.__rivandaPresence) {
    g.__rivandaPresence = new Map<string, PresenceEntry>();
  }
  return g.__rivandaPresence;
}

function pruneOldEntries(now: number): void {
  const lastPrune = g.__rivandaPresenceLastPrune ?? 0;
  if (now - lastPrune < 5 * 60 * 1000) return;
  g.__rivandaPresenceLastPrune = now;
  const map = store();
  for (const [id, entry] of map.entries()) {
    if (now - entry.lastSeen > PRUNE_AFTER_MS) {
      map.delete(id);
    }
  }
}

export function recordHeartbeat(userId: string, now = Date.now()): number {
  const normalized = idOf(userId).toLowerCase();
  pruneOldEntries(now);
  store().set(normalized, { lastSeen: now, offline: false });
  return now;
}

export function markOffline(userId: string, now = Date.now()): void {
  const normalized = idOf(userId).toLowerCase();
  const prev = store().get(normalized);
  store().set(normalized, { lastSeen: prev?.lastSeen ?? now, offline: true });
}

export function getPresenceStatus(
  userId: string,
  now = Date.now(),
): { online: boolean; lastSeenAt: number | null } {
  const normalized = idOf(userId).toLowerCase();
  const entry = store().get(normalized);
  if (!entry) return { online: false, lastSeenAt: null };
  const online = !entry.offline && now - entry.lastSeen <= ONLINE_TTL_MS;
  return { online, lastSeenAt: entry.lastSeen };
}

export type MutualPresenceUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  online: boolean;
  lastSeenAt: string | null;
};

export type MutualPresenceList = {
  onlineCount: number;
  totalCount: number;
  ttlSeconds: number;
  users: MutualPresenceUser[];
};

type MutualRow = RowDataPacket & {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
};

/**
 * Chỉ lấy các tài khoản có quan hệ follow hai chiều với viewer (A follow B VÀ B follow A).
 * Tuyệt đối không trả về người chỉ follow một chiều hoặc tài khoản bị vô hiệu hóa.
 */
export async function listMutualFollowPresence(
  viewerId: string,
  now = Date.now(),
): Promise<MutualPresenceList> {
  const viewer = idOf(viewerId);
  const [rows] = await pool.query<MutualRow[]>(
    `SELECT u.id, u.first_name, u.last_name, u.avatar_url
       FROM follows f1
       JOIN follows f2
         ON f2.follower_id = f1.followed_id
        AND f2.followed_id = f1.follower_id
       JOIN users u
         ON u.id = f1.followed_id
        AND u.is_active = 1
      WHERE f1.follower_id = ?
        AND u.id <> ?
      ORDER BY u.last_name ASC, u.first_name ASC
      LIMIT 100`,
    [viewer, viewer],
  );

  const enriched = rows.map((r) => {
    const status = getPresenceStatus(r.id, now);
    return {
      id: r.id,
      displayName: displayName({ firstName: r.first_name, lastName: r.last_name }) || "Thành viên",
      avatarUrl: r.avatar_url ?? null,
      profileUrl: `/profile/${r.id}`,
      online: status.online,
      lastSeenAt: status.lastSeenAt ? new Date(status.lastSeenAt).toISOString() : null,
      _lastSeenMs: status.lastSeenAt ?? 0,
    };
  });

  // Người online lên đầu (mới tương tác gần nhất trước), người offline xếp dưới
  enriched.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a._lastSeenMs !== b._lastSeenMs) return b._lastSeenMs - a._lastSeenMs;
    return a.displayName.localeCompare(b.displayName, "vi");
  });

  const users: MutualPresenceUser[] = enriched.map(({ _lastSeenMs: _ignore, ...u }) => u);
  const onlineCount = users.reduce((acc, u) => acc + (u.online ? 1 : 0), 0);

  return {
    onlineCount,
    totalCount: users.length,
    ttlSeconds: Math.round(ONLINE_TTL_MS / 1000),
    users,
  };
}
