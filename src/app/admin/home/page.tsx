import { requirePermission } from "@/lib/auth";
import { getHomeSections, getHomeSettings, SECTION_LABEL } from "@/lib/settings";
import { moveSectionAction, saveHomeAction, toggleSectionAction } from "../actions";

export const dynamic = "force-dynamic";

const input =
  "mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 outline-none focus:border-gold";

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requirePermission("settings.manage");
  const [s, sp, sections] = await Promise.all([getHomeSettings(), searchParams, getHomeSections()]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Chỉnh trang chủ</h1>
      <p className="mt-1 text-muted">
        Thay đổi ở đây sẽ hiện ngay trên trang chủ của người xem.
      </p>

      {sp.saved && (
        <p role="status" className="mt-5 rounded-lg bg-success/10 px-4 py-3 text-success ring-1 ring-success/25">
          Đã lưu thay đổi.
        </p>
      )}
      {sp.error && (
        <p role="alert" className="mt-5 rounded-lg bg-danger/10 px-4 py-3 text-danger ring-1 ring-danger/25">
          {sp.error}
        </p>
      )}

      <form action={saveHomeAction} className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl bg-surface p-6 ring-1 ring-line">
          <h2 className="font-semibold">Ảnh nền</h2>
          <div className="aspect-video overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_72%_28%,#4a7886_0%,#1a3a45_42%,#08141a_100%)]">
            {s.heroImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/uploads/${s.heroImage}`}
                alt="Ảnh nền hiện tại"
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <label className="block text-sm font-medium">
            Chọn ảnh mới (JPG, PNG hoặc WebP, tối đa 5MB)
            <input
              type="file"
              name="heroImage"
              accept="image/jpeg,image/png,image/webp"
              className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:text-white hover:file:bg-navy-deep"
            />
          </label>
          {s.heroImage && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeImage" />
              Xóa ảnh hiện tại và dùng nền mặc định
            </label>
          )}
        </section>

        <section className="space-y-4 rounded-2xl bg-surface p-6 ring-1 ring-line">
          <h2 className="font-semibold">Nội dung</h2>
          <label className="block text-sm font-medium">
            Tên website (logo)
            <input name="siteName" defaultValue={s.siteName} maxLength={60} required className={input} />
          </label>
          <label className="block text-sm font-medium">
            Dòng chào nhỏ phía trên tiêu đề
            <input name="badgeText" defaultValue={s.badgeText} maxLength={120} className={input} />
          </label>
          <label className="block text-sm font-medium">
            Tiêu đề lớn
            <input name="heroTitle" defaultValue={s.heroTitle} maxLength={160} required className={input} />
          </label>
          <label className="block text-sm font-medium">
            Mô tả ngắn
            <textarea name="heroSubtitle" defaultValue={s.heroSubtitle} maxLength={400} rows={3} className={input} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Chữ trên nút
              <input name="ctaLabel" defaultValue={s.ctaLabel} maxLength={40} required className={input} />
            </label>
            <label className="block text-sm font-medium">
              Nút dẫn tới
              <input name="ctaHref" defaultValue={s.ctaHref} maxLength={200} placeholder="/discovery" className={input} />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl bg-surface p-6 ring-1 ring-line lg:col-span-2">
          <h2 className="font-semibold">Mạng xã hội</h2>
          <p className="text-sm text-muted">Để trống thì biểu tượng đó sẽ không hiện.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">
              Instagram
              <input name="instagramUrl" defaultValue={s.instagramUrl} placeholder="https://instagram.com/..." className={input} />
            </label>
            <label className="block text-sm font-medium">
              X
              <input name="xUrl" defaultValue={s.xUrl} placeholder="https://x.com/..." className={input} />
            </label>
            <label className="block text-sm font-medium">
              Facebook
              <input name="facebookUrl" defaultValue={s.facebookUrl} placeholder="https://facebook.com/..." className={input} />
            </label>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl bg-surface p-6 ring-1 ring-line lg:col-span-2">
          <h2 className="font-semibold">Giới thiệu và liên hệ</h2>
          <label className="block text-sm font-medium">
            Nội dung giới thiệu (trang Giới thiệu và khu vực cuối trang chủ; cách đoạn bằng một dòng trống)
            <textarea name="aboutText" defaultValue={s.aboutText} rows={5} maxLength={4000} className={input} />
          </label>
          <label className="block text-sm font-medium">
            Email liên hệ (hiện ở trang Liên hệ)
            <input name="contactEmail" type="email" defaultValue={s.contactEmail} maxLength={255} className={input} />
          </label>
        </section>

        <div className="lg:col-span-2">
          <button className="rounded-lg bg-navy px-6 py-3 font-medium text-white hover:bg-navy-deep">
            Lưu thay đổi
          </button>
        </div>
      </form>

      <section className="mt-10 rounded-2xl bg-surface p-6 ring-1 ring-line">
        <h2 className="font-semibold">Khu vực trên trang chủ</h2>
        <p className="mt-1 text-sm text-muted">Bật/tắt và đổi thứ tự các khu vực hiển thị bên dưới ảnh bìa.</p>
        <ul className="mt-4 divide-y divide-line">
          {sections.map((x, i) => (
            <li key={x.key} className="flex items-center justify-between gap-3 py-3">
              <span className={x.enabled ? "" : "text-muted/70 line-through"}>{SECTION_LABEL[x.key]}</span>
              <div className="flex items-center gap-2">
                <form action={moveSectionAction.bind(null, x.key, "up")}><button disabled={i === 0} className="rounded border border-line px-2.5 py-1 text-sm disabled:opacity-30" aria-label="Chuyển lên">↑</button></form>
                <form action={moveSectionAction.bind(null, x.key, "down")}><button disabled={i === sections.length - 1} className="rounded border border-line px-2.5 py-1 text-sm disabled:opacity-30" aria-label="Chuyển xuống">↓</button></form>
                <form action={toggleSectionAction.bind(null, x.key, !x.enabled)}><button className="rounded border border-line px-3 py-1 text-sm">{x.enabled ? "Tắt" : "Bật"}</button></form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
