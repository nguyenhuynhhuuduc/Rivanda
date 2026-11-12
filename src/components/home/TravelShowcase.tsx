"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent, type PointerEvent } from "react";
import { SocialIcons } from "@/components/SocialIcons";
import { journeyHref, swipeStep, wrapIndex, type JourneyPreview } from "@/lib/journeystory-view";
import type { HomeSettings } from "@/lib/settings";
import styles from "./TravelShowcase.module.css";

const destinations = [
  { number: "01", href: "/discovery", name: "Discovery", text: "Câu chuyện, góc nhìn và kết nối cùng cộng đồng.", label: "Khám phá cộng đồng" },
  { number: "02", href: "/cyber-lab", name: "Cyber Lab", text: "Hướng dẫn, công cụ và nghiên cứu về công nghệ, bảo mật.", label: "Học và thực hành · Thành viên" },
  { number: "03", href: "/documents/blog", name: "Blog", text: "Những bài viết và kinh nghiệm muốn chia sẻ.", label: "Đọc Blog" },
];
export function TravelShowcase({ journeys, settings: s, ctaHref, ctaLabel, unavailable, children }: {
  journeys: JourneyPreview[]; settings: HomeSettings; ctaHref: string; ctaLabel: string; unavailable?: boolean; children: ReactNode;
}) {
  const [position, setActive] = useState(0), [failed, setFailed] = useState<Record<string, boolean>>({});
  const canvas = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null), buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const start = useRef<{ x: number; y: number } | null>(null), swiped = useRef(false);
  const count = journeys.length, active = wrapIndex(position, count), trip = journeys[active];
  const choose = (index: number) => setActive(wrapIndex(index, count));
  useEffect(() => {
    const errors: Record<string, boolean> = {};
    canvas.current?.querySelectorAll<HTMLImageElement>("img[data-showcase-file]").forEach(image => {
      if (image.complete && image.naturalWidth === 0 && image.dataset.showcaseFile) errors[image.dataset.showcaseFile] = true;
    });
    if (Object.keys(errors).length) setFailed(current => ({ ...current, ...errors }));
  }, [journeys, s.heroImage]);
  useEffect(() => {
    const rail = track.current, button = buttons.current[active];
    if (rail && button) rail.scrollTo({ left: Math.max(0, button.offsetLeft - (rail.clientWidth - button.offsetWidth) / 2), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [active]);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (!target.closest("[data-journey-card]")) return;
    const index = event.key === "ArrowRight" ? active + 1 : event.key === "ArrowLeft" ? active - 1 : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    if (index === null) return;
    event.preventDefault(); const next = wrapIndex(index, count); choose(next); buttons.current[next]?.focus({ preventScroll: true });
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const direction = swipeStep(event.clientX - start.current.x, event.clientY - start.current.y); start.current = null;
    if (direction) { swiped.current = true; choose(active + direction); }
  }
  return <div ref={canvas} className={styles.canvas} data-home-travel data-selected-journey={trip?.id}>
    <div className={styles.backgrounds} aria-hidden="true">
      {journeys.map((j, index) => <div key={j.id} className={`${styles.background} ${index === active ? styles.visible : ""}`} data-background-journey={j.id}>
        {j.coverFile && !failed[j.coverFile] && <img data-showcase-file={j.coverFile} src={`/uploads/${j.coverFile}`} alt="" fetchPriority={index === 0 ? "high" : "low"} onError={() => setFailed(v => ({ ...v, [j.coverFile!]: true }))} />}
      </div>)}
      {!count && s.heroImage && !failed[s.heroImage] && <div className={`${styles.background} ${styles.visible}`}><img data-showcase-file={s.heroImage} src={`/uploads/${s.heroImage}`} alt="" fetchPriority="high" onError={() => setFailed(v => ({ ...v, [s.heroImage!]: true }))} /></div>}
    </div>
    <div className={styles.shade} aria-hidden="true" />
    <section className={styles.hero} aria-label="Travel Showcase">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>{s.badgeText || "Những hành trình đáng nhớ"}</p>
        <div key={trip?.id || "welcome"} className={styles.story}>
          <p className={styles.location}>{trip ? [trip.locationName, `${trip.photoCount} ảnh`].filter(Boolean).join(" · ") : s.siteName}</p>
          <h1>{trip?.title || s.heroTitle}</h1>
          {(trip?.description || !trip) && <p className={styles.description}>{trip?.description || s.heroSubtitle}</p>}
          {trip ? <Link className={styles.seeMore} href={journeyHref(trip.slug)}>See more <span aria-hidden="true">↗</span><span className="sr-only">: {trip.title}</span></Link>
            : <Link className={styles.seeMore} href={ctaHref}>{ctaLabel} <span aria-hidden="true">↗</span></Link>}
        </div>
        {unavailable && <p className={styles.notice} role="status">Chưa tải được hành trình. Bạn có thể thử lại sau.</p>}
      </div>
      {count > 0 && <div className={styles.carousel} role="region" aria-roledescription="carousel" aria-label="Chọn hành trình" onKeyDown={keyboard}>
        <div ref={track} className={styles.track} onPointerDown={e => { swiped.current = false; start.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={pointerEnd} onPointerCancel={() => { start.current = null; }}>
          {journeys.map((j, i) => <button key={j.id} ref={el => { buttons.current[i] = el; }} type="button" data-journey-card={j.id} aria-pressed={active === i} aria-label={`Chọn hành trình ${j.title}`} className={`${styles.card} ${active === i ? styles.active : ""}`} onClick={event => { if (swiped.current && event.detail > 0) { swiped.current = false; return; } swiped.current = false; choose(i); }}>
            {j.coverFile && !failed[j.coverFile] ? <img data-showcase-file={j.coverFile} src={`/uploads/${j.coverFile}`} alt="" loading="lazy" draggable={false} onError={() => setFailed(v => ({ ...v, [j.coverFile!]: true }))} /> : <span className={styles.fallback} aria-hidden="true">↗</span>}
            <span className={styles.cardLabel}><span>{String(i + 1).padStart(2, "0")}</span><strong>{j.title}</strong>{j.locationName && <small>{j.locationName}</small>}</span>
          </button>)}
        </div>
        <div className={styles.controls}>
          <button type="button" aria-label="Hành trình trước" disabled={count < 2} onClick={() => choose(active - 1)}>←</button>
          <button type="button" aria-label="Hành trình tiếp theo" disabled={count < 2} onClick={() => choose(active + 1)}>→</button>
          <span className={styles.progress} aria-hidden="true"><span style={{ width: `${(active + 1) / count * 100}%` }} /></span>
          <span className={styles.counter} aria-live="polite" aria-atomic="true"><strong>{String(active + 1).padStart(2, "0")}</strong><span> / {String(count).padStart(2, "0")}</span><span className="sr-only"> · {trip.title}</span></span>
        </div>
      </div>}
    </section>
    <div className={styles.destinations}>{destinations.map(d => <Link key={d.href} href={d.href} className={styles.destination}>
      <span className={styles.destinationMeta}>{d.number} / {d.label}<span aria-hidden="true">↗</span></span><h2>{d.name}</h2><p>{d.text}</p>
    </Link>)}</div>
    <div className={styles.connections}>
      <div><Link href={ctaHref}>{ctaLabel} ↗</Link><Link href="/about">Câu chuyện của tôi →</Link><Link href="/contact">Liên hệ →</Link></div>
      <div><span>Kết nối và chia sẻ</span><SocialIcons instagramUrl={s.instagramUrl} xUrl={s.xUrl} facebookUrl={s.facebookUrl} /></div>
    </div>
    <div className={styles.sections}>{children}</div>
  </div>;
}
