/**
 * The video editor's trim bar as WhatsApp's: a film strip of frames across the whole video (the owner, 2026-10-17, with
 * WhatsApp's editor beside ours: "Why is not full screen? Like this" — ours was a grey bar over a small video). Each tile
 * is a frame from the middle of its share of the video, 96 px on its long side, a small JPEG drawn in the browser.
 */
export const STRIP_TILES = 10;
const TILE_SIDE = 96;
const WAIT_MS = 5000;

/** Waits for a video's event, at most 5 s: true when `ok` says it came, false when it never did or the video failed. */
function waitFor(v: HTMLVideoElement, type: string, ok: () => boolean = () => true): Promise<boolean> {
  return new Promise(resolve => {
    const done = (r: boolean) => { clearTimeout(t); v.removeEventListener(type, on); v.removeEventListener("error", no); resolve(r); };
    const on = () => { if (ok()) done(true); };
    const no = () => done(false);
    const t = setTimeout(no, WAIT_MS);
    v.addEventListener(type, on);
    v.addEventListener("error", no);
  });
}

/** Seeks and waits for the picture there: the seek that lands last (a seek before it still landing is not it). */
function seekTo(v: HTMLVideoElement, at: number): Promise<boolean> {
  const landed = waitFor(v, "seeked", () => !v.seeking);
  v.currentTime = at;
  return landed;
}

/**
 * A video's length. A WebM a phone recorded (Chrome's MediaRecorder — the in-app camera where the phone makes no MP4)
 * says nothing of it until read to its end: asked for a time past its end, the browser reads it through and tells. 0
 * when it never does.
 */
export function lengthOf(v: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(v.duration) && v.duration > 0) return Promise.resolve(v.duration);
  return new Promise(resolve => {
    const done = () => { clearTimeout(t); v.removeEventListener("durationchange", check); resolve(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0); };
    const check = () => { if (Number.isFinite(v.duration)) done(); };
    const t = setTimeout(done, WAIT_MS);
    v.addEventListener("durationchange", check);
    v.currentTime = 1e101;
  });
}

/** The strip's tiles one by one, in order (`tile`); true once all are drawn, false when stopped or the video failed. */
export async function filmStrip(url: string, n: number, tile: (i: number, src: string) => void, stopped: () => boolean): Promise<boolean> {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto";
  const loaded = waitFor(v, "loadeddata");
  v.src = url;
  try {
    if (!(await loaded) || stopped()) return false;
    const d = await lengthOf(v);
    if (!(d > 0) || stopped()) return false;
    const w = v.videoWidth || TILE_SIDE, h = v.videoHeight || TILE_SIDE, k = TILE_SIDE / Math.max(w, h);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext("2d");
    if (!g) return false;
    for (let i = 0; i < n; i++) {
      if (stopped() || !(await seekTo(v, Math.max(0, Math.min(d - 0.05, ((i + 0.5) / n) * d)))) || stopped()) return false;
      g.drawImage(v, 0, 0, c.width, c.height);
      tile(i, c.toDataURL("image/jpeg", 0.7));
    }
    return true;
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}
