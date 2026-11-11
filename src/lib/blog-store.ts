import { randomUUID } from "crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { pool } from "./db";
import { slugify } from "./slug";
import { readMinutes } from "./format";
import { requireBlogFoundation } from "./blog-read";
import { blogId, blogRevision, blogText, BlogError, validateBlogInput, type BlogActor, type BlogInput } from "./blog-policy";

async function transaction<T>(work: (tx: PoolConnection) => Promise<T>): Promise<T> {
  await requireBlogFoundation();
  const tx = await pool.getConnection();
  try { await tx.beginTransaction(); const value = await work(tx); await tx.commit(); return value; }
  catch (error) { await tx.rollback(); throw error; }
  finally { tx.release(); }
}
async function lockActor(tx: PoolConnection, actor: BlogActor, admin = false): Promise<BlogActor> {
  const [rows] = await tx.query<RowDataPacket[]>("SELECT id, role, is_active FROM users WHERE id=? FOR UPDATE", [blogId(actor.id)]);
  if (!rows[0]?.is_active || (admin && rows[0].role !== "admin")) throw new BlogError("Bạn không có quyền thực hiện thao tác này.");
  return { id: rows[0].id, role: rows[0].role };
}
async function quota(tx: PoolConnection, actor: BlogActor, kind: "blog_submit" | "media_upload", max: number): Promise<void> {
  if (actor.role === "admin") return;
  const window = new Date(Math.floor(Date.now() / 900_000) * 900_000);
  await tx.query("INSERT INTO content_rate_buckets(user_id,action_kind,window_start,hits) VALUES(?,?,?,1) ON DUPLICATE KEY UPDATE hits=hits+1", [actor.id, kind, window]);
  const [rows] = await tx.query<RowDataPacket[]>("SELECT hits FROM content_rate_buckets WHERE user_id=? AND action_kind=? AND window_start=? FOR UPDATE", [actor.id, kind, window]);
  if (Number(rows[0].hits) > max) throw new BlogError("Bạn thao tác quá nhanh. Hãy thử lại sau tối đa 15 phút.");
}
export async function reserveBlogUpload(actor: BlogActor): Promise<void> {
  await transaction(async (tx) => { const user = await lockActor(tx, actor); await quota(tx, user, "media_upload", 6); });
}
async function lockPost(tx: PoolConnection, id: string, actor: BlogActor, expected: number) {
  const [rows] = await tx.query<RowDataPacket[]>("SELECT p.id,p.author_id,p.status,b.revision,b.workflow_state,b.topic_id FROM posts p LEFT JOIN blog_post_details b ON b.post_id=p.id WHERE p.id=? AND p.type='blog' FOR UPDATE", [blogId(id)]);
  const row = rows[0];
  if (!row || (actor.role !== "admin" && row.author_id !== actor.id) || row.workflow_state === "deleted") throw new BlogError("Không tìm thấy bài viết thuộc quyền quản lý của bạn.");
  if (Number(row.revision ?? 1) !== blogRevision(expected)) throw new BlogError("Bài đã thay đổi. Hãy tải lại để tránh ghi đè phiên bản mới.");
  if (row.revision === null) {
    await tx.query("INSERT INTO blog_post_details(post_id,workflow_state) VALUES(?,?)", [id, row.status]);
  }
  return row;
}
async function event(tx: PoolConnection, id: string, actor: BlogActor, revision: number, decision: string, note: string | null = null) {
  await tx.query("INSERT INTO blog_review_events(id,post_id,actor_id,revision,decision,note) VALUES(?,?,?,?,?,?)", [randomUUID(), id, actor.id, revision, decision, note]);
}
export async function saveBlog(actor: BlogActor, raw: BlogInput, id?: string, expected?: number): Promise<string> {
  const input = validateBlogInput(raw);
  return transaction(async (tx) => {
    const user = await lockActor(tx, actor);
    if (input.intent === "publish" && user.role !== "admin") throw new BlogError("Chỉ Admin được xuất bản trực tiếp.");
    await quota(tx, user, "blog_submit", 20);
    const current = id ? await lockPost(tx, id, user, blogRevision(expected)) : null;
    if (input.intent !== "draft" && user.role !== "admin" && !input.topicId) throw new BlogError("Hãy chọn chủ đề trước khi gửi duyệt.");
    if (input.topicId) {
      const [topics] = await tx.query<RowDataPacket[]>("SELECT id,is_visible,deleted_at FROM blog_topics WHERE id=? FOR UPDATE", [input.topicId]);
      const topic = topics[0];
      if (!topic || topic.deleted_at || (!topic.is_visible && user.role !== "admin" && (input.intent !== "draft" || current?.topic_id !== input.topicId))) throw new BlogError("Chủ đề không khả dụng. Hãy chọn chủ đề khác.");
    }
    const postId = id ?? randomUUID(), state = input.intent === "publish" ? "published" : input.intent === "submit" ? "pending" : "draft";
    if (!id) {
      const slug = `${slugify(input.title, "bai-viet").slice(0, 100)}-${postId.slice(0, 8)}`;
      await tx.query("INSERT INTO posts(id,type,title,slug,summary,content,cover_file,section,read_minutes,status,author_id,published_at) VALUES(?,'blog',?,?,?,?,?,'article',?,?,?,?)",
        [postId, input.title, slug, input.summary || null, input.content, input.coverFile ?? null, readMinutes(input.content), state === "published" ? "published" : "draft", user.id, state === "published" ? new Date() : null]);
      await tx.query("INSERT INTO blog_post_details(post_id,topic_id,workflow_state) VALUES(?,?,?)", [postId, input.topicId, state]);
    } else {
      // Both ownership and type are repeated in SQL; slug/author/category never come from the form.
      const coverSql = input.coverFile === undefined ? "" : ",cover_file=?";
      await tx.query(`UPDATE posts SET title=?,summary=?,content=?,read_minutes=?,status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,NOW()) ELSE published_at END${coverSql} WHERE id=? AND type='blog'${user.role === "admin" ? "" : " AND author_id=?"}`,
        [input.title, input.summary || null, input.content, readMinutes(input.content), state === "published" ? "published" : "draft", state, ...(input.coverFile === undefined ? [] : [input.coverFile]), id, ...(user.role === "admin" ? [] : [user.id])]);
      await tx.query("UPDATE blog_post_details SET topic_id=?,workflow_state=?,revision=revision+1,reviewed_revision=NULL,reviewed_by=NULL,reviewed_at=NULL,review_note=NULL WHERE post_id=? AND revision=?", [input.topicId, state, id, expected]);
    }
    await tx.query("DELETE FROM post_tags WHERE post_id=?", [postId]);
    // Stable lock order avoids tag deadlocks when multiple authors save together.
    for (const name of [...input.tags].sort((a, b) => slugify(a).localeCompare(slugify(b)))) {
      const slug = slugify(name, "tag").slice(0, 60);
      await tx.query("INSERT INTO tags(name,slug) VALUES(?,?) ON DUPLICATE KEY UPDATE name=name", [name, slug]);
      const [tags] = await tx.query<RowDataPacket[]>("SELECT id FROM tags WHERE slug=?", [slug]);
      await tx.query("INSERT IGNORE INTO post_tags(post_id,tag_id) VALUES(?,?)", [postId, tags[0].id]);
    }
    const revision = current ? Number(expected) + 1 : 1;
    if (state === "published") {
      await tx.query("UPDATE blog_post_details SET reviewed_revision=?,reviewed_by=?,reviewed_at=NOW() WHERE post_id=?", [revision, user.id, postId]);
      await event(tx, postId, user, revision, "approved");
    } else if (state === "pending") await event(tx, postId, user, revision, "submitted");
    return postId;
  });
}
export async function deleteBlog(actor: BlogActor, id: string, revision: number): Promise<void> {
  await transaction(async (tx) => {
    const user = await lockActor(tx, actor); await lockPost(tx, id, user, revision);
    await tx.query("UPDATE posts SET status='draft' WHERE id=? AND type='blog'", [id]);
    await tx.query("UPDATE blog_post_details SET workflow_state='deleted',deleted_at=NOW(),revision=revision+1 WHERE post_id=? AND revision=?", [id, revision]);
    await event(tx, id, user, revision + 1, "deleted");
  });
}
export async function reviewBlog(actor: BlogActor, id: string, revision: number, decision: unknown, rawNote: unknown): Promise<void> {
  if (typeof decision !== "string" || !["approve", "reject", "hide"].includes(decision)) throw new BlogError("Quyết định không hợp lệ.");
  const note = blogText(rawNote, 500, decision === "reject");
  await transaction(async (tx) => {
    const admin = await lockActor(tx, actor, true), post = await lockPost(tx, id, admin, revision);
    const oldState = post.workflow_state ?? post.status;
    if (oldState !== (decision === "hide" ? "published" : "pending")) throw new BlogError("Trạng thái bài đã thay đổi; hãy tải lại.");
    const state = decision === "approve" ? "published" : decision === "reject" ? "rejected" : "hidden";
    await tx.query("UPDATE posts SET status=?,published_at=CASE WHEN ?='published' THEN COALESCE(published_at,NOW()) ELSE published_at END WHERE id=? AND type='blog'", [state === "published" ? "published" : "draft", state, id]);
    await tx.query("UPDATE blog_post_details SET workflow_state=?,revision=revision+1,reviewed_revision=?,reviewed_by=?,reviewed_at=NOW(),review_note=? WHERE post_id=? AND revision=?", [state, revision + 1, admin.id, note || null, id, revision]);
    await event(tx, id, admin, revision + 1, decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "hidden", note || null);
  });
}
export async function saveBlogTopic(actor: BlogActor, input: { name: string; sortOrder: number; isVisible: boolean; slug?: string }, id?: string): Promise<void> {
  const name = blogText(input.name, 100, true);
  if (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 10000 || typeof input.isVisible !== "boolean") throw new BlogError("Thứ tự hoặc trạng thái chủ đề không hợp lệ.");
  await transaction(async (tx) => {
    await lockActor(tx, actor, true);
    if (id) {
      const [rows] = await tx.query<RowDataPacket[]>("SELECT id FROM blog_topics WHERE id=? AND deleted_at IS NULL FOR UPDATE", [blogId(id)]);
      if (!rows.length) throw new BlogError("Không tìm thấy chủ đề.");
      await tx.query("UPDATE blog_topics SET name=?,sort_order=?,is_visible=? WHERE id=?", [name, input.sortOrder, input.isVisible ? 1 : 0, id]);
    } else {
      const slug = input.slug || slugify(name, "chu-de");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) throw new BlogError("Slug chủ đề không hợp lệ.");
      await tx.query("INSERT INTO blog_topics(id,name,slug,sort_order,is_visible) VALUES(?,?,?,?,?)", [randomUUID(), name, slug, input.sortOrder, input.isVisible ? 1 : 0]);
    }
  });
}
export async function deleteBlogTopic(actor: BlogActor, id: string): Promise<void> {
  await transaction(async (tx) => { await lockActor(tx, actor, true); await tx.query("UPDATE blog_topics SET is_visible=0,deleted_at=COALESCE(deleted_at,NOW()) WHERE id=?", [blogId(id)]); });
}
