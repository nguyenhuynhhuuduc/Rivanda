"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requirePermission } from "@/lib/auth";
import { getHomeSettings, moveSection, setSectionEnabled, updateHomeSettings } from "@/lib/settings";
import { saveImage, UploadError } from "@/lib/uploads";

function text(formData: FormData, key: string, max: number): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

// Link ngoài phải là http(s) để tránh javascript: và các dạng nguy hiểm khác.
function safeUrl(v: string): string {
  if (!v) return "";
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

// Nút chính: link nội bộ (/discovery) hoặc https://...
function safeHref(v: string): string {
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  return safeUrl(v) || "/";
}

export async function saveHomeAction(formData: FormData) {
  const user = await requirePermission("settings.manage"); // Server Action là API công khai, phải kiểm tra quyền ở đây

  const current = await getHomeSettings();
  let heroImage = current.heroImage;

  const file = formData.get("heroImage");
  const removeImage = formData.get("removeImage") === "on";

  try {
    if (removeImage) {
      heroImage = null;
    } else if (file instanceof File && file.size > 0) {
      const saved = await saveImage(file);
      heroImage = saved;
    }
  } catch (err) {
    const msg =
      err instanceof UploadError ? err.message : "Không lưu được ảnh.";
    redirect(`/admin/home?error=${encodeURIComponent(msg)}`);
  }

  // Giữ file cũ để không mất ảnh khi DB lỗi hoặc hai admin cập nhật đồng thời.
  // Việc dọn file không còn tham chiếu cần quy trình riêng sau backup, không tự xóa ở đây.
  await updateHomeSettings({
    siteName: text(formData, "siteName", 60) || current.siteName,
    badgeText: text(formData, "badgeText", 120),
    heroTitle: text(formData, "heroTitle", 160) || current.heroTitle,
    heroSubtitle: text(formData, "heroSubtitle", 400),
    ctaLabel: text(formData, "ctaLabel", 40) || current.ctaLabel,
    ctaHref: safeHref(text(formData, "ctaHref", 200)),
    heroImage,
    instagramUrl: safeUrl(text(formData, "instagramUrl", 255)),
    xUrl: safeUrl(text(formData, "xUrl", 255)),
    facebookUrl: safeUrl(text(formData, "facebookUrl", 255)),
    aboutText: String(formData.get("aboutText") ?? "").trim().slice(0, 4000),
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(formData, "contactEmail", 255)) ? text(formData, "contactEmail", 255) : "",
  });
  await logActivity({ userId: user.id, action: "home.update" });

  revalidatePath("/", "layout");
  redirect("/admin/home?saved=1");
}

export async function moveSectionAction(key: string, dir: "up" | "down"): Promise<void> {
  await requirePermission("settings.manage");
  await moveSection(key, dir);
  revalidatePath("/", "layout");
  revalidatePath("/admin/home");
}

export async function toggleSectionAction(key: string, enabled: boolean): Promise<void> {
  await requirePermission("settings.manage");
  await setSectionEnabled(key, enabled);
  revalidatePath("/", "layout");
  revalidatePath("/admin/home");
}
