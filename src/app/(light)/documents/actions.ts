"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { toggleBookmark } from "@/lib/community";

export async function toggleDocBookmarkAction(docId: string): Promise<void> {
  const back = `/resources/${docId}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  await toggleBookmark(user.id, "document", docId);
  revalidatePath(back);
  revalidatePath("/account/saved");
}
