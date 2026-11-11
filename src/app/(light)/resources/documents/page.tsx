import Link from "next/link";
import { DocRow } from "@/components/site/DocRow";
import { btnPrimary, Chip, Container, Empty, inputCls, PageHeading, Pagination } from "@/components/ui/kit";
import { listDocumentCategories, listDocuments } from "@/lib/documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tài liệu và tài nguyên", alternates: { canonical: "/resources/documents" } };
const PAGE_SIZE = 15;
const EXTS = ["pdf", "docx", "xlsx", "pptx", "zip", "txt"];

export default async function ResourcesPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; ext?: string; category?: string; page?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const ext = EXTS.includes(sp.ext ?? "") ? sp.ext : undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [cats, { docs, total }] = await Promise.all([
    listDocumentCategories(),
    listDocuments({
      onlyPublished: true, kinds: ["document", "resource"], q: q || undefined, ext, category: sp.category || undefined,
      limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, ext, category: sp.category, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/resources/documents${s ? `?${s}` : ""}`;
  };

  return (
    <Container className="py-14">
      <Link href="/resources" className="text-sm text-muted hover:text-fg">← Resources</Link>
      <div className="mt-6"><PageHeading eyebrow="Resources" title="Tài liệu và tài nguyên" subtitle="Xem thông tin trước khi tải. Một số tài liệu dành riêng cho thành viên." /></div>

      <form action="/resources/documents" className="mb-6 flex max-w-xl gap-3">
        {ext && <input type="hidden" name="ext" value={ext} />}
        {sp.category && <input type="hidden" name="category" value={sp.category} />}
        <label htmlFor="q" className="sr-only">Tìm tài liệu</label>
        <input id="q" name="q" defaultValue={q} maxLength={80} placeholder="Tìm tài liệu..." className={inputCls} />
        <button className={btnPrimary}>Tìm</button>
      </form>

      <div className="mb-8 flex flex-wrap gap-2">
        <Chip href={href({ ext: undefined, category: undefined, page: undefined })} active={!ext && !sp.category}>Tất cả</Chip>
        {EXTS.map((e) => <Chip key={e} href={href({ ext: e, page: undefined })} active={ext === e}>{e.toUpperCase()}</Chip>)}
        {cats.map((c) => <Chip key={c} href={href({ category: c, page: undefined })} active={sp.category === c}>{c}</Chip>)}
      </div>

      {docs.length ? <ul className="space-y-3">{docs.map((d) => <DocRow key={d.id} doc={d} />)}</ul> : <Empty>Không có tài liệu phù hợp.</Empty>}
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => href({ page: String(n) })} />
    </Container>
  );
}
