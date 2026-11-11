import sharp from "sharp";
import { saveImage } from "./uploads";
import { BlogError } from "./blog-policy";

/** Decode before writing; cover is re-encoded without EXIF and never a user filename. */
export async function saveBlogCover(file: File): Promise<string> {
  if (file.size < 1 || file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new BlogError("Ảnh bìa phải là JPG/PNG/WebP, tối đa 5MB.");
  try {
    const source = Buffer.from(await file.arrayBuffer());
    const image = sharp(source, { limitInputPixels: 24_000_000, animated: false });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || !meta.width || !meta.height || meta.width > 10000 || meta.height > 10000 || (meta.pages ?? 1) > 1) throw new Error("INVALID_IMAGE");
    const output = await image.rotate().resize({ width: 1800, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    return await saveImage(new File([new Uint8Array(output)], "cover.webp", { type: "image/webp" }));
  } catch { throw new BlogError("Không xử lý được ảnh bìa. Hãy chọn ảnh tĩnh hợp lệ, tối đa 24 triệu pixel."); }
}
