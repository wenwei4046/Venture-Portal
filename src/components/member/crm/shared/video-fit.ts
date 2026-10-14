/**
 * A video is made to fit its channel on the phone before it is sent (the owner, 2026-10-14: "video 限制 16MB，太小了").
 * WhatsApp takes a video of at most 16 MB, and only H.264: an iPhone's High Efficiency (HEVC) video comes back as 131053.
 * That limit is Meta's, not ours — WhatsApp's own app gets past it the same way, by shrinking the video before it sends.
 * So a video that is too big, or not H.264, is encoded again here as an H.264 MP4 at the bitrate that fits (WebCodecs,
 * through mediabunny — loaded only when a video needs it): the longer the video, the smaller its picture. One too long to
 * fit at a watchable quality is refused with the reason, never sent broken.
 */

const MB = 1024 * 1024;
/** The most a video may weigh before it is shrunk (what the phone can still read in), and the least bitrate worth sending. */
export const VIDEO_PICK_MAX = 400 * MB;
const MIN_VIDEO_BPS = 250_000, MAX_VIDEO_BPS = 4_000_000, AUDIO_BPS = 160_000;

/** A video the preview sent without HD (2026-10-14, the owner: "拍照和錄像要有 HD"): made smaller to send quickly. */
const standard = new WeakSet<File>();
export const markStandard = (f: File) => { standard.add(f); return f; };
export const STANDARD_VIDEO_MAX = 8 * MB;

/** A video trimmed or muted on the preview's editor (2026-10-14): the part kept, in seconds, and whether its sound goes. */
export type VideoCut = { start: number; end: number; mute: boolean };
const cuts = new WeakMap<File, VideoCut>();
export const markCut = (f: File, c: VideoCut) => { cuts.set(f, c); return f; };

/** The video bitrate and the long side that make `seconds` of video fit in `maxBytes` (a tenth kept for the container). */
export function videoPlan(maxBytes: number, seconds: number, hd = true): { bps: number; side: number } | null {
  if (!(seconds > 0)) return null;
  const bps = Math.floor((maxBytes * 8 * 0.9) / seconds - AUDIO_BPS);
  if (bps < MIN_VIDEO_BPS) return null;
  const v = Math.min(bps, MAX_VIDEO_BPS);
  const side = v >= 2_000_000 ? 1280 : v >= 900_000 ? 960 : 640;
  return { bps: v, side: hd ? side : Math.min(side, 960) };
}

export type VideoFit = { ok: true; file: File } | { ok: false; error: string };

/**
 * The video as the channel takes it: unchanged when it is already H.264 and small enough, else encoded again to fit.
 * `onProgress` gets 0–1 while it encodes.
 */
export async function fitVideo(file: File, channelMax: number, channelName: string, onProgress?: (p: number) => void): Promise<VideoFit> {
  // Standard: at most 8 MB and 960 px — the channel's own limit stays the limit for HD.
  const hd = !standard.has(file), maxBytes = hd ? channelMax : Math.min(channelMax, STANDARD_VIDEO_MAX);
  const tooBig = `A video can be up to ${Math.round(channelMax / MB)} MB on ${channelName}`;
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
    return file.size <= channelMax ? { ok: true, file } : { ok: false, error: `${tooBig}, and this phone cannot make it smaller. Trim it and send it again.` };
  }
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return file.size <= channelMax ? { ok: true, file } : { ok: false, error: `${tooBig}.` };
    const cut = cuts.get(file);
    if (!cut && track.codec === "avc" && file.size <= maxBytes) return { ok: true, file };
    const full = await input.computeDuration();
    const start = cut ? Math.max(0, Math.min(cut.start, full)) : 0, end = cut ? Math.max(start + 0.2, Math.min(cut.end, full)) : full;
    const seconds = end - start;
    const trim = cut ? { trim: { start, end } } : {}, audio = cut?.mute ? { audio: { discard: true } } : {};
    // Trimmed or muted, an H.264 video that then fits is cut without being encoded again (quick, no loss).
    if (cut && track.codec === "avc" && full > 0 && (file.size * seconds) / full <= maxBytes * 0.95) {
      const out = await convert(mb, input, file, { ...trim, ...audio }, onProgress);
      if (out && out.size <= maxBytes) return { ok: true, file: out };
    }
    const plan = videoPlan(maxBytes, seconds, hd) ?? (hd ? null : videoPlan(channelMax, seconds, true));
    if (!plan) return { ok: false, error: `${tooBig} — this one is too long to fit. Trim it and send it again.` };
    const w = track.displayWidth, h = track.displayHeight;
    const k = Math.min(1, plan.side / Math.max(w, h, 1));
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const out = await convert(mb, input, file, {
      ...trim, ...audio,
      video: { ...(w >= h ? { width: even(w * k) } : { height: even(h * k) }), codec: "avc", quality: new mb.Quality(plan.bps), forceTranscode: true },
    }, onProgress);
    if (!out) return { ok: false, error: `${tooBig}, and this phone cannot make this one smaller. Trim it and send it again.` };
    return out.size <= channelMax ? { ok: true, file: out } : { ok: false, error: `${tooBig} — this one is too long to fit. Trim it and send it again.` };
  } catch {
    return file.size <= channelMax ? { ok: true, file } : { ok: false, error: "The video could not be prepared. Try again, or trim it first." };
  }
}

type Mb = typeof import("mediabunny");
type ConvOpts = Omit<Parameters<Mb["Conversion"]["init"]>[0], "input" | "output">;
/** One run of mediabunny into an MP4 in memory; null when this phone cannot make it. */
async function convert(mb: Mb, input: InstanceType<Mb["Input"]>, file: File, opts: ConvOpts, onProgress?: (p: number) => void): Promise<File | null> {
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({ input, output, showWarnings: false, ...opts });
  if (!conversion.isValid) return null;
  if (onProgress) conversion.onProgress = p => onProgress(p);
  await conversion.execute();
  const buf = output.target.buffer;
  return buf ? new File([buf], (file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "video") + ".mp4", { type: "video/mp4" }) : null;
}
