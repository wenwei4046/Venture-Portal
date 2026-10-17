"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useBackCloses } from "./back";
import { typePx } from "./type";
import {
  HOLD_MS, MAX_RECORD_S, MIN_RECORD_MS, cameraOpenFor, closeInAppCamera, handToChat, openSystemCamera, recClock, recordType,
  shotName, subscribeCamera,
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
const ask = (face: Facing, audio: boolean): MediaStreamConstraints => ({
  video: { facingMode: { ideal: face }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
});
const errName = (e: unknown) => (e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "");

const WHITE = "rgb(255 255 255)", RED = "rgb(234 67 53)", FONT = "Inter, -apple-system, 'Segoe UI', sans-serif";
const ROUND = { width: "44px", height: "44px", borderRadius: "22px", border: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.38)", color: WHITE, cursor: "pointer", padding: 0 } as const;

function CameraScreen({ inputId, galleryId, warn }: { inputId: string; galleryId: string; warn: (text: string) => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const keep = useRef(false);
  const gen = useRef(0);
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; holding: boolean } | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [facing, setFacing] = useState<Facing>("environment");
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [since, setSince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [flash, setFlash] = useState(false);
  const canRecord = typeof MediaRecorder !== "undefined";

  const close = useCallback(() => closeInAppCamera(), []);

  const release = useCallback(() => {
    gen.current++;
    const r = recorder.current;
    recorder.current = null;
    if (r && r.state !== "inactive") { keep.current = false; try { r.stop(); } catch { /* stopped */ } }
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    setSince(null);
    setTorch(null);
  }, []);

  const start = useCallback(async (face: Facing) => {
    release();
    const mine = gen.current;
    setStatus("starting");
    let s: MediaStream;
    try {
      try { s = await navigator.mediaDevices.getUserMedia(ask(face, true)); }
      // The microphone refused or missing: photos, and videos without sound.
      catch { s = await navigator.mediaDevices.getUserMedia(ask(face, false)); }
    } catch (e) {
      if (mine === gen.current) setStatus(errName(e) === "NotAllowedError" || errName(e) === "SecurityError" ? "denied" : "failed");
      return;
    }
    if (mine !== gen.current) { s.getTracks().forEach(t => t.stop()); return; }
    stream.current = s;
    const v = video.current;
    if (v) { v.srcObject = s; void v.play().catch(() => undefined); }
    const track = s.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
    setTorch(caps.torch ? false : null);
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
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    c.toBlob(b => { if (b) done(new File([b], shotName("photo", "image/jpeg"), { type: "image/jpeg", lastModified: Date.now() })); }, "image/jpeg", 0.92);
  }, [done, status]);

  const startRecording = useCallback((): boolean => {
    const s = stream.current;
    if (!s || !canRecord || recorder.current) return false;
    const type = recordType(t => MediaRecorder.isTypeSupported(t));
    let r: MediaRecorder;
    try { r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 }); }
    catch { return false; }
    const began = Date.now();
    chunks.current = [];
    keep.current = true;
    r.ondataavailable = e => { if (e.data && e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const kind = (r.mimeType || type || "video/webm").split(";")[0];
      const blob = new Blob(chunks.current, { type: kind });
      chunks.current = [];
      if (keep.current && blob.size && Date.now() - began >= MIN_RECORD_MS) done(new File([blob], shotName("video", kind), { type: kind, lastModified: Date.now() }));
    };
    try { r.start(250); } catch { return false; }
    recorder.current = r;
    setElapsed(0);
    setSince(began);
    return true;
  }, [canRecord, done]);

  const stopRecording = useCallback((save: boolean) => {
    const r = recorder.current;
    recorder.current = null;
    setSince(null);
    if (!r || r.state === "inactive") return;
    keep.current = save;
    try { r.stop(); } catch { /* stopped */ }
  }, []);

  // The shutter: a tap a photo, a hold a video (Photo side); on the Video side a tap starts and a tap stops.
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (status !== "live") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (mode === "video") return;
    const p = { timer: null as ReturnType<typeof setTimeout> | null, holding: false };
    p.timer = setTimeout(() => { p.timer = null; if (press.current === p) p.holding = startRecording(); }, HOLD_MS);
    press.current = p;
  };
  const up = () => {
    if (status !== "live") return;
    if (mode === "video") { if (recorder.current) stopRecording(true); else startRecording(); return; }
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.timer) { clearTimeout(p.timer); takePhoto(); return; }
    if (p.holding) stopRecording(true);
  };
  const cancel = () => {
    const p = press.current;
    press.current = null;
    if (p?.timer) clearTimeout(p.timer);
    if (p?.holding) stopRecording(true);
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
  return (
    <div role="dialog" aria-modal="true" aria-label="Camera" data-in-app-camera=""
      style={{ position: "fixed", inset: 0, zIndex: 2147482100, background: "rgb(0 0 0)", color: WHITE, fontFamily: FONT, overflow: "hidden", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
      <video ref={video} autoPlay playsInline muted aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: facing === "user" ? "scaleX(-1)" : "none", opacity: status === "live" ? 1 : 0, transition: "opacity 120ms" }} />
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: WHITE, opacity: flash ? 0.85 : 0, transition: flash ? "none" : "opacity 160ms ease-out", pointerEvents: "none" }} />

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
        <div style={{ width: "100%", padding: "0 28px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button type="button" aria-label="Photos" onClick={gallery} disabled={recording} style={{ ...ROUND, borderRadius: "12px", opacity: recording ? 0 : 1 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-9 9" /></svg>
          </button>
          <button type="button" aria-label={recording ? "Stop recording" : mode === "video" ? "Record video" : "Take photo"}
            onPointerDown={down} onPointerUp={up} onPointerCancel={cancel} onContextMenu={e => e.preventDefault()} disabled={status !== "live"}
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
