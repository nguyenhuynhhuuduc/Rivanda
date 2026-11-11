import type { MetadataRoute } from "next";
import { listAlbums, listPhotos, listTrips, PUBLIC } from "@/lib/discovery";
import { listDocuments } from "@/lib/documents";
import { appUrl } from "@/lib/oauth";

import { listPosts } from "@/lib/posts";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const statics = ["", "/discovery", "/journeystory", "/journeystory/explore", "/journeystory/journeys", "/journeystory/albums", "/journeystory/locations",
    "/resources", "/documents/blog", "/resources/documents", "/resources/projects", "/shop", "/about", "/contact"]
    .map((p) => ({ url: `${base}${p}` }));
  try {
    const [photos, trips, albums, posts, docs] = await Promise.all([
      listPhotos({ statuses: PUBLIC, limit: 500 }),
      listTrips({ onlyWithPhotos: true }),
      listAlbums(true),
      listPosts({ type: "blog", onlyPublished: true, limit: 500 }),
      listDocuments({ onlyPublished: true, limit: 500 }),
    ]);
    return [
      ...statics,
      ...photos.photos.map((p) => ({ url: `${base}/journeystory/photos/${p.id}`, lastModified: p.createdAt })),
      ...trips.map((t) => ({ url: `${base}/journeystory/journeys/${t.slug}` })),
      ...albums.map((a) => ({ url: `${base}/journeystory/albums/${a.slug}` })),
      ...posts.posts.map((p) => ({
        url: `${base}${p.type === "hacking" ? "/cyber-lab/articles" : "/documents/blog"}/${p.slug}`,
        lastModified: p.updatedAt,
      })),
      // tài liệu riêng tư và dành cho thành viên không đưa vào sitemap công khai
      ...docs.docs.filter((d) => d.access === "public").map((d) => ({ url: `${base}/resources/${d.id}` })),
    ];
  } catch {
    return statics;
  }
}
