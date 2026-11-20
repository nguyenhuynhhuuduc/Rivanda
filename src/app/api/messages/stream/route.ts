import { getCurrentUser } from "@/lib/auth";
import { subscribeUserStream, type ChatRealtimeEvent } from "@/lib/chat/realtime";
import { recordHeartbeat } from "@/lib/discovery-community/presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Hãy đăng nhập để kết nối realtime." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const sendRaw = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
          cleanup?.();
        }
      };

      const sendEvent = (event: ChatRealtimeEvent) => {
        sendRaw(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const { unsubscribe } = subscribeUserStream(user.id, sendEvent);
      // recordHeartbeat tự phát presence:online đúng 1 lần khi chuyển từ offline -> online
      recordHeartbeat(user.id);

      // Gửi sự kiện connected ngay khi mở luồng để client cập nhật trạng thái tức thì
      sendRaw(`retry: 3000\nevent: connected\ndata: ${JSON.stringify({ userId: user.id, at: new Date().toISOString() })}\n\n`);

      const keepalive = setInterval(() => {
        recordHeartbeat(user.id);
        sendRaw(`: keepalive ${Date.now()}\n\n`);
      }, 25_000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        const { remaining } = unsubscribe();
        if (remaining === 0) {
          // Không cưỡng bức offline ngay khi reload trang vì có thể mở tab khác hoặc vừa F5;
          // PresenceHeartbeat vẫn dùng pagehide/logout + TTL 75s để chính xác.
          recordHeartbeat(user.id);
        }
        try {
          controller.close();
        } catch {
          // Stream đã đóng
        }
      };

      request.signal.addEventListener("abort", () => {
        cleanup?.();
      });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      Vary: "Cookie",
    },
  });
}
