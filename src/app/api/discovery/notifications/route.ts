import { getCurrentUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import { notificationPage } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Hãy đăng nhập để xem thông báo." }, { status: 401, headers });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = Number.parseInt(searchParams.get("limit") ?? "7", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(10, rawLimit)) : 7;

    const data = await notificationPage(user.id, undefined, limit);
    return Response.json(
      {
        items: data.items.map((item) => ({
          id: item.id,
          type: item.type,
          message: item.message,
          link: item.link,
          isRead: item.isRead,
          createdAt: new Date(item.createdAt).toISOString(),
          actorName: item.actorName ?? null,
          actorAvatar: item.actorAvatar ?? null,
        })),
        unread: data.unread,
        ready: data.ready,
      },
      { headers },
    );
  } catch (e) {
    if (e instanceof CommunityError) {
      return Response.json({ error: e.message }, { status: 400, headers });
    }
    return Response.json({ error: "Chưa tải được thông báo. Vui lòng thử lại." }, { status: 503, headers });
  }
}
