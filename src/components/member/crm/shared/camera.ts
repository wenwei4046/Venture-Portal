/**
 * The chat's camera button.
 *
 * In the app, as WhatsApp's (2026-10-17 — the owner, the phone's own camera opening from the button: "我觉得在开 camera
 * 相机的时候，它其实有点 lag。我要它像 WhatsApp 那样：一按相机就直接打开，拍照直接 capture。而不是先跳去系统的 camera，按
 * save、use 之后再跳回去 … include with video as well"): the button opens the app's own camera screen (`InAppCamera`,
 * shared/in-app-camera.tsx) — the camera's picture at once, a tap of the shutter a photo, holding it a video — and what
 * it takes goes straight to the chat's preview through the same hidden input the phone's camera fed.
 *
 * The phone's own camera, through the hidden file input (`capture`), stays the way in where the browser lends no camera
 * (no getUserMedia), and behind the camera screen's *Use the phone's camera* when the camera was refused there. On
 * Android, when that opens nothing — no camera, no chooser, no permission question (the owner, 2026-10-16: "android 沒有
 * 跳出授權相機的選項") — the page stays on screen, so after a moment the chat says why and what to change: the browser
 * itself (Chrome, or Samsung Internet) has no camera permission in Android's settings. An iPhone shows its own menu over
 * the page, so it is not watched there. On Android that input asks for a photo only (2026-10-17 — "我按 camera 的时候，它
 * 其实并没有帮我开 camera，它跳出来反而是 select photo"): Chrome opens the camera straight away only when every accepted
 * type is one kind (Chromium's SelectFileDialog: captureImage() is `capture` and image types only).
 */
export const CAMERA_HELP = "The camera didn't open. In Android Settings › Apps › Chrome (or Samsung Internet) › Permissions, allow Camera, then try again.";
export const CAMERA_WAIT_MS = 1500;
export const ANDROID_CAMERA_ACCEPT = "image/*";

/** Press the shutter longer than this and it records (WhatsApp's: tap for a photo, hold for a video). */
export const HOLD_MS = 300;
/** The longest video the camera records: three minutes, which the preview then fits to the channel (video-fit.ts). */
export const MAX_RECORD_S = 180;
/** A hold let go sooner than this is no video (a slip of the finger). */
export const MIN_RECORD_MS = 600;

/**
 * The recorder's format: an MP4 of H.264 and AAC where the phone records one (an iPhone; Chrome lately) — what WhatsApp
 * plays as it is — else WebM, made an H.264 MP4 with AAC sound before it is sent (video-fit.ts).
 */
export const RECORD_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=h264,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;
export function recordType(supported: (type: string) => boolean): string | null {
  return RECORD_TYPES.find(t => { try { return supported(t); } catch { return false; } }) ?? null;
}

const two = (n: number) => String(n).padStart(2, "0");
/** A taken photo's or video's name, as a phone's camera names its own: IMG_20261017_182806.jpg, VID_….mp4. */
export function shotName(kind: "photo" | "video", type: string, at = new Date()): string {
  const stamp = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}_${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  const ext = kind === "photo" ? "jpg" : /mp4/i.test(type) ? "mp4" : "webm";
  return `${kind === "photo" ? "IMG" : "VID"}_${stamp}.${ext}`;
}
/** A recording's clock: 0:07, 1:42. */
export const recClock = (seconds: number) => `${Math.floor(seconds / 60)}:${two(Math.floor(seconds % 60))}`;

/** The browser lends its camera to the page (a secure page, getUserMedia) — the app's own camera screen can open. */
export function inAppCameraWorks(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return window.isSecureContext !== false && typeof navigator.mediaDevices?.getUserMedia === "function";
}

// Which chat's camera is open: the id of the hidden input its photo or video goes into (one camera at a time).
let openFor: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
export const cameraOpenFor = () => openFor;
export const subscribeCamera = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function openInAppCamera(inputId: string) { openFor = inputId; emit(); }
export function closeInAppCamera() { if (openFor !== null) { openFor = null; emit(); } }

/** The button: the app's own camera where the browser lends one, else the phone's. */
export function openCamera(inputId: string, warn: (text: string) => void): void {
  if (inAppCameraWorks()) { openInAppCamera(inputId); return; }
  openSystemCamera(inputId, warn);
}

/** The phone's own camera, through the hidden input. */
export function openSystemCamera(inputId: string, warn: (text: string) => void): void {
  const input = typeof document !== "undefined" ? document.getElementById(inputId) as HTMLInputElement | null : null;
  if (!input) return;
  const android = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  if (android) {
    input.accept = ANDROID_CAMERA_ACCEPT;
    let left = false;
    const away = () => { left = true; };
    document.addEventListener("visibilitychange", away, { once: true });
    window.addEventListener("blur", away, { once: true });
    input.addEventListener("change", away, { once: true });
    setTimeout(() => {
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("blur", away);
      input.removeEventListener("change", away);
      if (!left && document.visibilityState === "visible") warn(CAMERA_HELP);
    }, CAMERA_WAIT_MS);
  }
  input.click();
}

/**
 * What the camera took, into the chat: put in the hidden camera input and announced as the phone's camera would — the
 * input's own handler (pickVisual) opens the preview, the photo filling the 9:16 screen as a camera photo does.
 */
export function handToChat(inputId: string, file: File): boolean {
  const input = typeof document !== "undefined" ? document.getElementById(inputId) as HTMLInputElement | null : null;
  if (!input || typeof DataTransfer === "undefined") return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch { return false; }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

// ── Zoom (2026-10-17 — the owner: "the camera and video cannot zoom in, suppose for video when long press then move
// upwards it will zoom in") ─────────────────────────────────────────────────────────────────────────────────────────

/** The camera's own zoom where the phone lends it (the track's `zoom`, Android), up to 10×; else the app's — the
 * picture's middle, cropped — up to 4×, beyond which there is nothing left to see. */
export const NATIVE_MAX_ZOOM = 10;
export const DIGITAL_MAX_ZOOM = 4;
export type ZoomRange = { min: number; max: number; step: number; native: boolean };
type ZoomCaps = { zoom?: { min?: number; max?: number; step?: number } } | null | undefined;
export function zoomRangeOf(caps: ZoomCaps): ZoomRange {
  const z = caps?.zoom;
  if (z && typeof z.min === "number" && typeof z.max === "number" && z.max > z.min) {
    return { min: z.min, max: Math.min(z.max, Math.max(z.min, NATIVE_MAX_ZOOM)), step: z.step && z.step > 0 ? z.step : 0.1, native: true };
  }
  return { min: 1, max: DIGITAL_MAX_ZOOM, step: 0.1, native: false };
}
export function clampZoom(z: number, r: ZoomRange): number {
  const kept = Math.min(r.max, Math.max(r.min, Number.isFinite(z) ? z : r.min));
  const stepped = Number((Math.round(kept / r.step) * r.step).toFixed(3));
  return Math.min(r.max, Math.max(r.min, stepped));
}
/** The held shutter slid up zooms in — 45% of the screen's height runs the whole range — and slid down zooms back out. */
export function slideZoom(startZoom: number, risenPx: number, screenPx: number, r: ZoomRange): number {
  return clampZoom(startZoom + (risenPx / Math.max(1, screenPx * 0.45)) * (r.max - r.min), r);
}
/** Two fingers on the picture: the zoom grows with their spread. */
export function pinchZoom(startZoom: number, startSpread: number, spread: number, r: ZoomRange): number {
  return clampZoom(startZoom * (spread / Math.max(1, startSpread)), r);
}
/** The middle of a frame a digital zoom keeps. */
export function cropOf(w: number, h: number, zoom: number): { sx: number; sy: number; sw: number; sh: number } {
  const z = Math.max(1, zoom), sw = w / z, sh = h / z;
  return { sx: (w - sw) / 2, sy: (h - sh) / 2, sw, sh };
}
export const zoomLabel = (z: number) => `${(Math.round(z * 10) / 10).toFixed(1)}×`;
