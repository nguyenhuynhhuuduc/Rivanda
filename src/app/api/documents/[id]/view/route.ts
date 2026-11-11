import { readFile } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { canAccessDocument, getDocument } from "@/lib/documents";
import { DOC_DIR } from "@/lib/uploads";

// Xem PDF trực tuyến (không ép tải về). Chỉ hỗ trợ PDF.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [doc, user] = await Promise.all([getDocument(id), getCurrentUser()]);
  if (!doc || doc.fileExt !== "pdf" || !canAccessDocument(doc, user)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(/*turbopackIgnore: true*/ DOC_DIR, doc.storedFile));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
