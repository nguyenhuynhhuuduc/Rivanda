import { AlbumCard } from "@/components/site/Cards";
import { Container, Empty, PageHeading } from "@/components/ui/kit";
import { listAlbums } from "@/lib/discovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Album", alternates: { canonical: "/journeystory/albums" } };

export default async function AlbumsPage() {
  const albums = await listAlbums(true);
  return (
    <Container className="py-14">
      <PageHeading eyebrow="JourneyStory" title="Album" subtitle="Những bộ ảnh được chọn lọc theo chủ đề." />
      {albums.length ? (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{albums.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
      ) : <Empty>Chưa có album nào.</Empty>}
    </Container>
  );
}
