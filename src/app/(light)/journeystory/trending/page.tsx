import { PhotoGrid } from "@/components/site/PhotoTile";
import { Container, Empty, PageHeading } from "@/components/ui/kit";
import { listPhotos, PUBLIC } from "@/lib/discovery";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ảnh nổi bật", alternates: { canonical: "/journeystory/trending" } };

export default async function TrendingPage() {
  const { photos } = await listPhotos({ statuses: PUBLIC, sort: "trending", limit: 24 });
  return (
    <Container className="py-14">
      <PageHeading eyebrow="JourneyStory" title="Ảnh nổi bật" subtitle="Những ảnh được thích, lưu và bình luận nhiều nhất." />
      {photos.length ? <PhotoGrid photos={photos} /> : <Empty>Chưa có ảnh nào.</Empty>}
    </Container>
  );
}
