import { adminBtn, adminInput, Card, Field } from "./ui";
import { savePostAction } from "@/app/admin/post-actions";
import { CATEGORIES, SECTIONS } from "@/lib/cyber-lab";
import type { Post, PostType } from "@/lib/posts";

export function PostForm({ post, defaultType }: { post?: Post; defaultType?: PostType }) {
  const type = post?.type ?? defaultType ?? "blog";
  return (
    <form action={savePostAction} className="space-y-6">
      {post && <input type="hidden" name="id" value={post.id} />}

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Loại bài">
            <select name="type" defaultValue={type} className={adminInput}>
              <option value="blog">Blog (hiện ở Documents)</option>
              <option value="hacking">Cyber Lab</option>
            </select>
          </Field>
          <Field label="Trạng thái">
            <select name="status" defaultValue={post?.status ?? "draft"} className={adminInput}>
              <option value="draft">Bản nháp (chưa hiện với người xem)</option>
              <option value="published">Đăng công khai</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Tiêu đề">
              <input name="title" defaultValue={post?.title} required maxLength={200} className={adminInput} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Mô tả ngắn (hiện ở danh sách bài)">
              <textarea name="summary" defaultValue={post?.summary ?? ""} rows={2} maxLength={500} className={adminInput} />
            </Field>
          </div>
          <Field label="Thẻ (cách nhau bằng dấu phẩy)">
            <input name="tags" defaultValue={post?.tags.map((t) => t.name).join(", ")} placeholder="Web, CTF, Công cụ" className={adminInput} />
          </Field>
          <Field label="Mục của Cyber Lab (chỉ dùng cho bài Cyber Lab)">
            <select name="section" defaultValue={post?.section ?? "article"} className={adminInput}>
              <option value="article">Bài viết chung</option>
              {Object.values(SECTIONS).map((x) => <option key={x.section} value={x.section}>{x.label}</option>)}
            </select>
          </Field>
          <Field label="Chuyên mục (chỉ dùng cho bài Cyber Lab)">
            <select name="category" defaultValue={post?.category ?? ""} className={adminInput}>
              <option value="">Không chọn</option>
              {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Độ khó (chỉ dùng cho bài Cyber Lab)">
            <select name="difficulty" defaultValue={post?.difficulty ?? ""} className={adminInput}>
              <option value="">Không ghi</option>
              <option value="beginner">Cơ bản</option>
              <option value="intermediate">Trung bình</option>
              <option value="advanced">Nâng cao</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Ảnh bìa (không bắt buộc)">
        {post?.coverFile && (
          <div className="mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/uploads/${post.coverFile}`} alt="Ảnh bìa hiện tại" className="max-h-40 rounded-lg" />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeCover" /> Xóa ảnh bìa hiện tại
            </label>
          </div>
        )}
        <input
          type="file"
          name="cover"
          accept="image/jpeg,image/png,image/webp"
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:text-white hover:file:bg-navy-deep"
        />
        <p className="mt-2 text-xs text-muted">JPG, PNG hoặc WebP, tối đa 5MB.</p>
      </Card>

      <Card title="Nội dung">
        <p className="mb-3 text-sm text-muted">
          Viết bằng Markdown: <code># Tiêu đề</code>, <code>**đậm**</code>, <code>- danh sách</code>,{" "}
          <code>[chữ](https://link)</code>, <code>![mô tả](https://link-anh)</code>, khối mã bằng ba dấu <code>`</code>.
        </p>
        <textarea
          name="content"
          defaultValue={post?.content}
          required
          rows={24}
          className={`${adminInput} font-mono leading-relaxed`}
        />
      </Card>

      <button className={adminBtn}>Lưu bài viết</button>
    </form>
  );
}
