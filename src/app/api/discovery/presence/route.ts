import { getCurrentUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import {
  listMutualFollowPresence,
  markOffline,
  ONLINE_TTL_MS,
  recordHeartbeat,
} from "@/lib/discovery-community/presence";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Hãy đăng nhập để xem bạn bè đang hoạt động." }, { status: 401, headers });
    }
    recordHeartbeat(user.id);
    const data = await listMutualFollowPresence(user.id);
    return Response.json(data, { headers });
  } catch (e) {
    if (e instanceof CommunityError) {
      return Response.json({ error: e.message }, { status: 400, headers });
    }
    return Response.json({ error: "Chưa tải được trạng thái hoạt động." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Hãy đăng nhập." }, { status: 401, headers });
    }

    let status: "online" | "offline" = "online";
    try {
      const text = await request.text();
      if (text) {
        const body = JSON.parse(text) as { status?: unknown };
        if (body?.status === "offline") status = "offline";
      }
    } catch {
      // Bỏ qua payload rỗng hoặc không phải JSON; mặc định là heartbeat online
    }

    if (status === "offline") {
      markOffline(user.id);
    } else {
      recordHeartbeat(user.id);
    }

    return Response.json(
      { ok: true, status, ttlSeconds: Math.round(ONLINE_TTL_MS / 1000) },
      { headers },
    );
  } catch {
    return Response.json({ error: "Không cập nhật được trạng thái." }, { status: 503, headers });
  }
}
