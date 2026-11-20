import { getCurrentUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import { deleteChatImage, saveChatImage, type SavedChatImage } from "@/lib/chat/attachments";
import { checkChatRateLimit, publishToUsers } from "@/lib/chat/realtime";
import { ChatError, listConversationMessages, sendDirectMessage } from "@/lib/chat/store";
import { notifyChatMessage } from "@/lib/notifications";
import { UploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Hãy đăng nhập." }, { status: 401, headers });
    const { id } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const before = searchParams.get("before");
    const limit = Number.parseInt(searchParams.get("limit") ?? "30", 10);

    const data = await listConversationMessages(user.id, id, {
      before,
      limit: Number.isFinite(limit) ? limit : 30,
    });
    return Response.json(data, { headers });
  } catch (e) {
    if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof CommunityError) return Response.json({ error: e.message }, { status: 400, headers });
    return Response.json({ error: "Chưa tải được lịch sử tin nhắn." }, { status: 503, headers });
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let savedImage: SavedChatImage | null = null;
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Hãy đăng nhập để gửi tin nhắn." }, { status: 401, headers });
    const { id } = await ctx.params;

    const msgRate = checkChatRateLimit(user.id, "message", 30, 60_000);
    if (!msgRate.ok) {
      return Response.json(
        { error: `Bạn gửi tin quá nhanh. Vui lòng thử lại sau ${msgRate.retryAfterSeconds} giây.` },
        { status: 429, headers },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    let bodyText = "";
    let clientMsgId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const fd = await request.formData();
      bodyText = String(fd.get("body") ?? "");
      const rawClientId = String(fd.get("clientMsgId") ?? "").trim();
      clientMsgId = rawClientId || null;
      const file = fd.get("image");
      if (file instanceof File && file.size > 0) {
        const upRate = checkChatRateLimit(user.id, "upload", 10, 60_000);
        if (!upRate.ok) {
          return Response.json(
            { error: `Bạn tải ảnh quá nhanh. Thử lại sau ${upRate.retryAfterSeconds} giây.` },
            { status: 429, headers },
          );
        }
        savedImage = await saveChatImage(file);
      }
    } else {
      let json: { body?: unknown; clientMsgId?: unknown };
      try {
        json = (await request.json()) as { body?: unknown; clientMsgId?: unknown };
      } catch {
        return Response.json({ error: "Dữ liệu tin nhắn không hợp lệ." }, { status: 400, headers });
      }
      bodyText = String(json.body ?? "");
      const rawClientId = String(json.clientMsgId ?? "").trim();
      clientMsgId = rawClientId || null;
    }

    const result = await sendDirectMessage(user.id, id, {
      body: bodyText,
      clientMsgId,
      attachment: savedImage,
    });

    if (result.deduplicated && savedImage) {
      // Nếu là request gửi trùng do reconnect, xóa ảnh mới thừa để tránh rác ổ đĩa
      await deleteChatImage(savedImage.storedFile);
    }

    if (!result.deduplicated) {
      // Đẩy sự kiện realtime ngay lập tức cho người nhận và các tab khác của người gửi
      publishToUsers([result.peerId, user.id], {
        type: "message:new",
        conversationId: id,
        message: result.message,
        senderName: user.displayName,
        senderAvatar: user.avatarUrl,
      });

      if (result.message.deliveredAt) {
        publishToUsers([user.id], {
          type: "message:delivered",
          conversationId: id,
          messageIds: [result.message.id],
          deliveredAt: result.message.deliveredAt,
          byUserId: result.peerId,
        });
      }

      // Đồng bộ vào hệ thống notifications hiện có (không tạo hệ thống thông báo thứ hai)
      await notifyChatMessage(
        result.peerId,
        user.displayName,
        result.message.body,
        id,
      );
    }

    return Response.json(
      { message: result.message, deduplicated: result.deduplicated },
      { status: result.deduplicated ? 200 : 201, headers },
    );
  } catch (e) {
    if (savedImage) {
      await deleteChatImage(savedImage.storedFile);
    }
    if (e instanceof UploadError) return Response.json({ error: e.message }, { status: 400, headers });
    if (e instanceof ChatError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof CommunityError) return Response.json({ error: e.message }, { status: 400, headers });
    return Response.json({ error: "Chưa gửi được tin nhắn. Vui lòng thử lại." }, { status: 503, headers });
  }
}
