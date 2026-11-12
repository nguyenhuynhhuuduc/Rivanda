import Link from "next/link";
import { Container, Empty, PageHeading, Pagination, btnOutline, inputCls } from "@/components/ui/kit";
import { journeyCollections } from "@/lib/journeystory-read";
import { collectionPage, journeyHref, journeyPage, journeySort, JOURNEY_SORTS } from "@/lib/journeystory-view";
import { formatDate } from "@/lib/format";
import { JourneyImage } from "./JourneyImage";
import styles from "./JourneyStory.module.css";
export async function JourneyCollections({ searchParams, base = "/journeystory" }: { searchParams: Promise<{ sort?: string; page?: string }>; base?: string }) {
  const sp = await searchParams, sort = journeySort(sp.sort);
  const result = await journeyCollections().then(items => ({ ...collectionPage(items, sort, journeyPage(sp.page)), failed: false })).catch(() => ({ journeys: [], total: 0, page: 1, pages: 1, failed: true }));
  return <Container className="py-14">
    <PageHeading eyebrow="JourneyStory · Bộ sưu tập" title="Những nơi tôi đã đi qua" subtitle="Mỗi chuyến đi là một câu chuyện. Mở bộ sưu tập để xem những khoảnh khắc và ghi chép trên đường." />
    <nav aria-label="Khám phá JourneyStory" className={styles.links}><Link href="/journeystory/explore">Tất cả ảnh ↗</Link><Link href="/journeystory/albums">Album ↗</Link><Link href="/journeystory/locations">Địa điểm ↗</Link><Link href="/journeystory/trending">Ảnh nổi bật ↗</Link></nav>
    <div className={styles.toolbar}><p>{result.failed ? "Thư viện hành trình" : `${result.total} bộ sưu tập hành trình`}</p>
      <form action={base} className={styles.sortForm}><label htmlFor="journey-sort">Sắp xếp</label>
        <select id="journey-sort" name="sort" defaultValue={sort} className={inputCls}>{Object.entries(JOURNEY_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button className={btnOutline} type="submit">Áp dụng</button>
      </form>
    </div>
    {result.failed ? <div role="alert"><Empty>Chưa tải được hành trình. <a href={base} className="underline">Thử lại</a></Empty></div>
      : result.journeys.length ? <div className={styles.collections}>{result.journeys.map(t => <article key={t.id} className={styles.collection}>
        <Link href={journeyHref(t.slug)} className={styles.collectionLink}>
          <div className={styles.cover}><JourneyImage file={t.coverFile} title={t.title} /><span className={styles.photoCount}>{t.photoCount} ảnh</span><span className={styles.openArrow} aria-hidden="true">↗</span></div>
          <div className={styles.collectionText}><p className={styles.collectionMeta}>{t.locationName || "Hành trình"}{t.createdAt && <> · <time dateTime={t.createdAt}>{formatDate(t.createdAt)}</time></>}</p><h2>{t.title}</h2>{t.description && <p className={styles.summary}>{t.description}</p>}</div>
        </Link>
      </article>)}</div> : <Empty>Chưa có hành trình có ảnh công khai. Hẹn gặp bạn trong những chuyến đi sắp tới.</Empty>}
    <Pagination page={result.page} totalPages={result.pages} hrefFor={page => `${base}?${new URLSearchParams({ sort, page: String(page) })}`} />
  </Container>;
}
