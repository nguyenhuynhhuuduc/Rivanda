import { readFile } from "fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { getMedia } from "@/lib/discovery-community/read";
import { UUID } from "@/lib/discovery-community/model";
import { UPLOAD_DIR } from "@/lib/uploads";
import {pool} from "@/lib/db";
import {namespace,filePath} from "@/lib/discovery-community/files.cjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FILE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/i;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; if (!UUID.test(id)) return new Response(null, { status: 404 });
  try {
    const file = await getMedia(id, await getCurrentUser(), new URL(request.url).searchParams.get("size") === "thumb");
    if (!file || !FILE.test(file)) return new Response(null, { status: 404 });
    const root=await namespace(pool,UPLOAD_DIR,false);
    const bytes = await readFile(filePath(root,file));
    return new Response(bytes, { headers: { "Content-Type": "image/webp", "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Disposition": "inline" } });
  } catch { return new Response(null, { status: 404 }); }
}
