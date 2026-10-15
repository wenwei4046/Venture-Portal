"use client";

import { useEffect, useRef, useState } from "react";
import { cachedFacts, pdfFacts, sizeLabel, type PdfFacts } from "./pdf";
import { keepImage, keepPoster, useKeptSrc } from "./media-cache";
import { typePx } from "./type";
export { VoiceNote } from "./voice-note";

/**
 * Pieces of a chat bubble the generated chats draw (tools/crm-design/chat-media.cjs), 2026-10-14:
 * - PdfCard: a PDF as WhatsApp shows one — its first page on top, then its name, page count and size;
 * - MediaAlbum: four or more photos / videos sent together, as a 2 × 2 grid with "+N" on the last (WhatsApp's album).
 */
export function PdfCard({ src, name, onOpen }: { src: string; name: string; onOpen?: () => void }) {
  const [facts, setFacts] = useState<PdfFacts | null>(() => (typeof window === "undefined" ? null : cachedFacts(src)));
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (facts || !box.current) return;
    let on = true;
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      void pdfFacts(src).then(f => { if (on && f) setFacts(f); });
    });
    io.observe(box.current);
    return () => { on = false; io.disconnect(); };
  }, [src, facts]);
  const line = [facts?.pages ? `${facts.pages} page${facts.pages === 1 ? "" : "s"}` : "", facts ? sizeLabel(facts.bytes) : "", "pdf"].filter(Boolean).join(" · ");
  return (
    <span ref={box} onClick={onOpen} style={{ display: "block", width: "250px", maxWidth: "100%", borderRadius: "12px", overflow: "hidden", background: "rgba(63,43,34,.06)", cursor: "pointer" }}>
      <span style={{ display: "block", height: "120px", background: facts ? "#fff" : "rgba(63,43,34,.05)", overflow: "hidden" }}>
        {facts && <img src={facts.img} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 10px" }}>
        <span style={{ flex: "none", width: "30px", height: "36px", borderRadius: "5px", background: "#C8402A", color: "#fff", display: "grid", placeItems: "center", fontSize: typePx(9), fontWeight: 700 }}>PDF</span>
        <span style={{ flex: "1", minWidth: 0, display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}>
          <strong style={{ fontSize: typePx(14), fontWeight: 600, lineHeight: 1.3, color: "#3F2B22", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name}</strong>
          <small style={{ fontSize: typePx(12), color: "#806B60" }}>{line}</small>
        </span>
      </span>
    </span>
  );
}

export type AlbumTile = { src: string; video: boolean; view: () => void };
export function MediaAlbum({ items, more }: { items: AlbumTile[]; more: number }) {
  return (
    // Two side by side; three as one wide on top and two under it; four or more as 2 × 2 with +N on the last.
    <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px", width: "240px", maxWidth: "100%", borderRadius: "12px", overflow: "hidden" }}>
      {items.map((t, i) => (
        <span key={t.src} onClick={t.view} style={{ position: "relative", display: "block", aspectRatio: items.length === 3 && i === 0 ? "2 / 1" : "1", gridColumn: items.length === 3 && i === 0 ? "1 / span 2" : undefined, overflow: "hidden", borderRadius: "3px", background: "#000", cursor: "pointer" }}>
          {t.video
            ? <ChatVideo src={t.src.startsWith("blob:") ? t.src : `${t.src}#t=0.1`} base={t.src} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            : <ChatImg src={t.src} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          {t.video && !(more && i === items.length - 1) && (
            <span style={{ position: "absolute", left: "50%", top: "50%", width: "36px", height: "36px", margin: "-18px 0 0 -18px", borderRadius: "18px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
            </span>
          )}
          {more > 0 && i === items.length - 1 && (
            <span style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", color: "#fff", display: "grid", placeItems: "center", fontSize: typePx(30), fontWeight: 500 }}>+{more}</span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * A chat's photo and video, drawn from the phone's kept copy when there is one (shared/media-cache.ts, 2026-10-14:
 * "我看到的還是上次的畫面"), else from the network — and kept once shown. Same props as the plain elements they replace.
 */
/**
 * A photo or a video that could not be fetched yet tries again by itself (the owner, 2026-10-15: on the computer a photo
 * stayed a blank "Photo" box — "先呈現在頁面上，後台的系統延遲幾秒"): our own media route fetches a customer's WhatsApp
 * file from Meta the first time, and a first answer can fail; it is asked again after 0.8, 1.5, 3, 5, 8 and 12 s. Until it
 * comes the box keeps its place, with no broken-picture icon.
 */
export const RETRY_MS = [800, 1500, 3000, 5000, 8000, 12000];
/** The address to ask on the n-th try: our own route gets a fresh query so the browser asks again; a local copy never. */
export const retrySrc = (src: string, n: number) => (!n || !src.startsWith("/") ? src : `${src}${src.includes("?") ? "&" : "?"}r=${n}`);
function useRetry(src: string) {
  const [n, setN] = useState(0), t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setN(0); return () => clearTimeout(t.current); }, [src]);
  const failed = () => { if (n < RETRY_MS.length) { clearTimeout(t.current); t.current = setTimeout(() => setN(x => x + 1), RETRY_MS[n]); } };
  return { n, failed, waiting: n > 0 };
}

export function ChatImg({ src, onClick, onLoad, style, alt = "Photo", loading }: { src: string; onClick?: () => void; onLoad?: React.ReactEventHandler<HTMLImageElement>; style?: React.CSSProperties; alt?: string; loading?: "lazy" | "eager" }) {
  const kept = useKeptSrc(src), r = useRetry(src), [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [src, r.n]);
  const shown = kept.src ? (kept.kept ? kept.src : retrySrc(kept.src, r.n)) : null;
  return (
    <img onClick={onClick} alt={bad ? "" : alt} loading={loading} style={bad ? { ...style, visibility: "hidden" } : style} {...(shown ? { src: shown } : {})}
      onError={() => { setBad(true); r.failed(); }}
      onLoad={e => { setBad(false); onLoad?.(e); if (!kept.kept && kept.src === src) keepImage(src); }} />
  );
}

export function ChatVideo({ src, base, onLoadedMetadata, style }: { src: string; base: string; onLoadedMetadata?: React.ReactEventHandler<HTMLVideoElement>; style?: React.CSSProperties }) {
  const poster = useKeptSrc(base, true), r = useRetry(src);
  return (
    <video key={r.n} src={retrySrc(src, r.n)} poster={poster.src ?? undefined} muted playsInline preload="metadata" style={style} onError={r.failed}
      onLoadedMetadata={onLoadedMetadata} onLoadedData={e => { if (!poster.kept) keepPoster(base, e.currentTarget); }} />
  );
}
