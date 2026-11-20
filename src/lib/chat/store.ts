import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import { idOf } from "@/lib/discovery-community/model";
import { getPresenceStatus } from "@/lib/discovery-community/presence";
import { markChatNotificationRead } from "@/lib/notifications";
import { displayName, isDuplicateError } from "@/lib/users";
import { hasActiveStream, type ChatAttachmentDTO, type ChatMessageDTO } from "./realtime";

export const MAX_MESSAGE_BODY = 4000;
export const CLIENT_MSG_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export class ChatError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ConversationPeer = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  online: boolean;
  lastSeenAt: string | null;
};

export type ConversationSummary = {
  id: string;
  peer: ConversationPeer;
  canSend: boolean; // true khi vẫn đang follow hai chiều
  unreadCount: number;
  lastMessage: {
    id: string;
    senderId: string;
    body: string;
    hasAttachment: boolean;
    createdAt: string;
  } | null;
  updatedAt: string;
};

export async function chatSchemaReady(): Promise<boolean> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TABLE_NAME t
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('conversations', 'conversation_members', 'messages', 'message_attachments')`,
    );
    return rows.length === 4;
  } catch {
    return false;
  }
}

export function directKeyFor(a: string, b: string): string {
  const [first, second] = [idOf(a).toLowerCase(), idOf(b).toLowerCase()].sort();
  return `${first}:${second}`;
}

export async function isMutualFollow(userA: string, userB: string): Promise<boolean> {
  const a = idOf(userA);
  const b = idOf(userB);
  if (a.toLowerCase() === b.toLowerCase()) return false;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1
       FROM follows f1
       JOIN follows f2
         ON f2.follower_id = f1.followed_id
        AND f2.followed_id = f1.follower_id
       JOIN users u1 ON u1.id = f1.follower_id AND u1.is_active = 1
       JOIN users u2 ON u2.id = f1.followed_id AND u2.is_active = 1
      WHERE f1.follower_id = ? AND f1.followed_id = ?
      LIMIT 1`,
    [a, b],
  );
  return rows.length > 0;
}

export async function getConversationPeerId(
  viewerId: string,
  conversationId: string,
): Promise<{ peerId: string; isMember: boolean }> {
  const viewer = idOf(viewerId);
  const convId = idOf(conversationId);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT user_id FROM conversation_members WHERE conversation_id = ?`,
    [convId],
  );
  const memberIds = rows.map((r) => String(r.user_id));
  const isMember = memberIds.some((id) => id.toLowerCase() === viewer.toLowerCase());
  if (!isMember) return { peerId: "", isMember: false };
  const peerId = memberIds.find((id) => id.toLowerCase() !== viewer.toLowerCase()) ?? "";
  return { peerId, isMember: true };
}

export async function getOrCreateDirectConversation(
  viewerId: string,
  peerUserId: string,
): Promise<ConversationSummary> {
  const viewer = idOf(viewerId);
  const peer = idOf(peerUserId);
  if (viewer.toLowerCase() === peer.toLowerCase()) {
    throw new ChatError("Không thể tạo cuộc trò chuyện với chính mình.", 400);
  }

  const mutual = await isMutualFollow(viewer, peer);
  if (!mutual) {
    throw new ChatError(
      "Chỉ có thể bắt đầu trò chuyện khi hai tài khoản đã follow nhau hai chiều.",
      403,
    );
  }

  const key = directKeyFor(viewer, peer);
  const conn = await pool.getConnection();
  let conversationId = "";
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query<RowDataPacket[]>(
      "SELECT id FROM conversations WHERE direct_key = ? LIMIT 1 FOR UPDATE",
      [key],
    );
    if (existing[0]?.id) {
      conversationId = String(existing[0].id);
    } else {
      conversationId = randomUUID();
      await conn.query(
        "INSERT INTO conversations (id, type, direct_key) VALUES (?, 'direct', ?)",
        [conversationId, key],
      );
    }
    await conn.query(
      "INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)",
      [conversationId, viewer, conversationId, peer],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (isDuplicateError(err)) {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM conversations WHERE direct_key = ? LIMIT 1",
        [key],
      );
      if (rows[0]?.id) conversationId = String(rows[0].id);
      else throw err;
    } else {
      throw err;
    }
  } finally {
    conn.release();
  }

  const summary = await getConversationSummaryForUser(viewer, conversationId);
  if (!summary) throw new ChatError("Không tải được cuộc trò chuyện.", 404);
  return summary;
}

type ConvRow = RowDataPacket & {
  id: string;
  unread_count: number;
  updated_at: Date;
  last_message_at: Date | null;
  peer_id: string;
  peer_first_name: string;
  peer_last_name: string;
  peer_avatar_url: string | null;
  last_msg_id: string | null;
  last_msg_sender_id: string | null;
  last_msg_body: string | null;
  last_msg_created_at: Date | null;
  last_msg_attach_count: number;
  is_mutual: number;
};

function mapConversationRow(r: ConvRow): ConversationSummary {
  const status = getPresenceStatus(r.peer_id);
  return {
    id: r.id,
    peer: {
      id: r.peer_id,
      displayName:
        displayName({ firstName: r.peer_first_name, lastName: r.peer_last_name }) || "Thành viên",
      avatarUrl: r.peer_avatar_url ?? null,
      profileUrl: `/profile/${r.peer_id}`,
      online: status.online,
      lastSeenAt: status.lastSeenAt ? new Date(status.lastSeenAt).toISOString() : null,
    },
    canSend: Number(r.is_mutual) === 1,
    unreadCount: Number(r.unread_count ?? 0),
    lastMessage: r.last_msg_id
      ? {
          id: r.last_msg_id,
          senderId: String(r.last_msg_sender_id ?? ""),
          body: String(r.last_msg_body ?? ""),
          hasAttachment: Number(r.last_msg_attach_count ?? 0) > 0,
          createdAt: new Date(r.last_msg_created_at ?? r.updated_at).toISOString(),
        }
      : null,
    updatedAt: new Date(r.last_message_at ?? r.updated_at).toISOString(),
  };
}

const CONV_SELECT = `
  SELECT c.id,
         me.unread_count,
         c.updated_at,
         c.last_message_at,
         u.id AS peer_id,
         u.first_name AS peer_first_name,
         u.last_name AS peer_last_name,
         u.avatar_url AS peer_avatar_url,
         lm.id AS last_msg_id,
         lm.sender_id AS last_msg_sender_id,
         lm.body AS last_msg_body,
         lm.created_at AS last_msg_created_at,
         (SELECT COUNT(*) FROM message_attachments ma WHERE ma.message_id = lm.id) AS last_msg_attach_count,
         (CASE WHEN EXISTS(SELECT 1 FROM follows f1 WHERE f1.follower_id = me.user_id AND f1.followed_id = u.id)
                AND EXISTS(SELECT 1 FROM follows f2 WHERE f2.follower_id = u.id AND f2.followed_id = me.user_id)
                AND u.is_active = 1
          THEN 1 ELSE 0 END) AS is_mutual
    FROM conversation_members me
    JOIN conversations c ON c.id = me.conversation_id
    JOIN conversation_members other ON other.conversation_id = c.id AND other.user_id <> me.user_id
    JOIN users u ON u.id = other.user_id
    LEFT JOIN messages lm ON lm.id = c.last_message_id AND lm.deleted_at IS NULL
`;

export async function listUserConversations(viewerId: string): Promise<ConversationSummary[]> {
  const viewer = idOf(viewerId);
  const [rows] = await pool.query<ConvRow[]>(
    `${CONV_SELECT}
      WHERE me.user_id = ?
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC
      LIMIT 100`,
    [viewer],
  );
  return rows.map(mapConversationRow);
}

export async function getConversationSummaryForUser(
  viewerId: string,
  conversationId: string,
): Promise<ConversationSummary | null> {
  const viewer = idOf(viewerId);
  const convId = idOf(conversationId);
  const [rows] = await pool.query<ConvRow[]>(
    `${CONV_SELECT}
      WHERE me.user_id = ? AND c.id = ?
      LIMIT 1`,
    [viewer, convId],
  );
  return rows[0] ? mapConversationRow(rows[0]) : null;
}

export async function totalUnreadMessages(viewerId: string): Promise<number> {
  try {
    const viewer = idOf(viewerId);
    const [[row]] = await pool.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(unread_count), 0) AS total FROM conversation_members WHERE user_id = ?",
      [viewer],
    );
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

type MsgRow = RowDataPacket & {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_msg_id: string | null;
  body: string;
  delivered_at: Date | null;
  read_at: Date | null;
  created_at: Date;
  time_key: string;
};

type AttachRow = RowDataPacket & {
  id: string;
  message_id: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
};

async function hydrateMessages(rows: MsgRow[]): Promise<ChatMessageDTO[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [attRows] = await pool.query<AttachRow[]>(
    `SELECT id, message_id, mime_type, file_size, width, height
       FROM message_attachments
      WHERE message_id IN (?)
      ORDER BY created_at ASC`,
    [ids],
  );
  const byMsg = new Map<string, ChatAttachmentDTO[]>();
  for (const a of attRows) {
    const list = byMsg.get(a.message_id) ?? [];
    list.push({
      id: a.id,
      url: `/api/messages/attachments/${a.id}`,
      mimeType: a.mime_type,
      fileSize: Number(a.file_size),
      width: a.width !== null ? Number(a.width) : null,
      height: a.height !== null ? Number(a.height) : null,
    });
    byMsg.set(a.message_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    clientMsgId: r.client_msg_id ?? null,
    body: r.body,
    attachments: byMsg.get(r.id) ?? [],
    deliveredAt: r.delivered_at ? new Date(r.delivered_at).toISOString() : null,
    readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function listConversationMessages(
  viewerId: string,
  conversationId: string,
  options?: { before?: string | null; limit?: number },
): Promise<{ messages: ChatMessageDTO[]; nextBefore: string | null; hasMore: boolean }> {
  const viewer = idOf(viewerId);
  const convId = idOf(conversationId);
  const { isMember } = await getConversationPeerId(viewer, convId);
  if (!isMember) {
    throw new ChatError("Bạn không có quyền truy cập cuộc trò chuyện này.", 403);
  }

  const limit = Math.max(10, Math.min(50, Math.trunc(Number(options?.limit) || 30)));
  let beforeTime: string | null = null;
  let beforeId: string | null = null;
  if (options?.before) {
    const sep = options.before.indexOf("|");
    if (sep > 0) {
      const t = options.before.slice(0, sep);
      const id = options.before.slice(sep + 1);
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(t) && /^[a-f0-9-]{36}$/i.test(id)) {
        beforeTime = t;
        beforeId = id;
      }
    }
  }

  const [rows] = await pool.query<MsgRow[]>(
    `SELECT id, conversation_id, sender_id, client_msg_id, body, delivered_at, read_at, created_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS time_key
       FROM messages
      WHERE conversation_id = ?
        AND deleted_at IS NULL
        ${beforeTime && beforeId ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    [convId, ...(beforeTime && beforeId ? [beforeTime, beforeTime, beforeId] : []), limit + 1],
  );

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const oldest = page.at(-1);
  const chronological = [...page].reverse();
  const messages = await hydrateMessages(chronological);

  return {
    messages,
    hasMore,
    nextBefore: hasMore && oldest ? `${oldest.time_key}|${oldest.id}` : null,
  };
}

export async function sendDirectMessage(
  viewerId: string,
  conversationId: string,
  input: {
    body: string;
    clientMsgId?: string | null;
    attachment?: {
      storedFile: string;
      mimeType: string;
      fileSize: number;
      width: number | null;
      height: number | null;
    } | null;
  },
): Promise<{ message: ChatMessageDTO; peerId: string; deduplicated: boolean }> {
  const viewer = idOf(viewerId);
  const convId = idOf(conversationId);
  const { isMember, peerId } = await getConversationPeerId(viewer, convId);
  if (!isMember || !peerId) {
    throw new ChatError("Bạn không có quyền gửi tin nhắn vào cuộc trò chuyện này.", 403);
  }

  // Kiểm tra quan hệ follow hai chiều ở backend trước khi cho phép gửi
  if (!(await isMutualFollow(viewer, peerId))) {
    throw new ChatError(
      "Chỉ có thể gửi tin nhắn khi hai tài khoản đang follow nhau hai chiều.",
      403,
    );
  }

  const cleanBody = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  if (cleanBody.length > MAX_MESSAGE_BODY) {
    throw new ChatError(`Tin nhắn tối đa ${MAX_MESSAGE_BODY} ký tự.`, 400);
  }
  if (!cleanBody && !input.attachment) {
    throw new ChatError("Vui lòng nhập nội dung hoặc chọn ảnh để gửi.", 400);
  }

  const clientMsgId =
    input.clientMsgId && CLIENT_MSG_ID_RE.test(input.clientMsgId) ? input.clientMsgId : null;

  const conn = await pool.getConnection();
  const msgId = randomUUID();
  const attachId = input.attachment ? randomUUID() : null;
  const peerOnlineStream = hasActiveStream(peerId);

  try {
    await conn.beginTransaction();

    if (clientMsgId) {
      const [dup] = await conn.query<MsgRow[]>(
        `SELECT id, conversation_id, sender_id, client_msg_id, body, delivered_at, read_at, created_at,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS time_key
           FROM messages
          WHERE conversation_id = ? AND sender_id = ? AND client_msg_id = ?
          LIMIT 1`,
        [convId, viewer, clientMsgId],
      );
      if (dup[0]) {
        await conn.commit();
        const hydrated = await hydrateMessages([dup[0]]);
        return { message: hydrated[0], peerId, deduplicated: true };
      }
    }

    await conn.query(
      `INSERT INTO messages (id, conversation_id, sender_id, client_msg_id, body, delivered_at)
       VALUES (?, ?, ?, ?, ?, ${peerOnlineStream ? "NOW(6)" : "NULL"})`,
      [msgId, convId, viewer, clientMsgId, cleanBody],
    );

    if (input.attachment && attachId) {
      await conn.query(
        `INSERT INTO message_attachments (id, message_id, stored_file, mime_type, file_size, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          attachId,
          msgId,
          input.attachment.storedFile,
          input.attachment.mimeType,
          input.attachment.fileSize,
          input.attachment.width,
          input.attachment.height,
        ],
      );
    }

    await conn.query(
      `UPDATE conversations
          SET last_message_id = ?, last_message_at = NOW(6), updated_at = NOW(6)
        WHERE id = ?`,
      [msgId, convId],
    );

    await conn.query(
      `UPDATE conversation_members
          SET unread_count = unread_count + 1
        WHERE conversation_id = ? AND user_id = ?`,
      [convId, peerId],
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    if (clientMsgId && isDuplicateError(err)) {
      const [dup] = await pool.query<MsgRow[]>(
        `SELECT id, conversation_id, sender_id, client_msg_id, body, delivered_at, read_at, created_at,
                DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS time_key
           FROM messages
          WHERE conversation_id = ? AND sender_id = ? AND client_msg_id = ?
          LIMIT 1`,
        [convId, viewer, clientMsgId],
      );
      if (dup[0]) {
        const hydrated = await hydrateMessages([dup[0]]);
        return { message: hydrated[0], peerId, deduplicated: true };
      }
    }
    throw err;
  } finally {
    conn.release();
  }

  const [rows] = await pool.query<MsgRow[]>(
    `SELECT id, conversation_id, sender_id, client_msg_id, body, delivered_at, read_at, created_at,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s.%f') AS time_key
       FROM messages
      WHERE id = ? LIMIT 1`,
    [msgId],
  );
  const hydrated = await hydrateMessages(rows);
  return { message: hydrated[0], peerId, deduplicated: false };
}

export async function markConversationDelivered(
  viewerId: string,
  conversationId: string,
): Promise<{ peerId: string; messageIds: string[]; deliveredAt: string } | null> {
  const viewer = idOf(viewerId);
  const convId = idOf(conversationId);
  const { isMember, peerId } = await getConversationPeerId(viewer, convId);
  if (!isMember || !peerId) {
    throw new ChatError("Bạn không có quyền truy cập cuộc trò chuyện này.", 403);
  }

  const [pending] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM messages
      WHERE conversation_id = ? AND sender_id <> ? AND delivered_at IS NULL AND deleted_at IS NULL`,
    [convId, viewer],
  );
  if (!pending.length) return null;

  const ids = pending.map((r) => String(r.id));
  await pool.query<ResultSetHeader>(
    `UPDATE messages SET delivered_at = NOW(6)
      WHERE id IN (?) AND delivered_at IS NULL`,
    [ids],
  );
  return { peerId, messageIds: ids, deliveredAt: new Date().toISOString() };
}

export async function markConversationRead(
  viewerId: string,
  conversationId: string,
): Promise<{ peerId: string; lastReadMessageId: string | null; readAt: string; updatedCount: number; clearedUnread: boolean }> {
  const viewer = idOf(viewerId);
  const convId = idOf(conversationId);
  const { isMember, peerId } = await getConversationPeerId(viewer, convId);
  if (!isMember || !peerId) {
    throw new ChatError("Bạn không có quyền truy cập cuộc trò chuyện này.", 403);
  }

  const conn = await pool.getConnection();
  let lastReadMessageId: string | null = null;
  let updatedCount = 0;
  let clearedUnread = false;
  try {
    await conn.beginTransaction();
    const [latest] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM messages
        WHERE conversation_id = ? AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [convId],
    );
    lastReadMessageId = latest[0]?.id ? String(latest[0].id) : null;

    const [res] = await conn.query<ResultSetHeader>(
      `UPDATE messages
          SET read_at = NOW(6),
              delivered_at = COALESCE(delivered_at, NOW(6))
        WHERE conversation_id = ?
          AND sender_id <> ?
          AND read_at IS NULL
          AND deleted_at IS NULL`,
      [convId, viewer],
    );
    updatedCount = res.affectedRows;

    const [memberRes] = await conn.query<ResultSetHeader>(
      `UPDATE conversation_members
          SET unread_count = 0,
              last_read_message_id = COALESCE(?, last_read_message_id),
              last_read_at = NOW(6)
        WHERE conversation_id = ? AND user_id = ? AND unread_count > 0`,
      [lastReadMessageId, convId, viewer],
    );
    clearedUnread = memberRes.affectedRows > 0;
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  if (updatedCount > 0 || clearedUnread) {
    await markChatNotificationRead(viewer, convId);
  }

  return {
    peerId,
    lastReadMessageId,
    readAt: new Date().toISOString(),
    updatedCount,
    clearedUnread,
  };
}

export async function getAttachmentForMember(
  viewerId: string,
  attachmentId: string,
): Promise<{ storedFile: string; mimeType: string } | null> {
  const viewer = idOf(viewerId);
  const attId = idOf(attachmentId);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ma.stored_file, ma.mime_type
       FROM message_attachments ma
       JOIN messages m ON m.id = ma.message_id AND m.deleted_at IS NULL
       JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
      WHERE ma.id = ?
      LIMIT 1`,
    [viewer, attId],
  );
  if (!rows[0]) return null;
  return {
    storedFile: String(rows[0].stored_file),
    mimeType: String(rows[0].mime_type),
  };
}
