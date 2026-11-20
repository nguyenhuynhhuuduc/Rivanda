import Link from "next/link";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MarkdownEditorField } from "@/components/admin/MarkdownEditorField";
import { inputCls, btnPrimary, btnOutline } from "@/components/ui/kit";
import { BLOG_STATE_LABEL, type BlogTopic } from "@/lib/blog-policy";
import type { BlogRecord } from "@/lib/blog-read";
import { deleteBlogAction, saveBlogAction } from "@/app/(light)/account/blog/actions";

export function BlogEditor({ record, topics, admin = false }: { record?: BlogRecord; topics: BlogTopic[]; admin?: boolean }) {
  const post = record?.post;
  return <div className="space-y-6">
    {record && <p className="break-words rounded-lg border border-line bg-card p-4 text-sm">{BLOG_STATE_LABEL[record.state]} · Phiên bản {record.revision}{record.reviewNote ? ` · ${record.reviewNote}` : ""}</p>}
    <form action={saveBlogAction} className="space-y-5">
      {record && <><input type="hidden" name="id" value={post?.id} /><input type="hidden" name="revision" value={record.revision} /></>}
      <label className="block text-sm">Tiêu đề<input name="title" required maxLength={200} defaultValue={post?.title} className={`${inputCls} mt-2`} /></label>
      <label className="block text-sm">Chủ đề<select name="topicId" defaultValue={record?.topic?.id ?? ""} className={`${inputCls} mt-2`}>
        <option value="">Chưa phân loại (cần chọn trước khi User gửi duyệt)</option>
        {record?.topic && !topics.some((t) => t.id === record.topic?.id) && <option value={record.topic.id}>{record.topic.name} — không còn khả dụng, hãy chọn lại</option>}
        {topics.map((t) => <option key={t.id} value={t.id}>{t.name}{!t.isVisible ? " (ẩn)" : ""}</option>)}
      </select></label>
      <label className="block text-sm">Mô tả ngắn<textarea name="summary" maxLength={500} rows={3} defaultValue={post?.summary ?? ""} className={`${inputCls} mt-2`} /></label>
      <label className="block text-sm">Tag (tối đa 8, cách nhau bằng dấu phẩy)<input name="tags" maxLength={320} defaultValue={post?.tags.map((t) => t.name).join(", ")} className={`${inputCls} mt-2`} /></label>
      {post?.coverFile && <div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/uploads/${post.coverFile}`} alt="Ảnh bìa hiện tại" className="max-h-48 rounded-lg" /><label className="mt-2 block text-sm"><input name="removeCover" type="checkbox" /> Bỏ ảnh bìa khỏi bài</label></div>}
      <label className="block text-sm">Ảnh bìa (JPG/PNG/WebP, tối đa 5MB)<input type="file" name="cover" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full min-w-0 text-sm" /></label>
      <div className="block text-sm">
        <p className="mb-2 font-medium">Nội dung Markdown</p>
        <MarkdownEditorField
          name="content"
          defaultValue={post?.content ?? ""}
          maxLength={200000}
          rows={18}
          textareaClassName={inputCls}
          hint="Hỗ trợ Markdown đầy đủ, xuống dòng, bảng, khối mã và danh sách lệnh căn cột."
        />
      </div>
      <p className="text-sm text-muted">Sửa bài đã đăng sẽ đưa nội dung về nháp/chờ duyệt. Slug giữ nguyên. Mỗi User tối đa 20 lần lưu/gửi và 6 ảnh bìa trong 15 phút.</p>
      <div className="flex flex-wrap gap-3">
        <button name="intent" value="draft" className={btnOutline}>Lưu nháp</button>
        <button name="intent" value="submit" className={btnPrimary}>Gửi duyệt</button>
        {admin && <button name="intent" value="publish" className={btnPrimary}>Xuất bản (Admin)</button>}
        {record?.state === "published" && <Link href={`/documents/blog/${post?.slug}`} className={btnOutline}>Xem bài công khai</Link>}
      </div>
    </form>
    {record && <form action={deleteBlogAction} className="border-t border-line pt-5"><input type="hidden" name="id" value={post?.id} /><input type="hidden" name="revision" value={record.revision} /><ConfirmButton message="Xóa mềm bài này? Bài sẽ ngừng công khai, dữ liệu và ảnh vẫn được giữ." className="text-sm text-danger underline">Xóa bài viết</ConfirmButton></form>}
  </div>;
}
