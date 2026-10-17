"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PdfPages } from "./pdf-pages";
import { FilePreview, previewKind } from "./file-preview";
import { typePx } from "./type";
import { keepImage, keptSrc, readyPhotos } from "./media-cache";
import { dropStep, pushStep } from "./back";

/**
 * A chat's photos, videos and documents open INSIDE the app (the owner, 2026-10-14: "打開圖片後，沒有返回鍵能回到聊天室
 * （我要它往下滑就能回到聊天室，左右滑能看到上一張和下一張圖片/影片）… 看影片時可全屏 … pdf 也沒有返回的按鈕，需要關閉整個
 * app 才能"). They opened as a new page: in the installed app a page of our own has no browser bar, so nothing led back.
 * Now one viewer over the CRM: pull down (or ×, or the phone's Back) closes it; left / right goes to the chat's previous /
 * next photo or video; a video plays on the whole screen; a PDF is read in place under a bar with × and a download.
 * Second round the same day: a photo zooms (two fingers or a double tap; the wheel or a double click on a computer),
 * Download saves the file (below), and the computer's chats open here too.
 */
export type ViewerItem = { kind: "image" | "video" | "file"; url: string; name?: string; mime?: string };
type ViewerState = { items: ViewerItem[]; i: number } | null;

let state: ViewerState = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function openViewer(items: ViewerItem[], i: number) {
  if (!items.length) return;
  state = { items, i: Math.max(0, Math.min(i, items.length - 1)) };
  emit();
}
function closeViewer() { state = null; emit(); }
function stepViewer(d: number) {
  if (!state) return;
  const i = state.i + d;
  if (i < 0 || i >= state.items.length) return;
  state = { ...state, i };
  emit();
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => state;

/** What a document is, for its tile: "PDF", "XLSX", "DOC" … from the file's type, else its name. */
export function docLabel(name?: string, mime?: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return "PDF";
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name ?? "")?.[1];
  if (ext) return ext.toUpperCase();
  if (m.includes("sheet") || m.includes("excel")) return "XLS";
  if (m.includes("word")) return "DOC";
  if (m.includes("presentation") || m.includes("powerpoint")) return "PPT";
  return "FILE";
}
export const isPdf = (it: { name?: string; mime?: string }) => docLabel(it.name, it.mime) === "PDF";

/** A photo's shape, remembered once it loaded, so the next time the chat opens its box is drawn the right size at once. */
const KEY = "crm-media-shape";
let shapes: Record<string, number> | null = null;
function shapeMap(): Record<string, number> {
  if (shapes) return shapes;
  try { shapes = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>; } catch { shapes = {}; }
  return shapes!;
}
/** The bubble's photo height for a 240 px wide box: its own shape when known, else a portrait box. Never changes as it loads. */
export function mediaHeight(url: string): string {
  if (typeof window === "undefined") return "300px";
  const r = shapeMap()[url];
  return r ? `${Math.round(Math.max(140, Math.min(320, 240 / r)))}px` : "300px";
}
export function rememberShape(url: string, w: number, h: number) {
  if (!url || !w || !h || url.startsWith("blob:")) return;
  const m = shapeMap();
  if (m[url]) return;
  m[url] = +(w / h).toFixed(3);
  const keys = Object.keys(m);
  if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(k => delete m[k]);
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* the box stays a portrait one */ }
}


/* ── Saving a file (2026-10-14, the owner: "下載好像沒功能，圖片影片下載後是到手機相冊，pdf 到 doc") ─────────────────────
 * The file is fetched as soon as the viewer shows it, so the button can hand it over at once. On a phone it goes to the
 * phone's own share sheet — Save Image / Save Video put it in Photos, Save to Files a PDF in Files (a web page cannot
 * write to the photo library itself); on a computer it is downloaded into the Downloads folder. */
const files = new Map<string, Promise<File | null>>();
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "application/pdf": "pdf" };
export function fileNameFor(it: ViewerItem, type: string, at = Date.now()): string {
  if (it.name && /\.[A-Za-z0-9]{1,5}$/.test(it.name)) return it.name;
  const ext = EXT[type.split(";")[0]] ?? (type.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5);
  return `${it.name || (it.kind === "image" ? "photo" : it.kind === "video" ? "video" : "file")}-${at}.${ext}`;
}
function fileOf(it: ViewerItem): Promise<File | null> {
  let p = files.get(it.url);
  if (!p) {
    p = fetch(it.url, { credentials: "same-origin" })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => (b ? new File([b], fileNameFor(it, b.type || it.mime || ""), { type: b.type || it.mime || "application/octet-stream" }) : null))
      .catch(() => null);
    files.set(it.url, p);
    void p.then(f => { if (!f) files.delete(it.url); });
  }
  return p;
}
function downloadFile(f: File) {
  const url = URL.createObjectURL(f), a = document.createElement("a");
  a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
async function saveFile(it: ViewerItem, ready: File | null): Promise<boolean> {
  const f = ready ?? (await fileOf(it));
  return f ? saveToDevice(f) : false;
}
/** A file handed to the phone's share sheet (Photos, Files) or, on a computer, downloaded — the viewer's and the editor's Save. */
export async function saveToDevice(f: File): Promise<boolean> {
  const phone = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (phone && typeof navigator.canShare === "function" && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f] }); return true; } catch (e) { if ((e as Error)?.name === "AbortError") return true; }
  }
  downloadFile(f);
  return true;
}

const ICON = { stroke: "currentColor", fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ZMAX = 5;
type Zoom = { s: number; x: number; y: number };
const Z0: Zoom = { s: 1, x: 0, y: 0 };

export function MediaViewer() {
  const s = useSyncExternalStore(subscribe, snapshot, () => null);
  const open = !!s;
  const pushed = useRef(false);
  const [drag, setDrag] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<Zoom>(Z0);
  const [ready, setReady] = useState<Record<string, File | null>>({});
  const [saving, setSaving] = useState("");
  const [note, setNote] = useState("");
  const [, setKept] = useState(0);
  const start = useRef<{ x: number; y: number; t: number; dx: number; v: number; pt: number; pdx: number; axis: "" | "x" | "y" | "pan"; zx: number; zy: number } | null>(null);
  /**
   * Left / right as a strip — the previous, this and the next photo side by side (the owner, 2026-10-15: "點入照片時，左右
   * 滑動要很順，現在會卡頓"): the finger moves the strip itself, written straight to its style (no render a move), and let
   * go it slides on to the neighbour, already drawn and loaded; the step happens once the slide is over. It used to
   * re-render the viewer at every move and load the next photo only after the step — a blank, then a jump.
   */
  const stripRef = useRef<HTMLDivElement>(null);
  const sliding = useRef(false);
  const goRef = useRef<(d: 1 | -1) => void>(() => {});
  const pinch = useRef<{ d0: number; s0: number } | null>(null);
  const lastTap = useRef(0);
  const mouse = useRef<{ x: number; y: number; zx: number; zy: number } | null>(null);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const dragRef = useRef(drag); dragRef.current = drag;

  // The phone's Back closes the viewer: one history step while it is open (Next's own state kept, as desk/nav.ts does).
  useEffect(() => {
    if (!open) return;
    // Pushed with the chat's own key kept under it (shared/back.ts › pushStep).
    if (!pushed.current) pushed.current = pushStep("crmViewer");
    const onPop = () => { pushed.current = false; dropStep("crmViewer"); closeViewer(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") goRef.current(-1);
      else if (e.key === "ArrowRight") goRef.current(1);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const cur = s ? s.items[s.i] : null;
  // A new photo in the middle: the strip back on it, at once (the slide that brought it is over).
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (el) { el.style.transition = "none"; el.style.transform = `translate3d(${-window.innerWidth}px,0,0)`; }
  }, [cur]);
  // The photos two either side read from the phone and decoded before a slide reaches them (media-cache › readyPhotos).
  useEffect(() => {
    if (!s) return;
    let live = true;
    const near = s.items.slice(Math.max(0, s.i - 2), s.i + 3).filter(m => m.kind === "image").map(m => m.url);
    void readyPhotos(near).then(fresh => { if (live && fresh) setKept(n => n + 1); });
    return () => { live = false; };
  }, [s]);
  // Each item: back to its whole picture, and its file fetched for Download.
  useEffect(() => {
    setDrag({ x: 0, y: 0 }); setZoom(Z0); setNote("");
    if (!cur) return;
    let live = true;
    void fileOf(cur).then(f => { if (live) setReady(r => ({ ...r, [cur.url]: f })); });
    return () => { live = false; };
  }, [cur]);

  if (!s || !cur || typeof document === "undefined") return null;
  const it = cur, many = s.items.length > 1;
  const zoomable = it.kind === "image";
  function close() {
    if (pushed.current) { pushed.current = false; dropStep("crmViewer"); closeViewer(); try { history.back(); } catch { /* closed already */ } }
    else closeViewer();
  }
  const clamp = (z: Zoom): Zoom => (z.s <= 1.02 ? Z0 : z);
  const toggleZoom = () => setZoom(z => (z.s > 1 ? Z0 : { s: 2.5, x: 0, y: 0 }));

  /**
   * The strip at `x` px from this photo (0 = this one), sliding there over `ms` (0 = at once). The slide carries on at the
   * finger's own speed and eases out (the owner, 2026-10-15: "左右滑動的速度 scrolling motion 再順一點") — a fixed 260ms
   * ran slower than a quick flick and faster than a slow drag.
   */
  const setStrip = (x: number, ms: number) => {
    const el = stripRef.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${Math.round(ms)}ms cubic-bezier(.22,.9,.32,1)` : "none";
    el.style.transform = `translate3d(${x - window.innerWidth}px,0,0)`;
  };
  /** How long a slide over `dist` px takes, at the finger's speed `v` (px/ms): 160–340ms. */
  const glideMs = (dist: number, v = 0) => Math.max(160, Math.min(340, Math.abs(dist) / Math.max(1.4, Math.abs(v)) * 1.6));
  /** On to the next (1) or the previous (-1) photo: the strip slides from `from` px, then the step. Back at either end. */
  const go = (d: 1 | -1, from = 0, v = 0) => {
    const now = snapshot();
    if (!now || sliding.current) return;
    if (now.i + d < 0 || now.i + d >= now.items.length) { setStrip(0, glideMs(from)); return; }
    sliding.current = true;
    setZoom(Z0);
    const to = d > 0 ? -window.innerWidth : window.innerWidth, ms = glideMs(to - from, v);
    setStrip(to, ms);
    setTimeout(() => { sliding.current = false; stepViewer(d); }, ms);
  };
  goRef.current = go;
  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && zoomable) { pinch.current = { d0: dist(e.touches) || 1, s0: zoomRef.current.s }; start.current = null; return; }
    if (e.touches.length !== 1) { start.current = null; return; }
    const z = zoomRef.current;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), dx: 0, v: 0, pt: Date.now(), pdx: 0, axis: z.s > 1 ? "pan" : "", zx: z.x, zy: z.y };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (pinch.current && e.touches.length === 2) {
      const sc = Math.max(1, Math.min(ZMAX, (pinch.current.s0 * dist(e.touches)) / pinch.current.d0));
      setZoom(z => ({ ...z, s: sc }));
      return;
    }
    const st = start.current;
    if (!st || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - st.x, dy = e.touches[0].clientY - st.y;
    if (st.axis === "pan") { setZoom(z => ({ ...z, x: st.zx + dx, y: st.zy + dy })); return; }
    if (!st.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      st.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
    }
    if (st.axis === "y") { setDrag({ x: 0, y: Math.max(0, dy) }); return; }
    // Sideways: the strip follows the finger; past either end it gives a quarter as much.
    const atEnd = (dx > 0 && s.i === 0) || (dx < 0 && s.i === s.items.length - 1);
    st.dx = atEnd ? dx / 4 : dx;
    // The finger's speed over its last move (px/ms), for the slide that follows the release.
    const t = Date.now();
    if (t > st.pt) { st.v = 0.6 * st.v + 0.4 * ((st.dx - st.pdx) / (t - st.pt)); st.pt = t; st.pdx = st.dx; }
    if (!sliding.current) setStrip(st.dx, 0);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (pinch.current) {
      if (e.touches.length < 2) { pinch.current = null; setZoom(z => clamp(z)); }
      return;
    }
    const st = start.current;
    start.current = null;
    if (!st) return;
    if (!st.axis || (st.axis === "pan" && Math.abs(zoomRef.current.x - st.zx) < 8 && Math.abs(zoomRef.current.y - st.zy) < 8)) {
      // A double tap zooms in on a photo, and out again.
      const now = Date.now();
      if (zoomable && now - lastTap.current < 300) { lastTap.current = 0; toggleZoom(); } else lastTap.current = now;
      return;
    }
    const d = dragRef.current;
    if (st.axis === "y" && d.y > 110) { close(); return; }
    if (st.axis === "x") {
      // A third of the screen, or a flick.
      const fast = Math.abs(st.dx) > 24 && Math.abs(st.v) > 0.35 && Math.sign(st.v) === Math.sign(st.dx);
      if (Math.abs(st.dx) > window.innerWidth / 3 || fast) go(st.dx < 0 ? 1 : -1, st.dx, st.v); else setStrip(0, glideMs(st.dx));
      return;
    }
    setDrag({ x: 0, y: 0 });
  };
  // A computer: the wheel zooms, a double click zooms in / out, and a zoomed photo is dragged around.
  const onWheel = (e: React.WheelEvent) => {
    if (!zoomable) return;
    setZoom(z => clamp({ ...z, s: Math.max(1, Math.min(ZMAX, z.s * Math.exp(-e.deltaY / 400))) }));
  };
  const onMouseDown = (e: React.MouseEvent) => { if (zoomRef.current.s > 1) { mouse.current = { x: e.clientX, y: e.clientY, zx: zoomRef.current.x, zy: zoomRef.current.y }; e.preventDefault(); } };
  const onMouseMove = (e: React.MouseEvent) => { const m = mouse.current; if (m) setZoom(z => ({ ...z, x: m.zx + e.clientX - m.x, y: m.zy + e.clientY - m.y })); };
  const onMouseUp = () => { mouse.current = null; };

  const save = async () => {
    if (saving) return;
    setSaving(it.url); setNote("");
    const ok = await saveFile(it, ready[it.url] ?? null);
    setSaving("");
    if (!ok) setNote("The file could not be saved. Try again.");
  };

  const fade = Math.max(0.25, 1 - drag.y / 420);
  const moving = !!start.current || !!pinch.current || !!mouse.current;
  const doc = it.kind === "file";
  const title = doc ? it.name ?? "Document" : many ? `${s.i + 1} / ${s.items.length}` : "";
  const busy = saving === it.url;
  const btn = { flex: "none", width: "44px", height: "44px", borderRadius: "22px", border: 0, background: "rgba(255,255,255,.14)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" } as const;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={doc ? title : "Photo"} style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: doc ? `rgba(32,24,20,${fade})` : `rgba(0,0,0,${fade})`, display: "flex", flexDirection: "column", color: "#fff", fontFamily: "inherit", touchAction: doc ? "auto" : "none", overscrollBehavior: "contain" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "calc(env(safe-area-inset-top, 0px) + 8px) 8px 8px", opacity: drag.y ? fade : 1, background: doc ? "#201814" : "linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,0))", position: doc ? "relative" : "absolute", top: 0, left: 0, right: 0, zIndex: 2 }}>
        <button type="button" onClick={close} aria-label="Close" style={btn}>
          <svg width="22" height="22" viewBox="0 0 24 24" {...ICON}><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <span style={{ flex: "1", minWidth: 0, fontSize: typePx(15), fontWeight: 600, textAlign: doc ? "left" : "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <button type="button" onClick={() => void save()} aria-label="Download" title="Download" style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
          {busy
            ? <svg width="20" height="20" viewBox="0 0 24 24" {...ICON}><path d="M12 3a9 9 0 1 0 9 9"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" /></path></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" {...ICON}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>}
        </button>
      </div>
      {!!note && (<span style={{ position: "absolute", left: "50%", bottom: "calc(var(--safe-bottom, 0px) + 24px)", transform: "translateX(-50%)", zIndex: 3, padding: "10px 16px", borderRadius: "12px", background: "rgba(0,0,0,.75)", fontSize: typePx(14) }}>{note}</span>)}
      {doc ? (
        isPdf(it)
          ? <PdfPages url={it.url} />
          : previewKind(it.name, it.mime)
          ? <FilePreview file={ready[it.url] ?? null} kind={previewKind(it.name, it.mime)} />
          : <div style={{ flex: "1", display: "grid", placeItems: "center", padding: "24px", textAlign: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
                <span style={{ width: "64px", height: "76px", borderRadius: "8px", background: "#BD4A19", display: "grid", placeItems: "center", fontSize: typePx(15), fontWeight: 700 }}>{docLabel(it.name, it.mime)}</span>
                <span style={{ fontSize: typePx(15), fontWeight: 600, overflowWrap: "anywhere" }}>{title}</span>
                <button type="button" onClick={() => void save()} style={{ height: "44px", padding: "0 22px", borderRadius: "22px", border: 0, background: "#fff", color: "#201814", fontSize: typePx(15), fontWeight: 650, cursor: "pointer" }}>{busy ? "Preparing…" : "Download"}</button>
              </div>
            </div>
      ) : (
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
          onWheel={onWheel} onDoubleClick={zoomable ? toggleZoom : undefined} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onClick={e => { if (!(e.target as HTMLElement).closest("img, video") && zoom.s === 1 && !("ontouchstart" in window)) close(); }}
          style={{ position: "relative", flex: "1", minHeight: 0, overflow: "hidden", cursor: zoom.s > 1 ? "grab" : "default" }}>
          {/* The strip fills the area by its own edges, so each photo has a definite height and sits at its middle (the
              owner, 2026-10-15: "如果照片不是 full screen size 的話，就放中間而不是上面"). Every slide is drawn the same way
              whichever place it holds — only the middle one's transform does anything — so a photo moving into the middle
              keeps its element and its decoded picture: no reload as a slide ends ("還是有點卡"). */}
          <div ref={stripRef} style={{ position: "absolute", top: 0, bottom: 0, left: 0, display: "flex", width: "300vw", transform: "translate3d(-100vw,0,0)", willChange: "transform" }}>
            {[s.items[s.i - 1], it, s.items[s.i + 1]].map((m, k) => (
              <div key={m ? m.url : k === 0 ? "none-before" : "none-after"} style={{ flex: "none", position: "relative", width: "100vw", height: "100%", overflow: "hidden" }}>
                {m && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
                    transform: k === 1 ? `translate(${zoom.x}px, ${drag.y + zoom.y}px) scale(${zoom.s * (drag.y ? Math.max(0.8, 1 - drag.y / 1600) : 1)})` : "none",
                    transition: k === 1 && !moving ? "transform 200ms ease" : "none" }}>
                    {m.kind === "image"
                      ? <img src={keptSrc(m.url) ?? m.url} onLoad={() => keepImage(m.url)} alt="Photo" draggable={false} style={{ display: "block", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", userSelect: "none", WebkitUserSelect: "none" }} />
                      : k === 1
                      ? <video key={m.url + ":on"} src={m.url} controls autoPlay playsInline style={{ width: "100%", maxHeight: "100%", background: "#000", pointerEvents: "auto" }} />
                      : <video key={m.url + ":off"} src={`${m.url}#t=0.1`} muted playsInline preload="metadata" style={{ width: "100%", maxHeight: "100%", background: "#000" }} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!doc && many && zoom.s === 1 && (<>
        {s.i > 0 && (<button type="button" onClick={() => go(-1)} aria-label="Previous" style={{ ...btn, position: "absolute", left: "8px", top: "50%", width: "40px", height: "40px", marginTop: "-20px", opacity: fade }}>
          <svg width="20" height="20" viewBox="0 0 24 24" {...ICON}><path d="M15 5l-7 7 7 7" /></svg></button>)}
        {s.i < s.items.length - 1 && (<button type="button" onClick={() => go(1)} aria-label="Next" style={{ ...btn, position: "absolute", right: "8px", top: "50%", width: "40px", height: "40px", marginTop: "-20px", opacity: fade }}>
          <svg width="20" height="20" viewBox="0 0 24 24" {...ICON}><path d="M9 5l7 7-7 7" /></svg></button>)}
      </>)}
    </div>,
    document.body,
  );
}
