import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Kiểm tra nội dung thật của file (không tin vào tên file hay Content-Type).
function detectImageExt(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpg";
  if (
    buf.length > 8 &&
    buf.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  )
    return "png";
  if (
    buf.length > 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  return null;
}

export class UploadError extends Error {}

/** Lưu ảnh và trả về tên file mới (dạng uuid.ext). */
export async function saveImage(
  file: File,
  maxBytes: number = MAX_IMAGE_BYTES
): Promise<string> {
  if (file.size > maxBytes) {
    throw new UploadError(`Ảnh quá lớn, tối đa ${Math.round(maxBytes / 1048576)}MB.`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = detectImageExt(buf);
  if (!ext) throw new UploadError("Chỉ nhận ảnh JPG, PNG hoặc WebP.");

  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name), buf);
  return name;
}

export const IMAGE_NAME_RE = /^[a-f0-9-]{36}(-th|-md)?\.(jpg|png|webp)$/;

export async function deleteImage(name: string | null): Promise<void> {
  if (!name || !IMAGE_NAME_RE.test(name)) return;
  try {
    await unlink(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name));
  } catch {
    // file không còn thì bỏ qua
  }
}

// ===== Bộ ảnh: bản gốc + thumbnail + medium (WebP) =====
export type SavedImageSet = {
  file: string;
  thumb: string | null;
  medium: string | null;
  width: number | null;
  height: number | null;
};

type SharpFn = (input: Buffer) => {
  metadata(): Promise<{ width?: number; height?: number }>;
  rotate(): { resize(o: { width: number; withoutEnlargement: boolean }): { webp(o: { quality: number }): { toBuffer(): Promise<Buffer> } } };
};

async function loadSharp(): Promise<SharpFn | null> {
  try {
    const mod = (await import("sharp")) as unknown as { default: SharpFn };
    return mod.default;
  } catch {
    return null; // chưa cài được sharp thì dùng ảnh gốc, website vẫn chạy bình thường
  }
}

export async function saveImageSet(file: File, maxBytes: number = MAX_IMAGE_BYTES): Promise<SavedImageSet> {
  const original = await saveImage(file, maxBytes);
  const base = original.replace(/\.(jpg|png|webp)$/, "");
  const out: SavedImageSet = { file: original, thumb: null, medium: null, width: null, height: null };
  const sharp = await loadSharp();
  if (!sharp) return out;
  try {
    const buf = await readFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, original));
    const meta = await sharp(buf).metadata();
    out.width = meta.width ?? null;
    out.height = meta.height ?? null;
    const make = async (suffix: string, width: number) => {
      const name = `${base}${suffix}.webp`;
      const data = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      await writeFile(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, name), data);
      return name;
    };
    out.thumb = await make("-th", 640);
    out.medium = await make("-md", 1800);
  } catch (err) {
    console.error("Không tạo được bản thu nhỏ:", err);
  }
  return out;
}

export async function deleteImageSet(...names: (string | null | undefined)[]): Promise<void> {
  for (const n of names) await deleteImage(n ?? null);
}

/** Ảnh đại diện: dùng bản thu nhỏ WebP nếu có sharp, nếu không thì lưu ảnh gốc. */
export async function saveAvatar(file: File): Promise<string> {
  const set = await saveImageSet(file, 3 * 1024 * 1024);
  if (set.thumb) {
    await deleteImage(set.file);
    return set.thumb;
  }
  return set.file;
}

// Profile-only strict decode/re-encode; existing photo/document pipelines stay unchanged.
export const PROFILE_COVER_DIR=path.join(/*turbopackIgnore: true*/ UPLOAD_DIR,"profile-covers");
export async function saveProfileImage(file:File,kind:"avatar"|"cover"):Promise<string>{
  if(kind!=="avatar"&&kind!=="cover")throw new UploadError("Loại ảnh hồ sơ không hợp lệ.");
  const max=kind==="avatar"?3*1024*1024:5*1024*1024;
  if(!(file instanceof File)||file.size===0||file.size>max)throw new UploadError(`Ảnh ${kind==="avatar"?"đại diện":"bìa"} tối đa ${max/1048576}MB.`);
  const data=Buffer.from(await file.arrayBuffer());if(!detectImageExt(data))throw new UploadError("Chỉ nhận ảnh JPG, PNG hoặc WebP hợp lệ.");
  let output:Buffer;try{const sharp=(await import("sharp")).default;const image=sharp(data,{limitInputPixels:25000000,animated:false}).rotate();output=await image.resize({width:kind==="avatar"?320:1800,height:kind==="avatar"?320:600,fit:"cover",withoutEnlargement:true}).webp({quality:82}).toBuffer();}catch{throw new UploadError("Không đọc được ảnh. Hãy chọn JPG, PNG hoặc WebP hợp lệ, tối đa 25 megapixel.");}
  const dir=kind==="cover"?PROFILE_COVER_DIR:UPLOAD_DIR;await mkdir(dir,{recursive:true});const fileName=`${randomUUID()}.webp`;await writeFile(path.join(/*turbopackIgnore: true*/ dir,fileName),output,{flag:"wx"});return fileName;
}

// ===== Tài liệu (PDF, Word, Excel, PowerPoint, zip, txt) =====
// Lưu trong thư mục riêng, không công khai: chỉ tải được qua /api/documents/[id]/download.
// Storage nằm ngoài build (Railway Volume): không trace cả dự án/secrets thành assets.
export const DOC_DIR = path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, "documents");
export const MAX_DOC_BYTES = 20 * 1024 * 1024;

type Magic = "pdf" | "zip" | "ole" | "txt";
const DOC_TYPES: Record<string, Magic> = {
  pdf: "pdf",
  docx: "zip",
  xlsx: "zip",
  pptx: "zip",
  zip: "zip",
  doc: "ole",
  xls: "ole",
  ppt: "ole",
  txt: "txt",
};

function matchesMagic(buf: Buffer, kind: Magic): boolean {
  switch (kind) {
    case "pdf":
      return buf.subarray(0, 4).toString("ascii") === "%PDF";
    case "zip":
      return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
    case "ole":
      return buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    case "txt":
      return !buf.subarray(0, 4096).includes(0);
  }
}

export type SavedDocument = {
  storedFile: string;
  ext: string;
  size: number;
  originalName: string;
};

export async function saveDocument(file: File): Promise<SavedDocument> {
  if (file.size > MAX_DOC_BYTES) throw new UploadError("File quá lớn, tối đa 20MB.");
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const kind = DOC_TYPES[ext];
  if (!kind) {
    throw new UploadError("Chỉ nhận PDF, Word, Excel, PowerPoint, zip hoặc txt.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!matchesMagic(buf, kind)) {
    throw new UploadError("Nội dung file không khớp với đuôi ." + ext);
  }
  await mkdir(DOC_DIR, { recursive: true });
  const storedFile = `${randomUUID()}.${ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ DOC_DIR, storedFile), buf);
  return {
    storedFile,
    ext,
    size: buf.length,
    originalName: file.name.replace(/[\\/\r\n"]/g, "_").slice(0, 200),
  };
}

export async function deleteDocumentFile(storedFile: string | null): Promise<void> {
  if (!storedFile || !/^[a-f0-9-]{36}\.[a-z]{2,4}$/.test(storedFile)) return;
  try {
    await unlink(path.join(/*turbopackIgnore: true*/ DOC_DIR, storedFile));
  } catch {
    // file không còn thì bỏ qua
  }
}
