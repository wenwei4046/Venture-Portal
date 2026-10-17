/**
 * A video is made to fit its channel on the phone before it is sent (the owner, 2026-10-14: "video 限制 16MB，太小了").
 * WhatsApp takes a video of at most 16 MB, and only H.264: an iPhone's High Efficiency (HEVC) video comes back as 131053.
 * That limit is Meta's, not ours — WhatsApp's own app gets past it the same way, by shrinking the video before it sends.
 * So a video that is too big, or not H.264, is encoded again here as an H.264 MP4 at the bitrate that fits (WebCodecs,
 * through mediabunny — loaded only when a video needs it): the longer the video, the smaller its picture. One too long to
 * fit at a watchable quality is refused with the reason, never sent broken.
 */

import { drawOver, isEdited, turnedSize, type PhotoEdits } from "./edit-render";

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
/** A video turned, cropped, drawn on, with text or stickers on the editor (the owner: "選好的影片也有能編輯"): drawn into
 * every frame as it is encoded (shared/edit-render.ts, the photo's own drawing). */
const looks = new WeakMap<File, PhotoEdits>();
export const markVideoEdits = (f: File, e: PhotoEdits) => { looks.set(f, e); return f; };

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
 * The video as the channel takes it (2026-10-14, second look at 131053 — the files Meta refused, opened):
 * - always an MP4: an iPhone .mov holds H.264 the channel can play, but WhatsApp refuses the QuickTime box around it — it
 *   is put into an MP4 box as it is (no quality lost, quick);
 * - encoded again only when it is too big, not H.264 (an iPhone "High Efficiency" video), trimmed past what a copy can
 *   do, or sent standard; and never sent without its picture — this phone once dropped the picture track and sent the
 *   sound alone, which Meta refused.
 * `onProgress` gets 0–1 while it works.
 */
export async function fitVideo(file: File, channelMax: number, channelName: string, onProgress?: (p: number) => void): Promise<VideoFit> {
  // Standard: at most 8 MB and 960 px — the channel's own limit stays the limit for HD.
  const hd = !standard.has(file), maxBytes = hd ? channelMax : Math.min(channelMax, STANDARD_VIDEO_MAX);
  const tooBig = `A video can be up to ${Math.round(channelMax / MB)} MB on ${channelName}`;
  let mb: Mb;
  try { mb = await import("mediabunny"); } catch { return file.size <= channelMax ? { ok: true, file } : { ok: false, error: `${tooBig}, and the video tool did not load — check the connection and try again.` }; }
  try {
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return { ok: false, error: "This video has no picture to send." };
    const isMp4 = (await input.getFormat()).name === "MP4";
    const cut = cuts.get(file), look = isEdited(looks.get(file)) ? looks.get(file)! : null;
    const full = await input.computeDuration();
    const start = cut ? Math.max(0, Math.min(cut.start, full)) : 0, end = cut ? Math.max(start + 0.2, Math.min(cut.end, full)) : full;
    const seconds = end - start;
    const trim = cut ? { trim: { start, end } } : {}, audio = cut?.mute ? { audio: { discard: true as const } } : {};
    // The sound as every MP4 player takes it — AAC: the app's own camera records Opus where the phone makes WebM
    // (2026-10-17, shared/in-app-camera.tsx), and WhatsApp plays AAC alone. Made AAC on the way where this phone can.
    const sound = cut?.mute ? null : await input.getPrimaryAudioTrack();
    const aac = sound && sound.codec !== "aac" && (await mb.canEncodeAudio("aac")) ? { audio: { codec: "aac" as const, bitrate: AUDIO_BPS } } : {};
    const estimate = full > 0 ? (file.size * seconds) / full : file.size;
    // H.264 that fits: as it is when it is already a plain MP4, else copied into one (trimmed / muted on the way).
    // An iPhone video keeps its picture sideways and a "turn 90°" flag; WhatsApp on a computer ignores the flag and
    // showed the customer the video sideways (the owner, 2026-10-14). So a turned video is encoded again with the turn
    // drawn into the picture (allowTransformationMetadata: false); only an upright one is copied as it is.
    const turned = (track.rotation ?? 0) !== 0;
    let copyFile: File | null = null;
    if (!look && track.codec === "avc" && estimate <= maxBytes * 0.97) {
      if (!cut && isMp4 && !turned && !("audio" in aac)) return { ok: true, file };
      const copy = await convert(mb, input, file, { ...trim, ...audio, ...aac }, onProgress);
      if (copy.file && copy.file.size <= maxBytes) {
        if (!turned) return { ok: true, file: copy.file };
        copyFile = copy.file;
      }
    }
    if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") {
      if (copyFile) return { ok: true, file: copyFile };
      return { ok: false, error: track.codec === "avc" ? `${tooBig}, and this phone cannot make it smaller. Trim it and send it again.` : HEVC };
    }
    const plan = videoPlan(maxBytes, seconds, hd) ?? (hd ? null : videoPlan(channelMax, seconds, true));
    if (!plan) return copyFile ? { ok: true, file: copyFile } : { ok: false, error: `${tooBig} — this one is too long to fit. Trim it and send it again.` };
    // Turned and cropped first (the editor's order); the size that fits is the cropped picture's.
    const t = turnedSize(track.displayWidth, track.displayHeight, look?.turn ?? 0);
    const ev = (n: number) => Math.max(0, Math.round(n / 2) * 2);
    const crop = look ? { left: ev(look.crop.x * t.w), top: ev(look.crop.y * t.h), width: Math.max(2, ev(look.crop.w * t.w)), height: Math.max(2, ev(look.crop.h * t.h)) } : null;
    const w = crop?.width ?? t.w, h = crop?.height ?? t.h;
    const k = Math.min(1, plan.side / Math.max(w, h, 1));
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    // The phone's encoder may refuse a size: smaller ones are tried before giving up (2026-10-14: "send video 又出現 limit").
    let out: { file: File | null; why?: string } = { file: null };
    for (const side of [plan.side, 960, 640, 480].filter((s, i, a) => s <= plan.side && a.indexOf(s) === i)) {
      const kk = Math.min(1, side / Math.max(w, h, 1)), W = even(w * kk), Hh = even(h * kk);
      out = await convert(mb, input, file, {
        ...trim, ...audio, ...aac,
        video: { width: W, height: Hh, fit: "contain", codec: "avc", quality: new mb.Quality({ bitrate: plan.bps }), forceTranscode: true, allowTransformationMetadata: false, ...(look ? drawn(look, crop!, W, Hh) : {}) },
      }, onProgress);
      if (out.file) break;
    }
    // This phone could not turn it: the copy still plays upright on phones (only a computer's WhatsApp ignores the flag).
    if (!out.file && copyFile) return { ok: true, file: copyFile };
    if (!out.file) {
      return { ok: false, error: track.codec === "avc" ? `${tooBig}, and this phone could not make this one smaller (${out.why ?? "no encoder"}). Trim it and send it again.` : `${HEVC} (${out.why ?? "no encoder"})` };
    }
    return out.file.size <= channelMax ? { ok: true, file: out.file } : { ok: false, error: `${tooBig} — this one is too long to fit. Trim it and send it again.` };
  } catch (e) {
    const why = e instanceof Error ? e.message.slice(0, 80) : "";
    return { ok: false, error: `The video could not be prepared${why ? ` (${why})` : ""}. Try again, or trim it first.` };
  }
}

const HEVC = "This is an iPhone High Efficiency video, which this phone cannot convert for WhatsApp. On the iPhone: Settings › Camera › Formats › Most Compatible, then record it again.";

/**
 * A voice note as WhatsApp plays it as a voice message (2026-10-14: the iPhone's recording — a fragmented MP4 — came
 * back 131053): Ogg Opus when this phone can make it (WhatsApp then shows it as a voice message, with its waveform),
 * else the same sound copied into a plain MP4. Messenger takes the recording as it is.
 */
export async function fitVoice(file: File, channel: "whatsapp" | "messenger"): Promise<File> {
  if (channel !== "whatsapp") return file;
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack();
    if (!track) return file;
    const base = file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "voice";
    if (track.codec === "opus" || (await mb.canEncodeAudio("opus"))) {
      const output = new mb.Output({ format: new mb.OggOutputFormat(), target: new mb.BufferTarget() });
      const conv = await mb.Conversion.init({ input, output, showWarnings: false, video: { discard: true }, audio: { codec: "opus", ...(track.codec === "opus" ? {} : { bitrate: 32_000 }) } });
      if (conv.isValid && conv.utilizedTracks.some(t => t.type === "audio")) {
        await conv.execute();
        if (output.target.buffer) return new File([output.target.buffer], `${base}.ogg`, { type: "audio/ogg" });
      }
    }
    const input2 = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conv = await mb.Conversion.init({ input: input2, output, showWarnings: false, video: { discard: true } });
    if (conv.isValid && conv.utilizedTracks.some(t => t.type === "audio")) {
      await conv.execute();
      if (output.target.buffer) return new File([output.target.buffer], `${base}.m4a`, { type: "audio/mp4" });
    }
  } catch { /* sent as recorded */ }
  return file;
}

/** The editor's turn and crop for mediabunny, and each frame drawn with the drawing, text and stickers on top. */
function drawn(look: PhotoEdits, crop: { left: number; top: number; width: number; height: number }, W: number, H: number) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d")!;
  return {
    rotate: (look.turn * 90) as 0 | 90 | 180 | 270, crop,
    processedWidth: W, processedHeight: H,
    process: (sample: { draw: (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void }) => {
      g.clearRect(0, 0, W, H);
      sample.draw(g, 0, 0, W, H);
      drawOver(g, look, W, H);
      return canvas;
    },
  };
}

type Mb = typeof import("mediabunny");
type ConvOpts = Omit<Parameters<Mb["Conversion"]["init"]>[0], "input" | "output">;
/** One run of mediabunny into an MP4 in memory. No file when this phone cannot make it, or would drop the picture. */
async function convert(mb: Mb, input: InstanceType<Mb["Input"]>, file: File, opts: ConvOpts, onProgress?: (p: number) => void): Promise<{ file: File | null; why?: string }> {
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({ input, output, showWarnings: false, ...opts });
  if (!conversion.isValid || !conversion.utilizedTracks.some(t => t.type === "video")) {
    return { file: null, why: conversion.discardedTracks.find(d => d.track.type === "video")?.reason ?? "not valid" };
  }
  if (onProgress) conversion.onProgress = p => onProgress(p);
  await conversion.execute();
  const buf = output.target.buffer;
  return { file: buf ? new File([buf], (file.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "video") + ".mp4", { type: "video/mp4" }) : null };
}
