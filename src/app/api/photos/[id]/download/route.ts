import { readFile } from "fs/promises";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPhoto, PUBLIC } from "@/lib/discovery";
import { UPLOAD_DIR } from "@/lib/uploads";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return new Response("Not found", { status: 404 });

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/journeystory/photos/${id}`)}`, req.url));
  }

  const photo = await getPhoto(id, PUBLIC);
  if (!photo || !photo.allowDownload) return new Response("Not found", { status: 404 });
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(photo.imageFile)) return new Response("Not found", { status: 404 });

  const ext = photo.imageFile.split(".").pop() ?? "jpg";
  try {
    const data = await readFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, photo.imageFile));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="anh-${id.slice(0, 8)}.${ext}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
