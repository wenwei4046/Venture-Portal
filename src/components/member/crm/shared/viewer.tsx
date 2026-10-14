"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * A chat's photos, videos and documents open INSIDE the app (the owner, 2026-10-14: "打開圖片後，沒有返回鍵能回到聊天室
 * （我要它往下滑就能回到聊天室，左右滑能看到上一張和下一張圖片/影片）… 看影片時可全屏 … pdf 也沒有返回的按鈕，需要關閉整個
 * app 才能"). They opened as a new page: in the installed app a page of our own has no browser bar, so nothing led back.
 * Now one viewer over the CRM: pull down (or ×, or the phone's Back) closes it; left / right goes to the chat's previous /
 * next photo or video; a video plays on the whole screen; a PDF is read in place under a bar with × and a download.
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

const ICON = { stroke: "currentColor", fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function MediaViewer() {
  const s = useSyncExternalStore(subscribe, snapshot, () => null);
  const open = !!s;
  const pushed = useRef(false);
  const [drag, setDrag] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number; axis: "" | "x" | "y" } | null>(null);

  // The phone's Back closes the viewer: one history step while it is open (Next's own state kept, as desk/nav.ts does).
  useEffect(() => {
    if (!open) return;
    if (!pushed.current) {
      pushed.current = true;
      try { history.pushState({ ...(history.state ?? {}), crmViewer: 1 }, ""); } catch { pushed.current = false; }
    }
    const onPop = () => { pushed.current = false; closeViewer(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") stepViewer(-1);
      else if (e.key === "ArrowRight") stepViewer(1);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey); };
  }, [open]);
  useEffect(() => { setDrag({ x: 0, y: 0 }); }, [s?.i]);

  if (!s || typeof document === "undefined") return null;
  const it = s.items[s.i], many = s.items.length > 1;
  function close() {
    if (pushed.current) { pushed.current = false; closeViewer(); try { history.back(); } catch { /* closed already */ } }
    else closeViewer();
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) { start.current = null; return; }
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: "" };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const st = start.current;
    if (!st || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - st.x, dy = e.touches[0].clientY - st.y;
    if (!st.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      st.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
    }
    setDrag(st.axis === "y" ? { x: 0, y: Math.max(0, dy) } : { x: many ? dx : dx / 4, y: 0 });
  };
  const onTouchEnd = () => {
    const st = start.current;
    start.current = null;
    if (!st?.axis) return;
    if (st.axis === "y" && drag.y > 110) { close(); return; }
    if (st.axis === "x" && Math.abs(drag.x) > 60) stepViewer(drag.x < 0 ? 1 : -1);
    setDrag({ x: 0, y: 0 });
  };

  const fade = Math.max(0.25, 1 - drag.y / 420);
  const moving = !!start.current;
  const doc = it.kind === "file";
  const title = doc ? it.name ?? "Document" : many ? `${s.i + 1} / ${s.items.length}` : "";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={doc ? title : "Photo"} style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: doc ? `rgba(32,24,20,${fade})` : `rgba(0,0,0,${fade})`, display: "flex", flexDirection: "column", color: "#fff", fontFamily: "inherit", touchAction: doc ? "auto" : "none", overscrollBehavior: "contain" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "calc(env(safe-area-inset-top, 0px) + 8px) 8px 8px", opacity: drag.y ? fade : 1, background: doc ? "#201814" : "transparent", position: doc ? "relative" : "absolute", top: 0, left: 0, right: 0, zIndex: 2 }}>
        <button type="button" onClick={close} aria-label="Close" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "22px", border: 0, background: "rgba(255,255,255,.14)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" {...ICON}><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <span style={{ flex: "1", minWidth: 0, fontSize: "15px", fontWeight: 600, textAlign: doc ? "left" : "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        <a href={it.url} download={it.name || true} aria-label="Download" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "22px", background: "rgba(255,255,255,.14)", color: "#fff", display: "grid", placeItems: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" {...ICON}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        </a>
      </div>
      {doc ? (
        isPdf(it)
          ? <iframe src={it.url} title={title} style={{ flex: "1", minHeight: 0, width: "100%", border: 0, background: "#fff" }} />
          : <div style={{ flex: "1", display: "grid", placeItems: "center", padding: "24px", textAlign: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
                <span style={{ width: "64px", height: "76px", borderRadius: "8px", background: "#BD4A19", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: 700 }}>{docLabel(it.name, it.mime)}</span>
                <span style={{ fontSize: "15px", fontWeight: 600, overflowWrap: "anywhere" }}>{title}</span>
                <a href={it.url} download={it.name || true} style={{ height: "44px", padding: "0 22px", borderRadius: "22px", background: "#fff", color: "#201814", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: 650, textDecoration: "none" }}>Download</a>
              </div>
            </div>
      ) : (
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} onClick={e => { if (e.target === e.currentTarget) close(); }}
          style={{ flex: "1", minHeight: 0, display: "grid", placeItems: "center", overflow: "hidden", transform: `translate(${drag.x}px, ${drag.y}px) scale(${drag.y ? Math.max(0.8, 1 - drag.y / 1600) : 1})`, transition: moving ? "none" : "transform 200ms ease" }}>
          {it.kind === "image"
            ? <img key={it.url} src={it.url} alt="Photo" draggable={false} style={{ maxWidth: "100vw", maxHeight: "100%", objectFit: "contain", userSelect: "none" }} />
            : <video key={it.url} src={it.url} controls autoPlay playsInline style={{ width: "100vw", maxHeight: "100%", background: "#000" }} />}
        </div>
      )}
      {!doc && many && (<>
        {s.i > 0 && (<button type="button" onClick={() => stepViewer(-1)} aria-label="Previous" style={{ position: "absolute", left: "8px", top: "50%", width: "40px", height: "40px", marginTop: "-20px", borderRadius: "20px", border: 0, background: "rgba(255,255,255,.14)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", opacity: fade }}>
          <svg width="20" height="20" viewBox="0 0 24 24" {...ICON}><path d="M15 5l-7 7 7 7" /></svg></button>)}
        {s.i < s.items.length - 1 && (<button type="button" onClick={() => stepViewer(1)} aria-label="Next" style={{ position: "absolute", right: "8px", top: "50%", width: "40px", height: "40px", marginTop: "-20px", borderRadius: "20px", border: 0, background: "rgba(255,255,255,.14)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", opacity: fade }}>
          <svg width="20" height="20" viewBox="0 0 24 24" {...ICON}><path d="M9 5l7 7-7 7" /></svg></button>)}
      </>)}
    </div>,
    document.body,
  );
}
