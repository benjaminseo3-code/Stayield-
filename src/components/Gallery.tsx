"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";

type G = { id: string; alt: string };

/**
 * Photo gallery: a mosaic on desktop, a swipeable strip on mobile, and a keyboard-accessible
 * lightbox (Esc closes, arrows navigate, focus returns to the trigger).
 */
export function Gallery({ photos, fallbackAlt }: { photos: G[]; fallbackAlt: string }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open == null) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : (i + (document.dir === "rtl" ? -1 : 1) + photos.length) % photos.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : (i + (document.dir === "rtl" ? 1 : -1) + photos.length) % photos.length));
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      trigger.current?.focus();
    };
  }, [open, photos.length]);

  if (photos.length === 0) {
    return <div className="card card-pad center muted">{t("prop.noPhotos")}</div>;
  }
  const alt = (p: G) => p.alt || fallbackAlt;
  const openAt = (i: number, el: HTMLElement) => {
    trigger.current = el;
    setOpen(i);
  };

  const Img = ({ p, full }: { p: G; full?: boolean }) => (
    <picture>
      <source type="image/webp" srcSet={`/api/photos/${p.id}/${full ? "full.webp" : "thumb.webp"}`} />
      <img src={`/api/photos/${p.id}/full.jpg`} alt={alt(p)} loading={full ? "eager" : "lazy"} />
    </picture>
  );

  return (
    <>
      {/* Desktop mosaic */}
      <div className="gallery" data-testid="gallery">
        {photos.slice(0, 5).map((p, i) => (
          <button key={p.id} type="button" className={i === 0 ? "g-main" : "g-sub"} onClick={(e) => openAt(i, e.currentTarget)} aria-label={t("prop.gallery.open", { n: i + 1 })}>
            <Img p={p} full={i === 0} />
          </button>
        ))}
      </div>
      {/* The mosaic hides sub-photos on small screens; the swipe strip replaces it there. */}
      <style>{`@media (max-width: 819px){ .gallery{display:none} } @media (min-width: 820px){ .swipe{display:none} }`}</style>
      <div className="swipe" aria-label={fallbackAlt}>
        {photos.map((p, i) => (
          <button key={p.id} type="button" style={{ all: "unset", cursor: "zoom-in", aspectRatio: "4 / 3", overflow: "hidden", borderRadius: 10, background: "var(--navy)" }} onClick={(e) => openAt(i, e.currentTarget)} aria-label={t("prop.gallery.open", { n: i + 1 })}>
            <picture>
              <source type="image/webp" srcSet={`/api/photos/${p.id}/thumb.webp`} />
              <img src={`/api/photos/${p.id}/full.jpg`} alt={alt(p)} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading={i === 0 ? "eager" : "lazy"} />
            </picture>
          </button>
        ))}
      </div>

      {open != null && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={t("prop.gallery.count", { n: open + 1, total: photos.length })}>
          <div className="lb-bar">
            <span aria-live="polite">{t("prop.gallery.count", { n: open + 1, total: photos.length })}</span>
            <button ref={closeBtn} type="button" className="btn btn-secondary sm" onClick={() => setOpen(null)}>
              {t("prop.gallery.close")}
            </button>
          </div>
          <div className="lb-stage">
            <picture style={{ display: "contents" }}>
              <source type="image/webp" srcSet={`/api/photos/${photos[open].id}/full.webp`} />
              <img src={`/api/photos/${photos[open].id}/full.jpg`} alt={alt(photos[open])} />
            </picture>
          </div>
          <div className="lb-bar">
            <button type="button" className="btn btn-secondary sm" onClick={() => setOpen((open - 1 + photos.length) % photos.length)}>
              {t("prop.gallery.prev")}
            </button>
            <button type="button" className="btn btn-secondary sm" onClick={() => setOpen((open + 1) % photos.length)}>
              {t("prop.gallery.next")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
