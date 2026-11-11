import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { CommunityError, UUID } from "./model";
export type FeedOrder = "newest" | "popular";
export type Cursor = { v: 1; order: FeedOrder; scope: string; at: string; expires: number; lastTime?: string; lastId?: string; remaining?: string[] };
export function feedScope(order: FeedOrder, q: string, topic: string, author: string): string { return createHash("sha256").update(JSON.stringify([order,q,topic,author])).digest("hex"); }
function sign(data: string): Buffer { const key = process.env.SESSION_SECRET; if (!key || key.length < 32) throw new Error("CURSOR_SECRET_UNAVAILABLE"); return createHmac("sha256", key).update("discovery-feed-v1:" + data).digest(); }
const TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/;
export function encodeCursor(value: Cursor): string { const data = Buffer.from(JSON.stringify(value)).toString("base64url"); return data + "." + sign(data).toString("base64url"); }
export function decodeCursor(value: string, scope: string, order: FeedOrder): Cursor {
  try {
    if (value.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const [data, signature] = value.split("."), actual = Buffer.from(signature,"base64url"), expected = sign(data);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
    const c = JSON.parse(Buffer.from(data,"base64url").toString()) as Cursor;
    if (c.v !== 1 || c.scope !== scope || c.order !== order || !TIME.test(c.at) || !Number.isSafeInteger(c.expires) || c.expires < Date.now()) throw Error();
    if (order === "newest" && (!c.lastTime || !TIME.test(c.lastTime) || !c.lastId || !UUID.test(c.lastId))) throw Error();
    if (order === "popular" && (!Array.isArray(c.remaining) || c.remaining.length > 60 || new Set(c.remaining).size !== c.remaining.length || !c.remaining.every(x => typeof x === "string" && UUID.test(x)))) throw Error();
    return c;
  } catch { throw new CommunityError("Trang tiếp theo đã hết hạn hoặc bộ lọc thay đổi. Hãy tải lại bảng tin."); }
}
