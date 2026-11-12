// Public presentation only; no changes to the existing Trip/Photo API.
export type JourneyPreview = {
  id: string; slug: string; title: string; description: string | null;
  locationName: string | null; coverFile: string | null; photoCount: number;
  createdAt: string | null; isFeatured: boolean;
};
export type JourneySort = "newest" | "oldest" | "az" | "za";
export const JOURNEY_SORTS: Record<JourneySort, string> = {
  newest: "Ngày đăng: mới nhất", oldest: "Ngày đăng: cũ nhất", az: "Tên: A–Z", za: "Tên: Z–A",
};
export function journeySort(value: unknown): JourneySort {
  return typeof value === "string" && Object.hasOwn(JOURNEY_SORTS, value) ? value as JourneySort : "newest";
}
export function journeyPage(value: unknown) {
  return typeof value === "string" && /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : 1;
}
export function collectionPage(items: JourneyPreview[], sort: JourneySort, requestedPage: number, size = 12) {
  const collator = new Intl.Collator("vi", { sensitivity: "base", numeric: true });
  const sorted = [...items].sort((a, b) => {
    const delta = sort === "az" || sort === "za"
      ? collator.compare(a.title, b.title) * (sort === "az" ? 1 : -1)
      : ((Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0)) * (sort === "oldest" ? 1 : -1);
    return delta || a.id.localeCompare(b.id);
  });
  const pages = Math.max(1, Math.ceil(sorted.length / size)), page = Math.min(pages, Math.max(1, requestedPage));
  return { journeys: sorted.slice((page - 1) * size, page * size), page, pages, total: sorted.length };
}
export const journeyHref = (slug: string) => `/journeystory/journeys/${encodeURIComponent(slug)}`;
export function safeMapsUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 2048) return null;
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    const google = ["google.com", "www.google.com", "google.com.vn", "www.google.com.vn"].includes(u.hostname) && /^\/maps(?:\/|$)/.test(u.pathname);
    const maps = u.hostname === "maps.google.com" || u.hostname === "maps.app.goo.gl" && u.pathname.length > 1 || u.hostname === "goo.gl" && u.pathname.startsWith("/maps/");
    return google || maps ? u.href : null;
  } catch { return null; }
}
export function swipeStep(dx: number, dy: number) { return Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.3 ? dx < 0 ? 1 : -1 : 0; }
export const wrapIndex = (index: number, count: number) => count ? (index % count + count) % count : 0;
