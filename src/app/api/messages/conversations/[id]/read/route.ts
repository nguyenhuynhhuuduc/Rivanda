import { getCurrentUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import { publishToUsers } from "@/lib/chat/realtime";
import { ChatError, markConversationRead } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Hãy đăng nhập." }, { status: 401, headers });
    const { id } = await ctx.params;

    const result = await markConversationRead(user.id, id);
    // Chỉ phát sự kiện realtime khi thực sự có tin nhắn hoặc unread_count vừa chuyển sang đã đọc
    if (result.updatedCount > 0 || result.clearedUnread) {
      publishToUsers([result.peerId, user.id], {
        type: "message:read",
        conversationId: id,
        lastReadMessageId: result.lastReadMessageId,
        readAt: result.readAt,
        byUserId: user.id,
      });
    }

    return Response.json({ ok: true, ...result }, { headers });
  } catch (e) {
    if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof CommunityError) return Response.json({ error: e.message }, { status: 400, headers });
    return Response.json({ error: "Không cập nhật được trạng thái đã đọc." }, { status: 503, headers });
  }
}
