"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createDocument, deleteDocument, updateDocument, type DocAccess, type DocInput, type DocKind } from "@/lib/documents";
import { deleteDocumentFile, saveDocument, UploadError } from "@/lib/uploads";
import { flag, qs, str, strOrNull } from "./helpers";

function refreshDocs() {
  revalidatePath("/resources", "layout");
  revalidatePath("/documents", "layout");
  revalidatePath("/admin/documents");
}

const kindOf = (v: string): DocKind => (v === "project" ? "project" : v === "resource" ? "resource" : "document");
const accessOf = (v: string): DocAccess => (v === "members" ? "members" : v === "private" ? "private" : "public");
const docInput = (fd: FormData): DocInput => ({
  kind: kindOf(str(fd, "kind", 10)), title: str(fd, "title", 200), description: strOrNull(fd, "description", 1000),
  isPublished: flag(fd, "isPublished"), access: accessOf(str(fd, "access", 10)), canDownload: flag(fd, "canDownload"),
  isFeatured: flag(fd, "isFeatured"), category: strOrNull(fd, "category", 60),
});

export async function uploadDocumentAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const title = str(fd, "title", 200);
  const file = fd.get("file");
  if (!title) redirect("/admin/documents" + qs("error", "Hãy nhập tiêu đề."));
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/documents" + qs("error", "Hãy chọn file cần đăng."));
  }

  let saved;
  try {
    saved = await saveDocument(file);
  } catch (err) {
    redirect("/admin/documents" + qs("error", err instanceof UploadError ? err.message : "Không lưu được file."));
  }

  await createDocument({
    ...docInput(fd),
    storedFile: saved.storedFile,
    originalName: saved.originalName,
    fileExt: saved.ext,
    fileSize: saved.size,
    uploaderId: user.id,
  });
  refreshDocs();
  redirect("/admin/documents" + qs("saved", "Đã đăng tài liệu."));
}

export async function updateDocumentAction(id: string, fd: FormData): Promise<void> {
  await requireAdmin();
  const title = str(fd, "title", 200);
  if (!title) redirect("/admin/documents" + qs("error", "Tiêu đề không được để trống."));
  await updateDocument(id, docInput(fd));
  refreshDocs();
}

export async function deleteDocumentAction(id: string): Promise<void> {
  await requireAdmin();
  const file = await deleteDocument(id);
  await deleteDocumentFile(file);
  await logActivity({ action: "document.delete", targetType: "document", targetId: id });
  refreshDocs();
}
