import { readFile } from "fs/promises";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessDocument, countDownload, getDocument } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { DOC_DIR } from "@/lib/uploads";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });

  const [doc, user] = await Promise.all([getDocument(id), getCurrentUser()]);
  if (!doc) return new Response("Not found", { status: 404 });

  if (!canAccessDocument(doc, user)) {
    // tài liệu dành cho thành viên: đưa tới trang đăng nhập thay vì báo lỗi
    if (!user && doc.access === "members" && doc.isPublished) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/resources/${id}`)}`, req.url));
    }
    return new Response("Not found", { status: 404 });
  }
  const owner = !!user && (user.id === doc.uploaderId || can(user.role, "content.manage"));
  if (!doc.canDownload && !owner) return new Response("Tài liệu này chỉ cho xem trực tuyến.", { status: 403 });

  try {
    const data = await readFile(path.join(/*turbopackIgnore: true*/ DOC_DIR, doc.storedFile));
    await countDownload(id);
    const name = doc.originalName || `tai-lieu.${doc.fileExt}`;
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="tai-lieu.${doc.fileExt}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
