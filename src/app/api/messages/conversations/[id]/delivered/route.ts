import { getCurrentUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import { publishToUsers } from "@/lib/chat/realtime";
import { ChatError, markConversationDelivered } from "@/lib/chat/store";

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

    const result = await markConversationDelivered(user.id, id);
    if (result && result.messageIds.length > 0) {
      publishToUsers([result.peerId], {
        type: "message:delivered",
        conversationId: id,
        messageIds: result.messageIds,
        deliveredAt: result.deliveredAt,
        byUserId: user.id,
      });
    }

    return Response.json({ ok: true, count: result?.messageIds.length ?? 0 }, { headers });
  } catch (e) {
    if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof CommunityError) return Response.json({ error: e.message }, { status: 400, headers });
    return Response.json({ error: "Không cập nhật được trạng thái đã nhận." }, { status: 503, headers });
  }
}
