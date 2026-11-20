import { getCurrentUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import {
  ChatError,
  chatSchemaReady,
  getOrCreateDirectConversation,
  listUserConversations,
  totalUnreadMessages,
} from "@/lib/chat/store";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Hãy đăng nhập để xem tin nhắn." }, { status: 401, headers });
    if (!(await chatSchemaReady())) {
      return Response.json({ error: "Hệ thống tin nhắn chưa sẵn sàng trên cơ sở dữ liệu." }, { status: 503, headers });
    }
    const [conversations, unreadTotal] = await Promise.all([
      listUserConversations(user.id),
      totalUnreadMessages(user.id),
    ]);
    return Response.json({ conversations, unreadTotal }, { headers });
  } catch (e) {
    if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof CommunityError) return Response.json({ error: e.message }, { status: 400, headers });
    return Response.json({ error: "Chưa tải được danh sách cuộc trò chuyện." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Hãy đăng nhập để nhắn tin." }, { status: 401, headers });
    if (!(await chatSchemaReady())) {
      return Response.json({ error: "Hệ thống tin nhắn chưa sẵn sàng trên cơ sở dữ liệu." }, { status: 503, headers });
    }
    let body: { peerUserId?: unknown };
    try {
      body = (await request.json()) as { peerUserId?: unknown };
    } catch {
      return Response.json({ error: "Dữ liệu không hợp lệ." }, { status: 400, headers });
    }
    const peerUserId = String(body.peerUserId ?? "").trim();
    const conversation = await getOrCreateDirectConversation(user.id, peerUserId);
    return Response.json({ conversation }, { headers });
  } catch (e) {
    if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof CommunityError) return Response.json({ error: e.message }, { status: 400, headers });
    return Response.json({ error: "Chưa thể mở cuộc trò chuyện lúc này." }, { status: 503, headers });
  }
}
