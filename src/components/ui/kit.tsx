import Link from "next/link";

// Bộ thành phần giao diện dùng chung (Design System: navy, kem, vàng; Playfair + Inter).
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-md bg-accent px-6 py-3 text-sm font-medium tracking-wide text-accent-fg transition hover:opacity-90 disabled:opacity-60";
export const btnOutline =
  "inline-flex items-center justify-center gap-2 rounded-md border border-line px-5 py-2.5 text-sm transition hover:border-fg/40 hover:bg-card/60";
export const inputCls =
  "w-full rounded-md border border-line bg-bg px-4 py-3 text-[15px] text-fg placeholder:text-muted outline-none transition focus:border-gold";

export function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-[0.22em] text-link">{children}</p>;
}

export function PageHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-10">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
      {subtitle && <p className="mt-4 max-w-2xl font-serif text-xl leading-relaxed text-muted">{subtitle}</p>}
    </div>
  );
}

export function SectionHeading({
  eyebrow, title, href, linkLabel = "Xem tất cả",
}: { eyebrow?: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-sm text-link underline-offset-4 hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

export function Chip({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-1.5 text-sm transition ${
        active ? "border-accent bg-accent text-accent-fg" : "border-line text-muted hover:border-fg/40 hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line p-10 text-center text-muted">{children}</p>;
}

export function Pagination({
  page, totalPages, hrefFor,
}: { page: number; totalPages: number; hrefFor: (p: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Phân trang" className="mt-12 flex items-center justify-center gap-5 text-sm text-muted">
      {page > 1 ? <Link href={hrefFor(page - 1)} className={btnOutline}>Trang trước</Link> : <span />}
      <span>Trang {page} / {totalPages}</span>
      {page < totalPages ? <Link href={hrefFor(page + 1)} className={btnOutline}>Trang sau</Link> : <span />}
    </nav>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-card font-medium text-fg"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}
