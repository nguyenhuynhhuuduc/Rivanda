import Link from "next/link";
import { PhotoGrid } from "@/components/site/PhotoTile";
import { AlbumCard, JourneyCard } from "@/components/site/Cards";
import { Chip, Container, Empty, PageHeading, SectionHeading } from "@/components/ui/kit";
import { listAlbums, listPhotos, listStatuses, listTrips, PUBLIC } from "@/lib/discovery";
import { listPhotoTags } from "@/lib/tags";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "JourneyStory", alternates: { canonical: "/journeystory" } };

export default async function DiscoveryPage() {
  const [featured, latest, albums, statuses, tags] = await Promise.all([
    listTrips({ onlyWithPhotos: true, featuredOnly: true, limit: 3 }),
    listPhotos({ statuses: PUBLIC, limit: 12 }),
    listAlbums(true).then((a) => a.slice(0, 4)),
    listStatuses(4),
    listPhotoTags(16),
  ]);
  const journeys = featured.length ? featured : await listTrips({ onlyWithPhotos: true, limit: 3 });

  return (
    <Container className="py-14">
      <PageHeading
        eyebrow="JourneyStory"
        title="Những nơi tôi đã đi qua"
        subtitle="Ảnh, địa điểm và vài dòng ghi lại trên đường, được xếp theo từng hành trình."
      />

      <nav aria-label="Khám phá" className="mb-12 flex flex-wrap gap-2">
        <Chip href="/journeystory/explore">Khám phá tất cả</Chip>
        <Chip href="/journeystory/trending">Nổi bật</Chip>
        <Chip href="/journeystory/journeys">Hành trình</Chip>
        <Chip href="/journeystory/albums">Album</Chip>
        <Chip href="/journeystory/locations">Địa điểm</Chip>
      </nav>

      {journeys.length > 0 && (
        <section className="mb-16">
          <SectionHeading eyebrow="Hành trình" title="Hành trình nổi bật" href="/journeystory/journeys" />
          <div className="grid gap-8 md:grid-cols-3">
            {journeys.map((t) => <JourneyCard key={t.id} trip={t} />)}
          </div>
        </section>
      )}

      <section className="mb-16">
        <SectionHeading eyebrow="Mới nhất" title="Ảnh mới đăng" href="/journeystory/explore" />
        {latest.photos.length ? <PhotoGrid photos={latest.photos} /> : <Empty>Chưa có ảnh nào. Hãy quay lại sau nhé.</Empty>}
      </section>

      {albums.length > 0 && (
        <section className="mb-16">
          <SectionHeading eyebrow="Bộ sưu tập" title="Album" href="/journeystory/albums" />
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {albums.map((a) => <AlbumCard key={a.id} album={a} />)}
          </div>
        </section>
      )}

      <div className="grid gap-12 lg:grid-cols-2">
        {statuses.length > 0 && (
          <section aria-label="Nhật ký">
            <SectionHeading eyebrow="Nhật ký" title="Dòng ghi gần đây" />
            <ul className="space-y-6 border-l border-line pl-6">
              {statuses.map((s) => (
                <li key={s.id}>
                  <p className="whitespace-pre-wrap leading-relaxed">{s.content}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(s.createdAt)}{s.tripTitle ? ` · ${s.tripTitle}` : ""}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tags.length > 0 && (
          <section aria-label="Thẻ">
            <SectionHeading eyebrow="Chủ đề" title="Thẻ phổ biến" />
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => <Chip key={t.id} href={`/journeystory/tags/${t.slug}`}>#{t.name} ({t.count})</Chip>)}
            </div>
          </section>
        )}
      </div>
    </Container>
  );
}
