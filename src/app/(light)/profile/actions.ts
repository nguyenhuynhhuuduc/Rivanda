"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { toggleFollow } from "@/lib/community";
import { notify } from "@/lib/notifications";

export async function toggleFollowAction(targetId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/profile/${targetId}`)}`);
  const nowFollowing = await toggleFollow(user.id, targetId);
  if (nowFollowing) await notify(targetId, "follow", `${user.displayName} đã bắt đầu theo dõi bạn.`, `/profile/${user.id}`);
  revalidatePath(`/profile/${targetId}`);
}
