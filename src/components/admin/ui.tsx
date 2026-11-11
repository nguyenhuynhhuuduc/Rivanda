import Link from "next/link";

export const adminInput =
  "w-full min-w-0 rounded-xl border border-line bg-bg px-3 py-2.5 text-sm text-fg outline-none transition focus:border-gold";
export const adminBtn =
  "inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50";
export const adminBtnGhost =
  "inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-fg transition hover:bg-card";
export const adminBtnDanger =
  "rounded-lg border border-danger/25 px-4 py-2 text-sm text-danger hover:bg-danger/10";

export function PageTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-link">Không gian quản trị</p>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {hint && <p className="mt-1 text-muted">{hint}</p>}
    </div>
  );
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-panel rounded-2xl p-5 sm:p-6 ${className}`}>
      {title && <h2 className="mb-4 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <span className="mt-1.5 block font-normal">{children}</span>
    </label>
  );
}

export function Flash({ saved, error }: { saved?: string; error?: string }) {
  return (
    <>
      {saved && (
        <p role="status" className="mb-5 rounded-lg bg-success/10 px-4 py-3 text-success ring-1 ring-success/25">
          {saved === "1" ? "Đã lưu thay đổi." : saved}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-5 rounded-lg bg-danger/10 px-4 py-3 text-danger ring-1 ring-danger/25">
          {error}
        </p>
      )}
    </>
  );
}

export function AdminPagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (p: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Phân trang" className="mt-6 flex items-center justify-center gap-4 text-sm">
      {page > 1 ? <Link href={hrefFor(page - 1)} className={adminBtnGhost}>Trang trước</Link> : <span />}
      <span className="text-muted">Trang {page} / {totalPages}</span>
      {page < totalPages ? <Link href={hrefFor(page + 1)} className={adminBtnGhost}>Trang sau</Link> : <span />}
    </nav>
  );
}
