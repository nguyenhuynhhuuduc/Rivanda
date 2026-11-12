import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlbumCard } from "@/components/site/Cards";
import { JourneyGallery } from "@/components/journeystory/JourneyGallery";
import { Container, Empty, PageHeading, Pagination, SectionHeading } from "@/components/ui/kit";
import { formatDate } from "@/lib/format";
import { getTripBySlug, listAlbums, listPhotos, listStatuses, mediumOf, PUBLIC } from "@/lib/discovery";
import { journeyPlaces } from "@/lib/journeystory-read";
import { journeyHref, journeyPage } from "@/lib/journeystory-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await getTripBySlug((await params).slug);
  return { title: t?.title ?? "Hành trình", description: t?.description ?? undefined, alternates: { canonical: `/journeystory/journeys/${encodeURIComponent((await params).slug)}` } };
}

export default async function JourneyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const trip = await getTripBySlug((await params).slug);
  if (!trip) notFound();
  const requested = journeyPage((await searchParams).page), size = 48;
  const [photoPage, albums, statuses] = await Promise.all([
    listPhotos({ statuses: PUBLIC, tripId: trip.id, limit: size, offset: (requested - 1) * size }),
    listAlbums(true, trip.id),
    listStatuses(20, trip.id),
  ]);
  const total = photoPage.total, page = Math.min(requested, Math.max(1, Math.ceil(total / size)));
  const photos = page === requested ? photoPage.photos : (await listPhotos({ statuses: PUBLIC, tripId: trip.id, limit: size, offset: (page - 1) * size })).photos;
  const places = await journeyPlaces(trip.id, photos.map(p => p.id));
  const meta = [trip.locationName, trip.startDate ? formatDate(trip.startDate) : null, trip.endDate ? formatDate(trip.endDate) : null]
    .filter(Boolean).join(" · ");

  return (
    <Container className="py-14">
      <Link href="/journeystory/journeys" className="text-sm text-muted hover:text-fg">← Tất cả hành trình</Link>
      <div className="mt-6"><PageHeading eyebrow={meta || "Hành trình"} title={trip.title} subtitle={trip.description ?? undefined} /></div>
      {places.trip.length > 0 && <nav aria-label="Địa điểm hành trình" className="mb-10 flex flex-wrap gap-4 text-sm">{places.trip.map((place, i) => <a key={`${place.mapsUrl}-${i}`} href={place.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-4">{place.name} · Google Maps ↗</a>)}</nav>}

      {statuses.length > 0 && (
        <section className="mb-14">
          <SectionHeading eyebrow="Nhật ký" title="Ghi lại trên đường" />
          <ul className="space-y-6 border-l border-line pl-6">
            {statuses.map((s) => (
              <li key={s.id}>
                <p className="whitespace-pre-wrap leading-relaxed">{s.content}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(s.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {albums.length > 0 && (
        <section className="mb-14">
          <SectionHeading eyebrow="Album" title="Album của hành trình" />
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{albums.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
        </section>
      )}

      <section>
        <SectionHeading eyebrow="Ảnh" title="Tất cả ảnh" />
        {photos.length ? <JourneyGallery photos={photos.map(p => ({ id: p.id, src: mediumOf(p), width: p.width, height: p.height, title: p.title, caption: p.caption, locationName: p.locationName || places.photos[p.id]?.name || null, mapsUrl: places.photos[p.id]?.mapsUrl }))} /> : <Empty>{total ? "Không có ảnh ở trang này. Hãy quay lại trang trước." : "Hành trình này chưa có ảnh."}</Empty>}
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / size))} hrefFor={p => `${journeyHref(trip.slug)}?page=${p}`} />
      </section>
    </Container>
  );
}
