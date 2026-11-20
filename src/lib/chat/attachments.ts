import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, UploadError } from "@/lib/uploads";

export const CHAT_ATTACH_DIR = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, "chat-attachments");
export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_CHAT_IMAGE_PIXELS = 16_000_000; // 16MP
export const CHAT_ATTACH_FILE_RE = /^[a-f0-9-]{36}\.webp$/;

function hasValidImageMagic(buf: Buffer): boolean {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (
    buf.length > 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return true;
  }
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return true;
  }
  return false;
}

export type SavedChatImage = {
  storedFile: string;
  mimeType: "image/webp";
  fileSize: number;
  width: number | null;
  height: number | null;
};

export async function saveChatImage(file: File): Promise<SavedChatImage> {
  if (!(file instanceof File) || file.size === 0) {
    throw new UploadError("Vui lòng chọn một tệp ảnh hợp lệ.");
  }
  if (file.size > MAX_CHAT_IMAGE_BYTES) {
    throw new UploadError("Ảnh đính kèm tối đa 5MB.");
  }

  const raw = Buffer.from(await file.arrayBuffer());
  if (!hasValidImageMagic(raw)) {
    throw new UploadError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP hợp lệ.");
  }

  let output: Buffer;
  let width: number | null = null;
  let height: number | null = null;
  try {
    const sharp = (await import("sharp")).default;
    const processed = await sharp(raw, {
      limitInputPixels: MAX_CHAT_IMAGE_PIXELS,
      animated: false,
    })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    output = processed.data;
    width = processed.info.width ?? null;
    height = processed.info.height ?? null;
  } catch {
    throw new UploadError("Không thể xử lý ảnh. Chỉ nhận JPG, PNG hoặc WebP tĩnh, tối đa 16 triệu pixel.");
  }

  await mkdir(CHAT_ATTACH_DIR, { recursive: true });
  const storedFile = `${randomUUID()}.webp`;
  await writeFile(path.join(/*turbopackIgnore: true*/ CHAT_ATTACH_DIR, storedFile), output, { flag: "wx" });

  return {
    storedFile,
    mimeType: "image/webp",
    fileSize: output.length,
    width,
    height,
  };
}

export async function readChatImage(storedFile: string): Promise<Buffer> {
  if (!CHAT_ATTACH_FILE_RE.test(storedFile)) {
    throw new UploadError("Tên tệp đính kèm không hợp lệ.");
  }
  const target = path.join(/*turbopackIgnore: true*/ CHAT_ATTACH_DIR, storedFile);
  return readFile(target);
}

export async function deleteChatImage(storedFile: string | null | undefined): Promise<void> {
  if (!storedFile || !CHAT_ATTACH_FILE_RE.test(storedFile)) return;
  try {
    await unlink(path.join(/*turbopackIgnore: true*/ CHAT_ATTACH_DIR, storedFile));
  } catch {
    // Bỏ qua nếu tệp không tồn tại
  }
}
