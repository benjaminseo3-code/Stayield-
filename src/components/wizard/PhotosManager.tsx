"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/photos-constants";

type P = { id: string; alt: string; isCover: boolean };

async function api(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, headers: { ...(init.headers ?? {}) } });
}

export function PhotosManager({ propertyId, initial }: { propertyId: string; initial: P[] }) {
  const t = useT();
  const router = useRouter();
  const [photos, setPhotos] = useState<P[]>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ n: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const base = `/api/properties/${propertyId}/photos`;

  async function upload(list: FileList | File[]) {
    const files = Array.from(list);
    const errs: string[] = [];
    let n = 0;
    for (const file of files) {
      setProgress({ n: ++n, total: files.length });
      if (file.size > MAX_PHOTO_BYTES) {
        errs.push(t("photos.error.too_large", { name: file.name }));
        continue;
      }
      const form = new FormData();
      form.append("files", file);
      try {
        const res = await api(base, { method: "POST", body: form });
        const json = (await res.json()) as { results?: { ok: boolean; error?: string }[] };
        const r = json.results?.[0];
        if (!res.ok || !r?.ok) {
          const key = `photos.error.${r?.error ?? "generic"}`;
          errs.push(
            ["too_large", "not_an_image", "corrupt", "limit_reached"].includes(r?.error ?? "")
              ? t(key as "photos.error.generic", { name: file.name, max: MAX_PHOTOS })
              : t("photos.error.generic", { name: file.name }),
          );
        }
      } catch {
        errs.push(t("photos.error.generic", { name: file.name }));
      }
    }
    setProgress(null);
    setErrors(errs);
    router.refresh();
  }

  async function persistOrder(next: P[]) {
    setPhotos(next);
    await api(base, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: next.map((p) => p.id) }) });
  }

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    void persistOrder(next);
  }

  async function makeCover(id: string) {
    setPhotos(photos.map((p) => ({ ...p, isCover: p.id === id })));
    await api(`${base}/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isCover: true }) });
  }

  async function remove(id: string) {
    await api(`${base}/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function saveAlt(id: string, alt: string) {
    await api(`${base}/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ alt }) });
  }

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <div
        className={`dropzone${dragOver ? " active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
      >
        <p style={{ margin: "0 0 12px" }}>{progress ? t("photos.uploading", progress) : t("photos.drop")}</p>
        <button type="button" className="btn btn-secondary" onClick={(e) => { e.stopPropagation(); input.current?.click(); }} disabled={!!progress || photos.length >= MAX_PHOTOS}>
          {t("photos.choose")}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          data-testid="photo-input"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="small muted" style={{ margin: 0 }}>{t("photos.count", { n: photos.length, max: MAX_PHOTOS })}</p>
      {errors.length > 0 && (
        <ul className="notice error" role="alert" style={{ margin: 0, paddingInlineStart: "1.4em" }}>
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {photos.length === 0 && <p className="muted">{t("photos.empty")}</p>}
      <ul className="photo-grid">
        {photos.map((p, i) => (
          <li
            key={p.id}
            className="photo-item"
            draggable
            data-testid="photo-item"
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragIndex.current;
              dragIndex.current = null;
              if (from == null || from === i) return;
              const next = [...photos];
              const [moved] = next.splice(from, 1);
              next.splice(i, 0, moved);
              void persistOrder(next);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${p.id}/thumb.webp`} alt={p.alt} />
            <div className="p-body">
              <label className="small" htmlFor={`alt-${p.id}`}>{t("photos.alt")}</label>
              <input id={`alt-${p.id}`} className="input" defaultValue={p.alt} onBlur={(e) => void saveAlt(p.id, e.target.value)} maxLength={200} />
              <div className="row" style={{ gap: 6 }}>
                {p.isCover ? (
                  <span className="badge status-live">{t("photos.cover")}</span>
                ) : (
                  <button type="button" className="btn btn-secondary sm" onClick={() => void makeCover(p.id)}>{t("photos.makeCover")}</button>
                )}
                <button type="button" className="btn btn-ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("photos.moveEarlier")}>↑</button>
                <button type="button" className="btn btn-ghost sm" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label={t("photos.moveLater")}>↓</button>
                <button type="button" className="btn btn-danger sm" onClick={() => void remove(p.id)}>{t("photos.remove")}</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
