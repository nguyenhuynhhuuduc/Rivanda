import { getCurrentUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import { checkChatRateLimit, publishToUsers } from "@/lib/chat/realtime";
import { ChatError, getConversationPeerId } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Hãy đăng nhập." }, { status: 401, headers });
    const { id } = await ctx.params;

    const rate = checkChatRateLimit(user.id, "typing", 60, 60_000);
    if (!rate.ok) return Response.json({ ok: true }, { headers });

    const { isMember, peerId } = await getConversationPeerId(user.id, id);
    if (!isMember || !peerId) {
      return Response.json({ error: "Không có quyền truy cập." }, { status: 403, headers });
    }

    let typing = false;
    try {
      const body = (await request.json()) as { typing?: unknown };
      typing = body.typing === true;
    } catch {
      typing = false;
    }

    publishToUsers([peerId], typing
      ? { type: "typing:start", conversationId: id, userId: user.id, displayName: user.displayName }
      : { type: "typing:stop", conversationId: id, userId: user.id });

    return Response.json({ ok: true }, { headers });
  } catch (e) {
    if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof CommunityError) return Response.json({ error: e.message }, { status: 400, headers });
    return Response.json({ ok: false }, { status: 500, headers });
  }
}
