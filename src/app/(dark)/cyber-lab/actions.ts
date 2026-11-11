"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { toggleBookmark } from "@/lib/community";

export async function togglePostBookmarkAction(postId: string, backTo: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(backTo)}`);
  await toggleBookmark(user.id, "post", postId);
  revalidatePath(backTo);
  revalidatePath("/account/saved");
}
