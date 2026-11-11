import { readFile } from "fs/promises";
import path from "path";
import { UPLOAD_DIR } from "@/lib/uploads";
import { getCurrentUser } from "@/lib/auth";
import { imageAccess } from "@/lib/image-access";
import sharp from "sharp";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ file: string }> }
) {
  const { file } = await ctx.params;
  // Chỉ cho phép đúng định dạng tên do hệ thống tạo ra (chặn ../ và tên lạ).
  const m = /^[a-f0-9-]{36}(?:-th|-md)?\.(jpg|png|webp)$/.exec(file);
  if (!m) return new Response("Not found", { status: 404 });

  try {
    const access = await imageAccess(file, await getCurrentUser());
    if (!access.allowed) return new Response("Not found", { status: 404 });
    const data = await readFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file));
    const preview = access.previewOriginal
      ? await sharp(data).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
      : data;
    return new Response(new Uint8Array(preview), {
      headers: {
        "Content-Type": access.previewOriginal ? "image/webp" : TYPES[m[1]],
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
