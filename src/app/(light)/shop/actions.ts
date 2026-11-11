"use server";

import { redirect } from "next/navigation";
import { addToWaitlist } from "@/lib/admin-stats";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function joinWaitlistAction(fd: FormData): Promise<void> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 255);
  if (!EMAIL_RE.test(email)) redirect("/shop?error=1");
  await addToWaitlist(email);
  redirect("/shop?joined=1");
}
