"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { CHAT_EMOJIS } from "./emoji";
import { clampCrop, drawBase, FULL, isEdited, noEdits, renderEdited, turnedSize, type Label, type PhotoEdits, type Rect, type Stroke } from "./edit-render";
import { prepareImage } from "./image-prep";
import { captionOf, crop916, pickedOf, type PickedItem, type PickVM } from "./pick";
import { filmStrip, lengthOf, STRIP_TILES } from "./film-strip";
import { STANDARD_VIDEO_MAX } from "./video-fit";
import { saveToDevice } from "./viewer";
import { typePx } from "./type";

/**
 * The preview as WhatsApp's editor, full screen (the owner, 2026-10-14, with WhatsApp's photo and video editors beside
 * it: "編輯工具也開始做吧"). Along the top: close, then Save · HD · Crop and turn · Sticker · Text · Draw for a photo, and
 * Save · HD with the trim bar and the sound switch under them for a video. Underneath: the picked items to switch
 * between, the caption, Send. What is done here is kept on the item (shared/pick.ts) and drawn into what is sent
 * (shared/edit-render.ts, shared/video-fit.ts).
 */
// "arrange": a video's text and stickers moved on its still frame (a playing video takes no finger).
type Mode = "" | "crop" | "draw" | "text" | "sticker" | "arrange";
/** The pen's three thicknesses, a share of the picture's shorter side (the owner, 2026-10-14: "edit 的顏色筆可以選粗度"). */
const PENS = [{ w: 0.005, dot: 6, label: "Thin" }, { w: 0.012, dot: 10, label: "Medium" }, { w: 0.026, dot: 16, label: "Thick" }] as const;
let lastPen: number = PENS[1].w;
const COLORS = ["#FFFFFF", "#111111", "#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#8E24AA"];
const ICON = { stroke: "currentColor", fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const P = {
  save: "M12 4v11M7 10l5 5 5-5M5 20h14",
  crop: "M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14",
  sticker: "M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3ZM15 3v6h6",
  draw: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
  turn: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  close: "M6 6l12 12M18 6 6 18",
  sound: "M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14",
  mute: "M11 5 6 9H2v6h4l5 4V5ZM23 9l-6 6M17 9l6 6",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  play: "M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2Z",
};
const uid = () => Math.random().toString(36).slice(2, 9);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Each photo made upright once for the editor (the same EXIF reading as the send), kept while the editor is open. */
const uprights = new Map<File, Promise<ImageBitmap | null>>();
function uprightOf(file: File): Promise<ImageBitmap | null> {
  let p = uprights.get(file);
  if (!p) {
    p = prepareImage(file, false).then(f => createImageBitmap(f)).catch(() => null);
    uprights.set(file, p);
  }
  return p;
}

/** A video's frame where its kept part starts, to draw on and arrange text over (the owner: "選好的影片也有能編輯"). */
const frames = new Map<string, Promise<ImageBitmap | null>>();
function frameOf(it: PickedItem): Promise<ImageBitmap | null> {
  const at = Math.max(0, it.cut?.start ?? 0) + 0.05, key = it.url + "@" + at.toFixed(2);
  let p = frames.get(key);
  if (!p) {
    p = new Promise<ImageBitmap | null>(resolve => {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = it.url;
      const fail = () => resolve(null);
      v.onerror = fail;
      v.onloadeddata = () => { v.currentTime = Math.min(at, Math.max(0, (v.duration || at) - 0.05)); };
      v.onseeked = () => {
        const c = document.createElement("canvas");
        c.width = v.videoWidth || 2; c.height = v.videoHeight || 2;
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        createImageBitmap(c).then(resolve, fail);
      };
      setTimeout(fail, 8000);
    });
    frames.set(key, p);
  }
  return p;
}

function Btn({ path, label, on, onClick, text }: { path?: string; label: string; on?: boolean; onClick: () => void; text?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} style={{ flex: "none", width: "40px", height: "40px", borderRadius: "20px", border: 0, background: on ? "#fff" : "rgba(40,40,40,.72)", color: on ? "#111" : "#fff", display: "grid", placeItems: "center", cursor: "pointer", fontSize: typePx(text === "HD" ? 11 : 16), fontWeight: 800, letterSpacing: text === "HD" ? ".04em" : 0, padding: 0 }}>
      {text ?? <svg width="19" height="19" viewBox="0 0 24 24" {...ICON}><path d={path} /></svg>}
    </button>
  );
}

export function PickEditor({ pk }: { pk: PickVM }) {
  const { p, set } = pk;
  const at = Math.max(0, Math.min(p.at ?? 0, p.items.length - 1)), it = p.items[at];
  const [mode, setMode] = useState<Mode>("");
  const [color, setColor] = useState(COLORS[0]);
  const [textEd, setTextEd] = useState<{ id: string | null; text: string; color: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<PickedItem>) => set({ ...p, items: p.items.map((x, i) => (i === at ? { ...x, ...patch } : x)) });
  const edits = it.edits ?? noEdits();
  // Any edit — the 9:16 fit among them — settles the camera photo's fit (`fill916`).
  const setEdits = (e: PhotoEdits) => update({ edits: e, fill916: false });
  useEffect(() => { setMode(""); setTextEd(null); }, [at]);
  useEffect(() => () => { uprights.clear(); strips.clear(); }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try { await saveToDevice(it.video ? it.file : await renderEdited(it.file, edits, true)); } finally { setSaving(false); }
  };

  if (typeof document === "undefined") return null;
  const top = { position: "absolute", top: 0, left: 0, right: 0, zIndex: 3, padding: "calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px", display: "flex", alignItems: "center", gap: "8px", background: "linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,0))" } as const;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Edit before sending" style={{ position: "fixed", inset: 0, zIndex: 2147482000, background: "#000", color: "#fff", display: "flex", flexDirection: "column", fontFamily: "Inter, -apple-system, 'Segoe UI', sans-serif", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}>
      <div style={top}>
        <Btn path={P.close} label="Cancel" onClick={pk.cancel} />
        <span style={{ flex: "1" }} />
        {mode === "" && (<>
          <Btn path={P.save} label={saving ? "Saving…" : "Save"} onClick={() => void save()} />
          <Btn label="HD" text="HD" on={p.hd} onClick={pk.toggleHd} />
          {(<>
            <Btn path={P.crop} label="Crop and turn" onClick={() => setMode("crop")} />
            <Btn path={P.sticker} label="Sticker" onClick={() => setMode("sticker")} />
            <Btn label="Text" text="Aa" onClick={() => { setMode("text"); setTextEd({ id: null, text: "", color }); }} />
            <Btn path={P.draw} label="Draw" onClick={() => setMode("draw")} />
          </>)}
        </>)}
        {(mode === "draw" || mode === "arrange") && (<>
          {mode === "draw" && <Btn path={P.undo} label="Undo" onClick={() => setEdits({ ...edits, strokes: edits.strokes.slice(0, -1) })} />}
          <button type="button" onClick={() => setMode("")} style={{ height: "40px", padding: "0 16px", borderRadius: "20px", border: 0, background: "#fff", color: "#111", fontWeight: 700, fontSize: typePx(15) }}>Done</button>
        </>)}
      </div>
      {it.video && mode === ""
        ? <VideoStage key={it.url} it={it} hd={p.hd} update={update} edits={edits} />
        : <PhotoStage key={it.url + (it.video ? ":still" : "")} it={it} base={it.video ? () => frameOf(it) : undefined} edits={edits} setEdits={setEdits} mode={mode} setMode={setMode} color={color} setColor={setColor}
            onEditText={l => { setMode("text"); setTextEd({ id: l.id, text: l.text, color: l.color }); }} />}
      {mode === "text" && textEd && (
        <TextSheet value={textEd} onChange={setTextEd} onDone={() => {
          const t = textEd.text.trim();
          const labels = edits.labels.filter(l => l.id !== textEd.id);
          const old = edits.labels.find(l => l.id === textEd.id);
          if (t) labels.push({ id: textEd.id ?? uid(), kind: "text", text: t, color: textEd.color, x: old?.x ?? 0.5, y: old?.y ?? 0.45, size: old?.size ?? 0.075 });
          setEdits({ ...edits, labels }); setColor(textEd.color); setTextEd(null); setMode(it.video && t ? "arrange" : "");
        }} />
      )}
      {mode === "sticker" && (
        <div onClick={() => setMode("")} style={{ position: "absolute", inset: 0, zIndex: 4, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxHeight: "50%", overflowY: "auto", background: "#1f1f1f", borderRadius: "18px 18px 0 0", padding: "14px 10px calc(var(--safe-bottom, 0px) + 14px)", display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "4px", touchAction: "pan-y" }}>
            {CHAT_EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => { setEdits({ ...edits, labels: [...edits.labels, { id: uid(), kind: "sticker", text: e, color: "#000", x: 0.5, y: 0.45, size: 0.16 }] }); setMode(it.video ? "arrange" : ""); }}
                style={{ height: "44px", border: 0, background: "transparent", fontSize: typePx(28), cursor: "pointer", padding: 0 }}>{e}</button>
            ))}
          </div>
        </div>
      )}
      {/* The items, the caption and Send float over the picture (the owner, 2026-10-15: "Photo should be at center point"):
          the picture takes the whole screen and sits at its middle, as WhatsApp's — it sat above the middle, over this strip. */}
      {mode !== "crop" && mode !== "text" && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 3, padding: "8px 12px calc(var(--safe-bottom, 0px) + 10px)", display: "flex", flexDirection: "column", gap: "10px", background: "linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.6))" }}>
          {(
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", touchAction: "pan-x" }}>
              {/* More photos or videos, ticked several at a time (the owner: "可以勾選多張圖片一起發送"). */}
              <label aria-label="Add more" style={{ flex: "none", width: "52px", height: "52px", borderRadius: "8px", border: "2px dashed rgba(255,255,255,.5)", display: "grid", placeItems: "center", cursor: "pointer", fontSize: typePx(26), fontWeight: 300 }}>+
                <input type="file" accept="image/*,video/*" multiple style={{ display: "none" }} onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) set({ ...p, items: [...p.items, ...pickedOf(fs).items], at: p.items.length }); }} />
              </label>
              {p.items.map((x, i) => (
                <button key={x.url} type="button" onClick={() => set({ ...p, at: i })} aria-label={`Item ${i + 1}`} style={{ flex: "none", width: "52px", height: "52px", padding: 0, borderRadius: "8px", overflow: "hidden", border: i === at ? "2px solid #fff" : "2px solid transparent", background: "#222", cursor: "pointer" }}>
                  {x.video ? <video src={x.url} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={x.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <input value={captionOf(p, at)} onChange={e => update({ caption: e.target.value })} placeholder={p.items.length > 1 ? `Add a caption to ${it.video ? "this video" : "this photo"}…` : "Add a caption…"} style={{ flex: "1", minWidth: 0, height: "46px", padding: "0 16px", borderRadius: "23px", border: "1px solid rgba(255,255,255,.25)", background: "rgba(30,30,30,.85)", color: "#fff", fontSize: typePx(16), outline: "none", userSelect: "text", WebkitUserSelect: "text" }} />
            <button type="button" onClick={pk.send} aria-label={pk.sendLabel} style={{ flex: "none", width: "50px", height: "50px", borderRadius: "25px", border: 0, background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", position: "relative" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" {...ICON}><path d={P.send} /></svg>
              {p.items.length > 1 && <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "20px", height: "20px", borderRadius: "10px", background: "#fff", color: "#BD4A19", fontSize: typePx(12), fontWeight: 800, display: "grid", placeItems: "center" }}>{p.items.length}</span>}
            </button>
          </div>
          <span style={{ fontSize: typePx(12), color: "rgba(255,255,255,.75)" }}>{pk.note}</span>
        </div>
      )}
    </div>,
    document.body,
  );
}

/* ── A photo: the canvas, what is drawn on it, and the crop frame ─────────────────────────────────────────────────── */
function PhotoStage({ it, base, edits, setEdits, mode, setMode, color, setColor, onEditText }: {
  it: PickedItem; base?: () => Promise<ImageBitmap | null>; edits: PhotoEdits; setEdits: (e: PhotoEdits) => void; mode: Mode; setMode: (m: Mode) => void;
  color: string; setColor: (c: string) => void; onEditText: (l: Label) => void;
}) {
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [live, setLive] = useState<Stroke | null>(null);
  const [pen, setPen] = useState(lastPen);
  const [crop, setCrop] = useState<Rect>(edits.crop);
  const [moving, setMoving] = useState<{ id: string; x: number; y: number; trash: boolean } | null>(null);
  const drag = useRef<{ kind: "label" | "crop"; id?: string; handle?: string; x0: number; y0: number; r0: Rect | { x: number; y: number }; moved: boolean } | null>(null);

  useEffect(() => { let on = true; void (base ? base() : uprightOf(it.file)).then(b => { if (on) setBmp(b); }); return () => { on = false; }; }, [it.file]); // eslint-disable-line react-hooks/exhaustive-deps -- one picture per item
  // A camera photo, its size now known: cropped to 9:16 once, as long as nothing was edited yet.
  useEffect(() => {
    if (!bmp || !it.fill916) return;
    const c = !isEdited(edits) ? crop916(bmp.width, bmp.height) : null;
    setEdits(c ? { ...edits, crop: c } : edits);
  }, [bmp, it.fill916]); // eslint-disable-line react-hooks/exhaustive-deps -- once, when the picture arrives
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (mode === "crop") setCrop(edits.crop); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps -- a fresh frame each time crop opens

  const cropping = mode === "crop";
  const shown = cropping ? { ...edits, crop: FULL, strokes: [], labels: [] } : edits;
  const t = bmp ? turnedSize(bmp.width, bmp.height, edits.turn) : { w: 3, h: 4 };
  const fw = shown.crop.w * t.w, fh = shown.crop.h * t.h;
  const pad = cropping ? 28 : 0;
  const k = Math.min((area.w - pad * 2) / fw, (area.h - pad * 2) / fh) || 0;
  const W = Math.max(1, Math.floor(fw * k)), H = Math.max(1, Math.floor(fh * k));

  useEffect(() => {
    const c = canvas.current;
    if (!c || !bmp || !W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    drawBase(g, bmp, bmp.width, bmp.height, shown, c.width, c.height);
  }, [bmp, W, H, edits.turn, cropping, edits.crop.x, edits.crop.y, edits.crop.w, edits.crop.h]); // eslint-disable-line react-hooks/exhaustive-deps -- drawn again only when what it shows changes

  const local = (e: RPointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))] as [number, number];
  };
  const u = Math.min(W, H);

  // Drawing: a finger leaves a line in the chosen colour.
  const drawDown = (e: RPointerEvent) => { if (mode !== "draw") return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setLive({ color, width: pen, pts: [local(e)] }); };
  const drawMove = (e: RPointerEvent) => { if (live) setLive({ ...live, pts: [...live.pts, local(e)] }); };
  const drawUp = () => { if (live) { setEdits({ ...edits, strokes: [...edits.strokes, live] }); setLive(null); } };

  // Text and stickers are moved by a finger; dropped on the bin they go; a tap on a text edits it.
  const labelDown = (e: RPointerEvent, l: Label) => {
    if (mode === "draw") return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: "label", id: l.id, x0: e.clientX, y0: e.clientY, r0: { x: l.x, y: l.y }, moved: false };
  };
  const labelMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.kind !== "label") return;
    const dx = (e.clientX - d.x0) / W, dy = (e.clientY - d.y0) / H;
    if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 6) d.moved = true;
    const r0 = d.r0 as { x: number; y: number };
    const trash = e.clientY > window.innerHeight - 150 && Math.abs(e.clientX - window.innerWidth / 2) < 70;
    setMoving({ id: d.id!, x: Math.max(0, Math.min(1, r0.x + dx)), y: Math.max(0, Math.min(1, r0.y + dy)), trash });
  };
  const labelUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== "label") return;
    const l = edits.labels.find(x => x.id === d.id);
    if (!d.moved) { setMoving(null); if (l?.kind === "text") onEditText(l); return; }
    if (moving?.trash) setEdits({ ...edits, labels: edits.labels.filter(x => x.id !== d.id) });
    else if (moving) setEdits({ ...edits, labels: edits.labels.map(x => (x.id === d.id ? { ...x, x: moving.x, y: moving.y } : x)) });
    setMoving(null);
  };

  // The crop frame: its corners resize it, its middle moves it.
  const cropDown = (e: RPointerEvent, handle: string) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: "crop", handle, x0: e.clientX, y0: e.clientY, r0: crop, moved: false };
  };
  const cropMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.kind !== "crop") return;
    const r = d.r0 as Rect, dx = (e.clientX - d.x0) / W, dy = (e.clientY - d.y0) / H;
    let n: Rect = { ...r };
    if (d.handle === "move") n = { ...r, x: r.x + dx, y: r.y + dy };
    else {
      if (d.handle!.includes("l")) n = { ...n, x: Math.min(r.x + dx, r.x + r.w - 0.08), w: r.w - Math.min(dx, r.w - 0.08) };
      if (d.handle!.includes("r")) n = { ...n, w: r.w + dx };
      if (d.handle!.includes("t")) n = { ...n, y: Math.min(r.y + dy, r.y + r.h - 0.08), h: r.h - Math.min(dy, r.h - 0.08) };
      if (d.handle!.includes("b")) n = { ...n, h: r.h + dy };
      n = { x: Math.max(0, n.x), y: Math.max(0, n.y), w: Math.min(n.w, 1 - Math.max(0, n.x)), h: Math.min(n.h, 1 - Math.max(0, n.y)) };
    }
    setCrop(clampCrop(n));
  };

  const corner = (h: string, st: React.CSSProperties) => (
    <span key={h} onPointerDown={e => cropDown(e, h)} onPointerMove={cropMove} onPointerUp={() => { drag.current = null; }}
      style={{ position: "absolute", width: "34px", height: "34px", margin: "-17px", touchAction: "none", ...st }}>
      <span style={{ position: "absolute", inset: "11px", borderRadius: "3px", background: "#fff" }} />
    </span>
  );

  return (
    <>
      <div ref={box} style={{ flex: "1", minHeight: 0, display: "grid", placeItems: "center", overflow: "hidden", paddingTop: cropping ? "64px" : 0 }}>
        <div style={{ position: "relative", width: `${W}px`, height: `${H}px` }}>
          <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          {!cropping && (
            <div onPointerDown={drawDown} onPointerMove={drawMove} onPointerUp={drawUp} onPointerCancel={drawUp} style={{ position: "absolute", inset: 0, touchAction: "none", cursor: mode === "draw" ? "crosshair" : "default" }}>
              <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {[...edits.strokes, ...(live ? [live] : [])].map((s, i) => (
                  <polyline key={i} points={s.pts.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width * u} strokeLinecap="round" strokeLinejoin="round" />
                ))}
              </svg>
              {edits.labels.map(l => {
                const m = moving?.id === l.id ? moving : null, px = l.size * u;
                return (
                  <span key={l.id} onPointerDown={e => labelDown(e, l)} onPointerMove={labelMove} onPointerUp={labelUp} onPointerCancel={labelUp}
                    style={{ position: "absolute", left: `${(m?.x ?? l.x) * 100}%`, top: `${(m?.y ?? l.y) * 100}%`, transform: `translate(-50%, -50%) scale(${m?.trash ? 0.6 : 1})`, opacity: m?.trash ? 0.6 : 1,
                      fontSize: `${px}px`, lineHeight: 1.2, fontWeight: l.kind === "text" ? 700 : 400, color: l.color, whiteSpace: "pre", textAlign: "center", touchAction: "none", cursor: "grab",
                      textShadow: l.kind === "text" ? (l.color === "#FFFFFF" ? "0 0 4px rgba(0,0,0,.6)" : "0 0 4px rgba(255,255,255,.8)") : "none", padding: "4px" }}>{l.text}</span>
                );
              })}
            </div>
          )}
          {cropping && (
            <div style={{ position: "absolute", inset: 0 }}>
              <div onPointerDown={e => cropDown(e, "move")} onPointerMove={cropMove} onPointerUp={() => { drag.current = null; }}
                style={{ position: "absolute", left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, boxShadow: "0 0 0 9999px rgba(0,0,0,.55)", outline: "2px solid #fff", touchAction: "none", cursor: "move",
                  backgroundImage: "linear-gradient(rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.35) 1px, transparent 1px)", backgroundSize: "33.34% 33.34%", backgroundPosition: "-1px -1px" }}>
                {corner("tl", { left: 0, top: 0 })}{corner("tr", { left: "100%", top: 0 })}{corner("bl", { left: 0, top: "100%" })}{corner("br", { left: "100%", top: "100%" })}
              </div>
            </div>
          )}
        </div>
      </div>
      {moving && (
        <span style={{ position: "absolute", left: "50%", bottom: "calc(var(--safe-bottom, 0px) + 90px)", transform: "translateX(-50%)", zIndex: 5, width: "56px", height: "56px", borderRadius: "28px", background: moving.trash ? "#E53935" : "rgba(40,40,40,.85)", display: "grid", placeItems: "center" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" {...ICON}><path d={P.trash} /></svg>
        </span>
      )}
      {mode === "draw" && (
        <div style={{ position: "absolute", right: "12px", top: "calc(env(safe-area-inset-top, 0px) + 64px)", zIndex: 3, display: "flex", flexDirection: "column", gap: "8px" }}>
          {COLORS.map(c => <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} style={{ width: "26px", height: "26px", borderRadius: "13px", border: c === color ? "3px solid #fff" : "2px solid rgba(255,255,255,.6)", background: c, padding: 0, cursor: "pointer" }} />)}
          <span style={{ height: "1px", margin: "2px 3px", background: "rgba(255,255,255,.35)" }} />
          {PENS.map(p => (
            <button key={p.label} type="button" aria-label={`${p.label} pen`} title={`${p.label} pen`} onClick={() => { lastPen = p.w; setPen(p.w); }}
              style={{ width: "26px", height: "26px", borderRadius: "13px", border: pen === p.w ? "2px solid #fff" : "2px solid transparent", background: "rgba(40,40,40,.72)", display: "grid", placeItems: "center", padding: 0, cursor: "pointer" }}>
              <span style={{ width: `${p.dot}px`, height: `${p.dot}px`, borderRadius: "50%", background: color }} />
            </button>
          ))}
        </div>
      )}
      {cropping && (
        <div style={{ flex: "none", zIndex: 3, padding: "12px 16px calc(var(--safe-bottom, 0px) + 14px)", display: "flex", alignItems: "center", gap: "10px" }}>
          <button type="button" onClick={() => setMode("")} style={{ height: "42px", padding: "0 16px", borderRadius: "21px", border: 0, background: "transparent", color: "#fff", fontSize: typePx(15), fontWeight: 600 }}>Cancel</button>
          <span style={{ flex: "1" }} />
          <Btn path={P.turn} label="Turn" onClick={() => { setEdits({ ...edits, turn: ((edits.turn + 3) % 4) as PhotoEdits["turn"], crop: { ...FULL } }); setCrop({ ...FULL }); }} />
          <button type="button" onClick={() => setCrop({ ...FULL })} style={{ height: "42px", padding: "0 14px", borderRadius: "21px", border: 0, background: "transparent", color: "#fff", fontSize: typePx(15), fontWeight: 600 }}>Reset</button>
          <span style={{ flex: "1" }} />
          <button type="button" onClick={() => { setEdits({ ...edits, crop }); setMode(""); }} style={{ height: "42px", padding: "0 20px", borderRadius: "21px", border: 0, background: "#fff", color: "#111", fontSize: typePx(15), fontWeight: 700 }}>Done</button>
        </div>
      )}
    </>
  );
}

/* ── Typing a text ───────────────────────────────────────────────────────────────────────────────────────────────── */
function TextSheet({ value, onChange, onDone }: { value: { id: string | null; text: string; color: string }; onChange: (v: { id: string | null; text: string; color: string }) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 6, background: "rgba(0,0,0,.6)", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 16px", gap: "14px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={onDone} style={{ height: "40px", padding: "0 18px", borderRadius: "20px", border: 0, background: "#fff", color: "#111", fontWeight: 700, fontSize: typePx(15) }}>Done</button>
      </div>
      <textarea ref={ref} value={value.text} onChange={e => onChange({ ...value, text: e.target.value })} rows={3} placeholder="Type something"
        style={{ width: "100%", border: 0, outline: "none", background: "transparent", color: value.color, fontSize: typePx(30), fontWeight: 700, textAlign: "center", resize: "none", fontFamily: "inherit", userSelect: "text", WebkitUserSelect: "text", textShadow: value.color === "#FFFFFF" ? "0 0 4px rgba(0,0,0,.6)" : "0 0 4px rgba(255,255,255,.8)" }} />
      <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
        {COLORS.map(c => <button key={c} type="button" aria-label={c} onClick={() => onChange({ ...value, color: c })} style={{ width: "28px", height: "28px", borderRadius: "14px", border: c === value.color ? "3px solid #fff" : "2px solid rgba(255,255,255,.6)", background: c, padding: 0, cursor: "pointer" }} />)}
      </div>
    </div>
  );
}

/* ── A video: the player, the part kept, its sound ───────────────────────────────────────────────────────────────── */
/** Each video's film strip (shared/film-strip.ts), kept while the editor is open: a tool or another item draws it once. */
const strips = new Map<string, string[]>();
function useFilmStrip(url: string): (string | null)[] {
  const [tiles, setTiles] = useState<(string | null)[]>(() => strips.get(url) ?? Array<string | null>(STRIP_TILES).fill(null));
  useEffect(() => {
    if (strips.has(url)) return;
    let off = false;
    const got = Array<string | null>(STRIP_TILES).fill(null);
    void filmStrip(url, STRIP_TILES, (i, src) => { got[i] = src; if (!off) setTiles([...got]); }, () => off)
      .then(ok => { if (ok) strips.set(url, got as string[]); }, () => {});
    return () => { off = true; };
  }, [url]);
  return tiles;
}

// Full screen, as WhatsApp's (the owner, 2026-10-17, with WhatsApp's editor beside ours: "Why is not full screen? Like
// this" — the video sat small under the trim bar, the browser's controls over it): the video fills the screen at its
// middle as a photo does, the trim bar — a film strip — and the strip below float over it, a tap plays or pauses it.
function VideoStage({ it, hd, update, edits }: { it: PickedItem; hd: boolean; update: (p: Partial<PickedItem>) => void; edits: PhotoEdits }) {
  const box = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), bar = useRef<HTMLDivElement>(null), head = useRef<HTMLSpanElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [playing, setPlaying] = useState(false);
  const tiles = useFilmStrip(it.url);
  const turned = edits.turn !== 0 || edits.crop.x !== 0 || edits.crop.y !== 0 || edits.crop.w !== 1 || edits.crop.h !== 1;
  const dur = it.seconds ?? 0;
  const cut = it.cut ?? { start: 0, end: dur, mute: false };
  const end = cut.end || dur;
  const drag = useRef<"start" | "end" | null>(null);
  // What a frame, a length read late or the line along the strip reads: this render's, never the one they began in.
  const now = useRef({ it, update, start: cut.start, end, dur });
  now.current = { it, update, start: cut.start, end, dur };

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { const v = video.current; if (v) v.muted = cut.mute; }, [cut.mute]);

  // The white line along the strip stands where the video is; while it plays it moves each frame, and the kept part
  // loops there.
  const place = () => {
    const v = video.current, h = head.current, n = now.current;
    if (!v || !h || !n.dur) return;
    if (!v.paused && (v.currentTime >= n.end - 0.02 || v.currentTime < n.start - 0.05)) v.currentTime = n.start;
    h.style.left = `${Math.max(0, Math.min(100, (v.currentTime / n.dur) * 100))}%`;
  };
  useEffect(() => {
    if (!playing) return;
    let raf = requestAnimationFrame(function tick() { place(); raf = requestAnimationFrame(tick); });
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (!v.paused) { v.pause(); return; }
    if (v.currentTime >= end - 0.02 || v.currentTime < cut.start) v.currentTime = cut.start;
    void v.play()?.catch(() => {});
  };
  // Its size, then its length — a WebM the phone recorded is read through for it — then the kept part's first picture
  // (an iPhone draws none until a seek).
  const loaded = (v: HTMLVideoElement) => {
    setSize({ w: v.videoWidth, h: v.videoHeight });
    void lengthOf(v).then(d => {
      const n = now.current;
      if (d > 0 && !n.it.seconds) n.update({ seconds: d, cut: n.it.cut ?? { start: 0, end: d, mute: false } });
      v.currentTime = Math.max(0.001, n.start);
    });
  };
  const handle = (e: RPointerEvent) => {
    const r = bar.current?.getBoundingClientRect(), which = drag.current;
    if (!r || !which || !dur) return;
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
    const next = which === "start" ? { ...cut, end, start: Math.min(s, end - 0.5) } : { ...cut, end: Math.max(s, cut.start + 0.5) };
    update({ cut: next });
    const v = video.current;
    if (v) { v.pause(); v.currentTime = which === "start" ? next.start : next.end; }
  };
  const grab = (e: RPointerEvent, w: "start" | "end") => {
    drag.current = w;
    try { (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId); } catch { /* a pointer already gone */ }
  };
  const kept = Math.max(0, end - cut.start);
  const est = dur ? Math.min(it.file.size * (kept / dur), hd ? Infinity : STANDARD_VIDEO_MAX) : it.file.size;
  const pct = (s: number) => `${dur ? (s / dur) * 100 : 0}%`;
  // The picture's own place on the screen (contained, at its middle), for what was drawn over it.
  const k = size.w && size.h ? Math.min(area.w / size.w, area.h / size.h) : 0;
  const W = Math.round(size.w * k), H = Math.round(size.h * k), u = Math.min(W, H);
  const chip = { padding: "6px 10px", borderRadius: "8px", background: "rgba(40,40,40,.72)", fontSize: typePx(13), fontWeight: 600 } as const;

  return (
    <>
      <div ref={box} style={{ flex: "1", minHeight: 0, position: "relative", overflow: "hidden" }}>
        <video ref={video} src={it.url} data-editor-video="" playsInline loop preload="auto" onClick={toggle}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={place} onSeeked={place}
          onLoadedMetadata={e => loaded(e.currentTarget)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block", cursor: "pointer" }} />
        {/* What was drawn, typed or stuck on shows over the video as it plays; a turn or crop shows once sent. */}
        {!turned && W > 0 && (edits.strokes.length > 0 || edits.labels.length > 0) && (
          <span style={{ position: "absolute", left: `${Math.round((area.w - W) / 2)}px`, top: `${Math.round((area.h - H) / 2)}px`, width: W + "px", height: H + "px", pointerEvents: "none" }}>
            <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
              {edits.strokes.map((s, i) => <polyline key={i} points={s.pts.map(([x, y]) => `${x * W},${y * H}`).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width * u} strokeLinecap="round" strokeLinejoin="round" />)}
            </svg>
            {edits.labels.map(l => (
              <span key={l.id} style={{ position: "absolute", left: `${l.x * 100}%`, top: `${l.y * 100}%`, transform: "translate(-50%, -50%)", fontSize: `${l.size * u}px`, lineHeight: 1.2, fontWeight: l.kind === "text" ? 700 : 400, color: l.color, whiteSpace: "pre", textAlign: "center" }}>{l.text}</span>
            ))}
          </span>
        )}
        {!playing && (
          <button type="button" aria-label="Play" onClick={toggle} style={{ position: "absolute", left: "50%", top: "50%", width: "64px", height: "64px", margin: "-32px 0 0 -32px", borderRadius: "32px", border: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", cursor: "pointer", padding: 0 }}>
            <svg width="28" height="28" viewBox="0 0 24 24"><path d={P.play} fill="#fff" /></svg>
          </button>
        )}
      </div>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "calc(env(safe-area-inset-top, 0px) + 170px)", zIndex: 2, pointerEvents: "none", background: "linear-gradient(rgba(0,0,0,.4), rgba(0,0,0,0))" }} />
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 62px)", left: "12px", right: "12px", zIndex: 3, display: "flex", flexDirection: "column", gap: "8px" }}>
        <div ref={bar} data-trim-bar="" onPointerMove={handle} onPointerUp={() => { drag.current = null; }} style={{ position: "relative", height: "48px", touchAction: "none" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", borderRadius: "8px", overflow: "hidden", background: "rgba(255,255,255,.18)", pointerEvents: "none" }}>
            {tiles.map((src, i) => <span key={i} style={{ flex: "1", minWidth: 0 }}>{src && <img src={src} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />}</span>)}
          </div>
          {/* Outside the kept part the strip is dimmed, as WhatsApp's. */}
          <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: pct(cut.start), borderRadius: "8px 0 0 8px", background: "rgba(0,0,0,.55)", pointerEvents: "none" }} />
          <span style={{ position: "absolute", top: 0, bottom: 0, left: pct(end), right: 0, borderRadius: "0 8px 8px 0", background: "rgba(0,0,0,.55)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(cut.start), right: `calc(100% - ${pct(end)})`, border: "3px solid #fff", borderRadius: "8px", boxSizing: "border-box", pointerEvents: "none" }} />
          <span ref={head} data-play-line="" style={{ position: "absolute", top: "3px", bottom: "3px", width: "2px", marginLeft: "-1px", borderRadius: "1px", background: "#fff", boxShadow: "0 0 2px rgba(0,0,0,.6)", pointerEvents: "none", display: dur ? "block" : "none" }} />
          {(["start", "end"] as const).map(w => (
            <span key={w} data-trim-handle={w} onPointerDown={e => grab(e, w)}
              style={{ position: "absolute", top: 0, bottom: 0, left: pct(w === "start" ? cut.start : end), width: "22px", marginLeft: "-11px", display: "grid", placeItems: "center", touchAction: "none", cursor: "ew-resize" }}>
              <span style={{ width: "10px", height: "48px", borderRadius: "4px", background: "#fff", color: "#111", fontSize: typePx(11), fontWeight: 800, display: "grid", placeItems: "center" }}>{w === "start" ? "‹" : "›"}</span>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Btn path={cut.mute ? P.mute : P.sound} label={cut.mute ? "Sound off" : "Sound on"} on={cut.mute} onClick={() => update({ cut: { ...cut, end, mute: !cut.mute } })} />
          <span style={chip}>{clock(kept)} · {hd ? "" : "up to "}{mb(est)}</span>
          {turned && <span style={chip}>Turned or cropped · shown once sent</span>}
        </div>
      </div>
    </>
  );
}
