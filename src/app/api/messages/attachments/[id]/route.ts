import { getCurrentUser } from "@/lib/auth";
import { CommunityError } from "@/lib/discovery-community/model";
import { readChatImage } from "@/lib/chat/attachments";
import { getAttachmentForMember } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    const { id } = await ctx.params;
    const record = await getAttachmentForMember(user.id, id);
    if (!record) return new Response("Not found", { status: 404 });

    const bytes = await readChatImage(record.storedFile);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Cache-Control": "private, max-age=3600",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof CommunityError) return new Response("Bad Request", { status: 400 });
    return new Response("Not found", { status: 404 });
  }
}
