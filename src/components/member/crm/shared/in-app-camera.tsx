"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useBackCloses } from "./back";
import { typePx } from "./type";
import {
  HOLD_MS, MAX_RECORD_S, MIN_RECORD_MS, cameraOpenFor, clampZoom, closeInAppCamera, cropOf, handToChat, openSystemCamera, pinchZoom,
  recClock, recordType, shotName, slideZoom, subscribeCamera, zoomLabel, zoomRangeOf, type ZoomRange,
} from "./camera";

/**
 * The chat's camera inside the app, as WhatsApp's (2026-10-17 — the owner: "一按相机就直接打开，拍照直接 capture。而不是先跳去
 * 系统的 camera，按 save、use 之后再跳回去 … 做成类似 WhatsApp 的体验：一开 camera 就直接进入相机界面，拍完照直接就能用 …
 * include with video as well"). The camera's picture fills the screen as the button is pressed; a tap of the shutter takes
 * a photo, holding it records a video (on the Video side a tap starts and a tap stops); either goes straight to the
 * chat's preview — caption, HD, edits, as a photo from the gallery — with no "Use photo" step (shared/camera.ts ›
 * handToChat). The flash (where the phone lends its torch), the other camera, and Photos beside the shutter. Refused or
 * missing, the screen says so and offers the phone's own camera. The camera is let go the moment the screen closes or
 * the app goes behind another (the phone's green dot goes out), and taken again on coming back.
 *
 * Zoom (the same evening — "the camera and video cannot zoom in, suppose for video when long press then move upwards it
 * will zoom in"): the held shutter slid up zooms in and slid down zooms back out, as WhatsApp's; two fingers on the
 * picture pinch it; the zoom shows above the shutter, a tap on it back to 1×. The camera's own zoom where the phone lends
 * it (Android: the track's `zoom`) — the photo and the video come from the zoomed picture as they are; else the app's
 * (an iPhone): the picture's middle shown larger, the photo cropped to it, and a video recorded from a canvas drawn with
 * that crop, so what is filmed is what is seen.
 *
 * One per chat screen, beside the hidden camera input it hands to (sales/SalesScreens, panel/PanelScreens).
 */
export function InAppCamera({ inputId, galleryId, warn }: { inputId: string; galleryId: string; warn: (text: string) => void }) {
  const open = useSyncExternalStore(subscribeCamera, cameraOpenFor, () => null) === inputId;
  // The phone's Back closes the camera, back to the chat. Held here, where the chat's screen keeps it, not in the camera
  // screen: one that mounts afresh at each opening would take its history step back at once wherever React mounts a
  // screen twice to check it (development), and the camera closed as it opened.
  useBackCloses(open, closeInAppCamera, "crmCamera");
  if (!open || typeof document === "undefined") return null;
  return createPortal(<CameraScreen inputId={inputId} galleryId={galleryId} warn={warn} />, document.body);
}

type Facing = "environment" | "user";
type Status = "starting" | "live" | "denied" | "failed";
// `zoom: true` asks for the camera's own zoom where the browser keeps it behind its own permission (Chrome).
const ask = (face: Facing, audio: boolean, zoom: boolean): MediaStreamConstraints => ({
  video: { facingMode: { ideal: face }, width: { ideal: 1920 }, height: { ideal: 1080 }, ...(zoom ? { zoom: true } : {}) } as MediaTrackConstraints,
  audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
});
const errName = (e: unknown) => (e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "");
/** A video recorded from the canvas (the app's own zoom): its long side at most this, as the channel takes it anyway. */
const CANVAS_LONG_SIDE = 1280;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

const WHITE = "rgb(255 255 255)", RED = "rgb(234 67 53)", FONT = "Inter, -apple-system, 'Segoe UI', sans-serif";
const ROUND = { width: "44px", height: "44px", borderRadius: "22px", border: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.38)", color: WHITE, cursor: "pointer", padding: 0 } as const;

type Press = { timer: ReturnType<typeof setTimeout> | null; holding: boolean; y: number; z: number; video: boolean; moved: boolean };
/** A finger kept by the element it pressed, even off it — a pointer already gone (a quick tap) is none to keep. */
const hold = (e: ReactPointerEvent<HTMLElement>) => { try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* gone already */ } };

function CameraScreen({ inputId, galleryId, warn }: { inputId: string; galleryId: string; warn: (text: string) => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const drawing = useRef<(() => void) | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keep = useRef(false);
  const gen = useRef(0);
  const press = useRef<Press | null>(null);
  const range = useRef<ZoomRange>(zoomRangeOf(null));
  const zoomNow = useRef(1);
  const lens = useRef<{ want: number | null; busy: boolean }>({ want: null, busy: false });
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ spread: number; z: number } | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [facing, setFacing] = useState<Facing>("environment");
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [since, setSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [flash, setFlash] = useState(false);
  const [zoom, setZoomShown] = useState(1);
  const [nativeZoom, setNativeZoom] = useState(false);
  const canRecord = typeof MediaRecorder !== "undefined";

  const close = useCallback(() => closeInAppCamera(), []);

  const stopDrawing = () => { drawing.current?.(); drawing.current = null; };

  const release = useCallback(() => {
    gen.current++;
    const r = recorder.current;
    recorder.current = null;
    if (r && r.state !== "inactive") { keep.current = false; try { r.stop(); } catch { /* stopped */ } }
    stopDrawing();
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    setSince(null);
    setTorch(null);
  }, []);

  const start = useCallback(async (face: Facing) => {
    release();
    const mine = gen.current;
    setStatus("starting");
    let s: MediaStream | null = null, failure: unknown = null;
    // With sound and the camera's own zoom; the microphone refused or missing, without sound (photos, silent videos);
    // last, without asking for the zoom.
    for (const c of [ask(face, true, true), ask(face, false, true), ask(face, false, false)]) {
      try { s = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { failure = e; }
    }
    if (!s) {
      if (mine === gen.current) setStatus(errName(failure) === "NotAllowedError" || errName(failure) === "SecurityError" ? "denied" : "failed");
      return;
    }
    if (mine !== gen.current) { s.getTracks().forEach(t => t.stop()); return; }
    stream.current = s;
    const v = video.current;
    if (v) { v.srcObject = s; void v.play().catch(() => undefined); }
    const track = s.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean; zoom?: { min?: number; max?: number; step?: number } };
    setTorch(caps.torch ? false : null);
    range.current = zoomRangeOf(caps);
    setNativeZoom(range.current.native);
    const set = (track?.getSettings?.() ?? {}) as MediaTrackSettings & { zoom?: number };
    zoomNow.current = clampZoom(range.current.native ? set.zoom ?? range.current.min : 1, range.current);
    setZoomShown(zoomNow.current);
    setStatus("live");
  }, [release]);

  useEffect(() => {
    void start(facing);
    return () => release();
  }, [facing, start, release]);

  // Behind another app the camera is let go; on coming back it is taken again.
  useEffect(() => {
    const back = () => { if (document.visibilityState === "hidden") release(); else if (!stream.current) void start(facing); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [facing, release, start]);

  // The recording's clock, and its end at three minutes.
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => {
      const s = (Date.now() - since) / 1000;
      setElapsed(s);
      if (s >= MAX_RECORD_S) stopRecording(true);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopRecording reads refs only
  }, [since]);

  // The zoom: the camera's own, asked of the lens one request at a time (the latest wins), or the app's (a CSS scale here,
  // the crop at capture).
  const setZoom = useCallback((want: number) => {
    const r = range.current;
    const z = clampZoom(want, r);
    if (z === zoomNow.current) return;
    zoomNow.current = z;
    setZoomShown(z);
    if (!r.native) return;
    const l = lens.current;
    l.want = z;
    if (l.busy) return;
    l.busy = true;
    void (async () => {
      while (l.want !== null) {
        const w = l.want;
        l.want = null;
        try { await stream.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ zoom: w } as MediaTrackConstraintSet] }); } catch { /* the lens kept its zoom */ }
      }
      l.busy = false;
    })();
  }, []);

  const done = useCallback((file: File) => {
    close();
    // The preview opens on the chat once the camera has gone (its step in the history goes back first).
    setTimeout(() => { if (!handToChat(inputId, file)) warn("The photo could not be added. Try again."); }, 0);
  }, [close, inputId, warn]);

  const takePhoto = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth || status !== "live") return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const g = c.getContext("2d");
    if (g) {
      // The app's own zoom keeps the picture's middle, drawn at the photo's full size; the camera's own is in the picture.
      const { sx, sy, sw, sh } = cropOf(v.videoWidth, v.videoHeight, range.current.native ? 1 : zoomNow.current);
      g.imageSmoothingQuality = "high";
      g.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    c.toBlob(b => { if (b) done(new File([b], shotName("photo", "image/jpeg"), { type: "image/jpeg", lastModified: Date.now() })); }, "image/jpeg", 0.92);
  }, [done, status]);

  /** What the recorder films: the camera as it is, or — with the app's own zoom — a canvas drawn with the zoom's crop. */
  const filmed = (s: MediaStream): MediaStream => {
    const v = video.current;
    if (range.current.native || !v || !v.videoWidth || typeof MediaStream === "undefined") return s;
    const c = document.createElement("canvas");
    if (typeof c.captureStream !== "function") return s;
    const k = Math.min(1, CANVAS_LONG_SIDE / Math.max(v.videoWidth, v.videoHeight));
    c.width = even(v.videoWidth * k);
    c.height = even(v.videoHeight * k);
    const g = c.getContext("2d");
    if (!g) return s;
    let frame = 0;
    const draw = () => {
      const { sx, sy, sw, sh } = cropOf(v.videoWidth, v.videoHeight, zoomNow.current);
      g.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
      frame = requestAnimationFrame(draw);
    };
    draw();
    let drawn: MediaStream | null = null;
    try { drawn = c.captureStream(30); } catch { drawn = null; }
    const picture = typeof drawn?.getVideoTracks === "function" ? drawn.getVideoTracks() : [];
    drawing.current = () => { cancelAnimationFrame(frame); picture.forEach(t => t.stop()); };
    // A browser whose canvas lends no picture to record: the camera as it is.
    if (!picture.length) { stopDrawing(); return s; }
    return new MediaStream([...picture, ...s.getAudioTracks()]);
  };

  const startRecording = useCallback((): boolean => {
    const s = stream.current;
    if (!s || !canRecord || recorder.current) return false;
    const type = recordType(t => MediaRecorder.isTypeSupported(t));
    const options = { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 };
    let r: MediaRecorder;
    try { r = new MediaRecorder(filmed(s), options); }
    catch {
      // The canvas would not record here: the camera as it is.
      stopDrawing();
      try { r = new MediaRecorder(s, options); } catch { return false; }
    }
    const began = Date.now();
    chunks.current = [];
    keep.current = true;
    r.ondataavailable = e => { if (e.data && e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      stopDrawing();
      const kind = (r.mimeType || type || "video/webm").split(";")[0];
      const blob = new Blob(chunks.current, { type: kind });
      chunks.current = [];
      if (keep.current && blob.size && Date.now() - began >= MIN_RECORD_MS) done(new File([blob], shotName("video", kind), { type: kind, lastModified: Date.now() }));
    };
    try { r.start(250); } catch { stopDrawing(); return false; }
    recorder.current = r;
    setElapsed(0);
    setSince(began);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filmed reads refs only
  }, [canRecord, done]);

  const stopRecording = useCallback((save: boolean) => {
    const r = recorder.current;
    recorder.current = null;
    setSince(null);
    if (!r || r.state === "inactive") { stopDrawing(); return; }
    keep.current = save;
    try { r.stop(); } catch { stopDrawing(); }
  }, []);

  // The shutter: a tap a photo, a hold a video (Photo side); on the Video side a tap starts and a tap stops. Held — or,
  // on the Video side, pressed while recording — and slid up, it zooms in; down, back out.
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (status !== "live") return;
    hold(e);
    const p: Press = { timer: null, holding: false, y: e.clientY, z: zoomNow.current, video: mode === "video", moved: false };
    if (!p.video) p.timer = setTimeout(() => { p.timer = null; if (press.current === p) p.holding = startRecording(); }, HOLD_MS);
    press.current = p;
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p) return;
    const risen = p.y - e.clientY;
    if (Math.abs(risen) > 12) p.moved = true;
    if (p.holding || (p.video && recorder.current)) setZoom(slideZoom(p.z, risen, window.innerHeight, range.current));
  };
  const up = () => {
    if (status !== "live") return;
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.video) {
      // A slide to zoom is not a tap.
      if (p.moved && recorder.current) return;
      if (recorder.current) stopRecording(true); else startRecording();
      return;
    }
    if (p.timer) { clearTimeout(p.timer); takePhoto(); return; }
    if (p.holding) stopRecording(true);
  };
  const cancel = () => {
    const p = press.current;
    press.current = null;
    if (p?.timer) clearTimeout(p.timer);
    if (p?.holding) stopRecording(true);
  };

  // Two fingers on the picture pinch the zoom.
  const spread = () => {
    const [a, b] = [...fingers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const fingerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    hold(e);
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size === 2) pinch.current = { spread: spread(), z: zoomNow.current };
  };
  const fingerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && fingers.current.size >= 2) setZoom(pinchZoom(p.z, p.spread, spread(), range.current));
  };
  const fingerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId);
    if (fingers.current.size < 2) pinch.current = null;
  };

  const flipCamera = () => { if (!recorder.current) setFacing(f => (f === "environment" ? "user" : "environment")); };
  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(null); }
  };
  // Photos opens the phone's picker for the chat (a user's tap — the picker opens only from one), then the camera goes.
  const gallery = () => { document.getElementById(galleryId)?.click(); close(); };
  const phoneCamera = () => { openSystemCamera(inputId, warn); close(); };

  const recording = since !== null;
  const shownScale = nativeZoom ? 1 : zoom;
  const zoomed = zoom > range.current.min + 0.04;
  return (
    <div role="dialog" aria-modal="true" aria-label="Camera" data-in-app-camera=""
      style={{ position: "fixed", inset: 0, zIndex: 2147482100, background: "rgb(0 0 0)", color: WHITE, fontFamily: FONT, overflow: "hidden", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <video ref={video} autoPlay playsInline muted aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `${facing === "user" ? "scaleX(-1) " : ""}scale(${shownScale})`, opacity: status === "live" ? 1 : 0, transition: "opacity 120ms" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: WHITE, opacity: flash ? 0.85 : 0, transition: flash ? "none" : "opacity 160ms ease-out", pointerEvents: "none" }} />
      {/* The picture's own surface: two fingers here pinch the zoom. */}
      <div data-camera-surface="" aria-hidden="true" onPointerDown={fingerDown} onPointerMove={fingerMove} onPointerUp={fingerUp} onPointerCancel={fingerUp}
        style={{ position: "absolute", inset: 0 }} />

      {/* Top: close, the recording's clock, the flash. */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 12px)", left: "16px", right: "16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button type="button" aria-label="Close camera" onClick={close} style={ROUND}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {recording ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderRadius: "16px", background: "rgba(0,0,0,.45)", fontSize: typePx(15), fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "5px", background: RED }} />{recClock(elapsed)}
          </span>
        ) : <span />}
        {torch !== null ? (
          <button type="button" aria-label={torch ? "Flash on" : "Flash off"} aria-pressed={torch} onClick={() => void toggleTorch()} style={{ ...ROUND, color: torch ? "rgb(255 214 10)" : WHITE }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill={torch ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
          </button>
        ) : <span style={{ width: "44px" }} />}
      </div>

      {(status === "denied" || status === "failed") && (
        <div style={{ position: "absolute", left: "24px", right: "24px", top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: typePx(16), lineHeight: 1.45 }}>
            {status === "denied" ? "This app may not use the camera. Allow Camera for this app in the phone's settings, or use the phone's camera." : "The camera could not start."}
          </p>
          <button type="button" onClick={phoneCamera} style={{ height: "44px", padding: "0 20px", borderRadius: "22px", border: 0, background: WHITE, color: "rgb(0 0 0)", fontSize: typePx(15), fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>Use the phone&apos;s camera</button>
        </div>
      )}

      {/* Bottom: Photos, the shutter, the other camera — and Video | Photo under them. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(var(--safe-bottom, 0px) + 18px)", display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" }}>
        <div style={{ position: "relative", width: "100%", padding: "0 28px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* The zoom, above the shutter while it is past 1×; a tap takes it back. */}
          {zoomed && (
            <button type="button" aria-label={`Zoom ${zoomLabel(zoom)} — back to 1×`} onClick={() => setZoom(range.current.min)}
              style={{ position: "absolute", left: "50%", bottom: "calc(100% + 14px)", transform: "translateX(-50%)", height: "30px", minWidth: "52px", padding: "0 10px", borderRadius: "15px", border: 0, background: "rgba(0,0,0,.5)", color: "rgb(255 214 10)", fontSize: typePx(14), fontWeight: 600, fontFamily: FONT, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>
              {zoomLabel(zoom)}
            </button>
          )}
          <button type="button" aria-label="Photos" onClick={gallery} disabled={recording} style={{ ...ROUND, borderRadius: "12px", opacity: recording ? 0 : 1 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-9 9" /></svg>
          </button>
          <button type="button" aria-label={recording ? "Stop recording" : mode === "video" ? "Record video" : "Take photo"}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={e => e.preventDefault()} disabled={status !== "live"}
            style={{ width: "78px", height: "78px", borderRadius: "39px", border: `4px solid ${recording ? RED : WHITE}`, background: "transparent", padding: 0, display: "grid", placeItems: "center", cursor: "pointer", transform: recording && mode === "photo" ? "scale(1.15)" : "none", transition: "transform 160ms ease-out, border-color 160ms" }}>
            <span style={{ display: "block", width: recording ? "28px" : "62px", height: recording ? "28px" : "62px", borderRadius: recording ? "7px" : "31px", background: mode === "video" || recording ? RED : WHITE, transition: "all 160ms ease-out" }} />
          </button>
          <button type="button" aria-label="Switch camera" onClick={flipCamera} disabled={recording} style={{ ...ROUND, opacity: recording ? 0 : 1 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2" /><path d="M20 4v4h-4M4 20v-4h4" /></svg>
          </button>
        </div>
        {/* Hidden, not taken away, while recording: the shutter stays under the finger that holds it. */}
        {canRecord && (
          <div role="radiogroup" aria-label="Camera mode" aria-hidden={recording} style={{ display: "flex", gap: "6px", padding: "4px", borderRadius: "18px", background: "rgba(0,0,0,.38)", visibility: recording ? "hidden" : "visible" }}>
            {(["video", "photo"] as const).map(m => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                style={{ height: "28px", padding: "0 14px", borderRadius: "14px", border: 0, background: mode === m ? "rgba(255,255,255,.24)" : "transparent", color: WHITE, opacity: mode === m ? 1 : 0.75, fontSize: typePx(14), fontWeight: mode === m ? 600 : 500, fontFamily: FONT, cursor: "pointer" }}>
                {m === "video" ? "Video" : "Photo"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
