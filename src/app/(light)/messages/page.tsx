import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MessagesWorkspace } from "@/components/messages/MessagesWorkspace";
import {
  ChatError,
  chatSchemaReady,
  getOrCreateDirectConversation,
  listConversationMessages,
  listUserConversations,
} from "@/lib/chat/store";
import type { ChatMessageDTO } from "@/lib/chat/realtime";
import { listMutualFollowPresence, recordHeartbeat } from "@/lib/discovery-community/presence";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tin nhắn",
  description: "Trò chuyện trực tiếp thời gian thực cùng bạn bè trên Rivanda.",
  robots: { index: false, follow: false },
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; to?: string }>;
}) {
  const user = await requireUser("/messages");
  const sp = await searchParams;
  recordHeartbeat(user.id);

  const ready = await chatSchemaReady();
  if (!ready) {
    return (
      <section className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-3xl font-bold">Tin nhắn chưa sẵn sàng</h1>
        <p className="mt-3 text-sm text-muted">
          Hệ thống cơ sở dữ liệu nhắn tin chưa được kích hoạt trên môi trường này.
        </p>
        <Link href="/discovery" className="mt-6 inline-block text-sm text-link underline underline-offset-4">
          Quay về Community →
        </Link>
      </section>
    );
  }

  let initialOpenError = "";
  let requestedConvId = sp.c && /^[a-f0-9-]{36}$/i.test(sp.c) ? sp.c : null;

  if (!requestedConvId && sp.to && /^[a-f0-9-]{36}$/i.test(sp.to)) {
    try {
      const created = await getOrCreateDirectConversation(user.id, sp.to);
      requestedConvId = created.id;
    } catch (e) {
      initialOpenError =
        e instanceof ChatError
          ? e.message
          : "Không thể mở cuộc trò chuyện với thành viên này.";
    }
  }

  const [conversations, mutualPresence] = await Promise.all([
    listUserConversations(user.id),
    listMutualFollowPresence(user.id).catch(() => ({
      onlineCount: 0,
      totalCount: 0,
      ttlSeconds: 75,
      users: [],
    })),
  ]);

  const activeId =
    requestedConvId && conversations.some((c) => c.id === requestedConvId)
      ? requestedConvId
      : conversations[0]?.id ?? null;

  let initialMessages: ChatMessageDTO[] = [];
  let initialNextBefore: string | null = null;
  let initialHasMore = false;

  if (activeId) {
    try {
      const history = await listConversationMessages(user.id, activeId, { limit: 30 });
      initialMessages = history.messages;
      initialNextBefore = history.nextBefore;
      initialHasMore = history.hasMore;
    } catch {
      initialOpenError = "Chưa tải được lịch sử tin nhắn.";
    }
  }

  return (
    <MessagesWorkspace
      currentUserId={user.id}
      initialConversations={conversations}
      initialMutualFriends={mutualPresence.users}
      initialActiveId={activeId}
      initialMessages={initialMessages}
      initialNextBefore={initialNextBefore}
      initialHasMore={initialHasMore}
      initialOpenError={initialOpenError}
    />
  );
}
