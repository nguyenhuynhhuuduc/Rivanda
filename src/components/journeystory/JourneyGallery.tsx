"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { safeMapsUrl, swipeStep, wrapIndex } from "@/lib/journeystory-view";
import styles from "./JourneyStory.module.css";
export type GalleryImage = { id: string; src: string; width: number | null; height: number | null; title: string | null; caption: string | null; locationName: string | null; mapsUrl?: string | null };
export function JourneyGallery({ photos }: { photos: GalleryImage[] }) {
  const [index, setIndex] = useState<number | null>(null), [failed, setFailed] = useState<Record<string, boolean>>({});
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement | null>(null), touch = useRef<{ x: number; y: number } | null>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const selected = index === null ? null : wrapIndex(index, photos.length);
  const open = selected !== null && photos.length > 0, photo = selected === null ? null : photos[selected];
  const move = (step: number) => setIndex(i => i === null ? null : wrapIndex(i + step, photos.length));
  useEffect(() => {
    const errors: Record<string, boolean> = {};
    gallery.current?.querySelectorAll<HTMLImageElement>("img[data-photo-id]").forEach(image => {
      if (image.complete && image.naturalWidth === 0 && image.dataset.photoId) errors[image.dataset.photoId] = true;
    });
    if (Object.keys(errors).length) setFailed(current => ({ ...current, ...errors }));
  }, [photos]);
  useEffect(() => {
    const modal = dialog.current; if (!open || !modal) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; modal.showModal();
    return () => { modal.close(); document.body.style.overflow = overflow; opener.current?.focus({ preventScroll: true }); };
  }, [open]);
  function pointerEnd(e: PointerEvent) { if (touch.current) { const step = swipeStep(e.clientX - touch.current.x, e.clientY - touch.current.y); touch.current = null; if (step) move(step); } }
  return <>
    <div ref={gallery} className={styles.masonry} data-journey-gallery>
      {photos.map((p, i) => <figure key={p.id} className={styles.photo}>
        <button type="button" className={styles.photoButton} aria-label={`Mở ảnh ${p.title || i + 1}`} onClick={e => { opener.current = e.currentTarget; setIndex(i); }}>
          {!failed[p.id] ? <img data-photo-id={p.id} src={p.src} width={p.width ?? undefined} height={p.height ?? undefined} alt={p.title || p.caption || p.locationName || "Ảnh hành trình"} loading="lazy" onError={() => setFailed(v => ({ ...v, [p.id]: true }))} /> : <span className={styles.photoFallback}>Ảnh chưa tải được</span>}
          <span className={styles.enlarge} aria-hidden="true">⤢</span>
        </button>
        <figcaption className={styles.caption}>{p.title && <h3>{p.title}</h3>}{p.caption && <p>{p.caption}</p>}{p.locationName && <span>{p.locationName}</span>}
          <div className={styles.photoLinks}><Link href={`/journeystory/photos/${encodeURIComponent(p.id)}`}>Chi tiết ảnh ↗</Link>{safeMapsUrl(p.mapsUrl) && <a href={safeMapsUrl(p.mapsUrl)!} target="_blank" rel="noopener noreferrer">Google Maps ↗</a>}</div>
        </figcaption>
      </figure>)}
    </div>
    <dialog ref={dialog} className={styles.lightbox} aria-label="Xem ảnh hành trình" onCancel={() => setIndex(null)} onClose={() => setIndex(null)} onClick={e => { if (e.target === e.currentTarget) setIndex(null); }} onKeyDown={e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); move(e.key === "ArrowRight" ? 1 : -1); }
      if (e.key === "Home" || e.key === "End") { e.preventDefault(); setIndex(e.key === "Home" ? 0 : photos.length - 1); }
    }}>
      {photo && <div className={styles.lightboxPanel}>
        <header className={styles.lightboxHeader}><span aria-live="polite" aria-atomic="true">Ảnh {selected! + 1} / {photos.length}</span><button type="button" aria-label="Đóng ảnh" onClick={() => setIndex(null)} autoFocus>✕</button></header>
        <div className={styles.lightboxStage} onPointerDown={e => { touch.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={pointerEnd} onPointerCancel={() => { touch.current = null; }}>
          <button type="button" aria-label="Ảnh trước" disabled={photos.length < 2} className={styles.previousPhoto} onClick={() => move(-1)}>←</button>
          {!failed[photo.id] ? <img key={photo.id} src={photo.src} alt={photo.title || photo.caption || "Ảnh hành trình"} draggable={false} onError={() => setFailed(v => ({ ...v, [photo.id]: true }))} /> : <p>Ảnh chưa tải được. Bạn có thể chuyển sang ảnh khác.</p>}
          <button type="button" aria-label="Ảnh tiếp theo" disabled={photos.length < 2} className={styles.nextPhoto} onClick={() => move(1)}>→</button>
        </div>
        <div className={styles.lightboxCaption}><h2>{photo.title || "Khoảnh khắc trên đường"}</h2>{photo.caption && <p>{photo.caption}</p>}{photo.locationName && <p>{photo.locationName}</p>}
          <div className={styles.photoLinks}><Link href={`/journeystory/photos/${encodeURIComponent(photo.id)}`}>Chi tiết ảnh ↗</Link>{safeMapsUrl(photo.mapsUrl) && <a href={safeMapsUrl(photo.mapsUrl)!} target="_blank" rel="noopener noreferrer">Mở Google Maps ↗</a>}</div>
        </div>
      </div>}
    </dialog>
  </>;
}
