import { getCurrentUser } from "@/lib/auth";
import { totalUnreadMessages } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Hãy đăng nhập." }, { status: 401, headers });
    const unread = await totalUnreadMessages(user.id);
    return Response.json({ unread }, { headers });
  } catch {
    return Response.json({ error: "Chưa tải được số tin nhắn chưa đọc." }, { status: 503, headers });
  }
}
