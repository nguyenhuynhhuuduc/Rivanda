import Link from "next/link";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { btnPrimary, Chip, Container, Empty, inputCls, PageHeading, Pagination } from "@/components/ui/kit";
import { listAlbums, listLocations, listPhotos, listTrips, listYears, PUBLIC } from "@/lib/discovery";
import { listPhotoTags } from "@/lib/tags";

export const dynamic = "force-dynamic";
export const metadata = { title: "Khám phá ảnh", alternates: { canonical: "/journeystory/explore" } };

const PAGE_SIZE = 24;
type SP = { q?: string; trip?: string; album?: string; location?: string; tag?: string; year?: string; page?: string };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim().slice(0, 80);
  const year = Number.parseInt(sp.year ?? "", 10) || undefined;

  const [trips, albums, locations, years, tags] = await Promise.all([
    listTrips({ onlyWithPhotos: true }), listAlbums(true), listLocations(), listYears(), listPhotoTags(20),
  ]);
  const trip = trips.find((t) => t.slug === sp.trip);
  const album = albums.find((a) => a.slug === sp.album);

  const { photos, total } = await listPhotos({
    statuses: PUBLIC, q: q || undefined, tripId: trip?.id, albumId: album?.id, tag: sp.tag || undefined,
    location: sp.location || undefined, year, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });

  const keep = { q, trip: sp.trip, album: sp.album, location: sp.location, tag: sp.tag, year: sp.year };
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/journeystory/explore?${s}` : "/journeystory/explore";
  };
  const hasFilter = Object.values(keep).some(Boolean);

  return (
    <Container className="py-14">
      <PageHeading eyebrow="JourneyStory" title="Khám phá ảnh" subtitle={`${total} ảnh${hasFilter ? " phù hợp bộ lọc" : ""}.`} />

      <form action="/journeystory/explore" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className="sr-only" htmlFor="q">Tìm kiếm</label>
        <input id="q" name="q" defaultValue={q} maxLength={80} placeholder="Tìm theo tiêu đề, chú thích, địa điểm..." className={inputCls} />
        <select name="trip" defaultValue={sp.trip ?? ""} aria-label="Hành trình" className={inputCls}>
          <option value="">Mọi hành trình</option>
          {trips.map((t) => <option key={t.id} value={t.slug}>{t.title}</option>)}
        </select>
        <select name="location" defaultValue={sp.location ?? ""} aria-label="Địa điểm" className={inputCls}>
          <option value="">Mọi địa điểm</option>
          {locations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
        <select name="year" defaultValue={sp.year ?? ""} aria-label="Năm" className={inputCls}>
          <option value="">Mọi năm</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className={btnPrimary}>Lọc</button>
        {sp.tag && <input type="hidden" name="tag" value={sp.tag} />}
        {sp.album && <input type="hidden" name="album" value={sp.album} />}
      </form>

      {(tags.length > 0 || hasFilter) && (
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {hasFilter && <Link href="/journeystory/explore" className="mr-2 text-sm text-link hover:underline">Xóa bộ lọc</Link>}
          {tags.map((t) => <Chip key={t.id} href={href({ tag: sp.tag === t.slug ? undefined : t.slug, page: undefined })} active={sp.tag === t.slug}>#{t.name}</Chip>)}
        </div>
      )}

      {photos.length ? <PhotoGrid photos={photos} /> : <Empty>Không tìm thấy ảnh phù hợp.</Empty>}
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(n) => href({ page: String(n) })} />
    </Container>
  );
}
