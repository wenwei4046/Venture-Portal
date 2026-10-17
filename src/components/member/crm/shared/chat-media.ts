import type { SyntheticEvent } from "react";
import type { CrmChatMessage } from "@/lib/member/crm-data";
import type { AlbumTile } from "./chat-media-parts";
import { docLabel, mediaHeight, openViewer, rememberShape, type ViewerItem } from "./viewer";

/**
 * A message's photo, video, voice note or document as both chats draw it (the salesperson's and the panel's; markup
 * `tools/crm-design/chat-media.cjs`). The owner, 2026-10-14:
 * - "點入聊天室時，它還是會有載入的痕跡（畫面一直跳動）": a photo's box is drawn at its final size before it loads — its own
 *   shape once seen (`mediaHeight`), else a portrait box — so nothing below it moves while the chat opens;
 * - "聊天室的邊框不要那麼大": a photo, video or document sits 3 px inside its bubble, as WhatsApp's (`pad`);
 * - a tap opens the in-app viewer (shared/viewer.tsx) on the chat's photos and videos, a document on its own;
 * - "發送 pdf, 可以直接顯示 pdf 的名": a document is a tile with its name and type, not "Open file";
 * - later the same day: a PDF shows its first page (`isPdf` → PdfCard), a voice note is WhatsApp's voice bubble
 *   (VoiceNote), and four or more photos / videos sent together are one album (`albumsOf` → MediaAlbum).
 */
type Msg = Pick<CrmChatMessage, "id" | "media"> & Partial<Pick<CrmChatMessage, "from" | "at" | "text">>;

export const NO_MEDIA = {
  img: "", vid: "", vidSrc: "", aud: "", file: "", mh: "", docName: "", docType: "", isPdf: false, voiceMine: false,
  album: [] as AlbumTile[], albumMore: 0,
  view: undefined as (() => void) | undefined, shape: undefined as ((e: SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => void) | undefined,
  pad: "10px 13px", inPad: "0",
  /** The time row's top margin: a voice note's time sits on its own duration line, as WhatsApp's (the bubble one line shorter). */
  timeTop: "4px",
  /** The time row's layout: its own line (block) by default; beside the words for a text message (INLINE_TIME). */
  tDisp: "flex", tFloat: "none" as "none" | "right", tML: "0", tMB: "0", pShow: "block",
};

/** A message with no words, named in a chat list as the chat names it (it read "Attachment", or nothing). */
export function mediaWord(m: Pick<CrmChatMessage, "media">): string {
  const k = m.media?.kind;
  return k === "image" ? "📷 Photo" : k === "video" ? "🎥 Video" : k === "audio" ? "🎤 Voice message" : k === "file" ? `📄 ${m.media?.name ?? "Document"}` : "Attachment";
}

/**
 * A text message as WhatsApp lays it out (the owner, 2026-10-14: "時間放在訊息的右邊，就不會顯得大"): the words run inline
 * and the time floats right — at the end of the last line when it fits there, on a line of its own at the right only
 * when it does not — and the bubble's padding is WhatsApp's.
 */
export const INLINE_TIME = { tDisp: "inline-flex", tFloat: "right", tML: "12px", tMB: "-5px", timeTop: "8px", pShow: "inline", pad: "6px 9px 7px 11px" } as const;

const visual = (m: Msg) => m.media?.kind === "image" || m.media?.kind === "video";

/**
 * A video's address that shows its first picture before it plays: an iPhone draws a paused video black until asked for a
 * moment into it (`#t=0.1`). The phone's own copy too (2026-10-17 — the owner, a video just sent black in the chat on an
 * iPhone: "all video after send, before press in the video play, is show black view"): a `blob:` address takes the same
 * moment — it was left out, and what this phone sends shows from its own copy.
 */
export const firstFrameSrc = (url: string) => (!url || url.includes("#") ? url : `${url}#t=0.1`);

/** The chat's photos and videos, oldest first: what left / right steps through in the viewer. */
export function galleryOf(messages: Msg[]): ViewerItem[] {
  return messages.flatMap(m => (m.media && visual(m) ? [{ kind: m.media.kind as "image" | "video", url: m.media.url }] : []));
}

/**
 * Albums (WhatsApp's): photos / videos in a row from the same side (2026-10-14: four or more, the first may carry the
 * caption, each within 60 s of the one before — two minutes had swallowed a video sent after an album).
 * The first message carries the album; the others are not drawn (`hidden`).
 */
export function albumsOf(messages: Msg[]): { lead: Map<string, Msg[]>; hidden: Set<string> } {
  const lead = new Map<string, Msg[]>(), hidden = new Set<string>();
  let run: Msg[] = [];
  // Four or more make an album (the owner, 2026-10-14: briefly two or more, then "超過 4 張以上才合併吧" — two or three
  // stay one by one); the FIRST may carry words (its caption, shown under the album, as a send gives it the reply box's
  // words), the others none; each within 60 s of the one before (a batch of HD photos goes one after another).
  const close = () => { if (run.length >= 4) { lead.set(run[0].id, run); run.slice(1).forEach(m => hidden.add(m.id)); } run = []; };
  for (const m of messages) {
    const prev = run[run.length - 1];
    const joins = !!prev && visual(m) && !m.text && prev.from === m.from && Math.abs(new Date(m.at ?? 0).getTime() - new Date(prev.at ?? 0).getTime()) <= 60_000;
    if (!joins) { close(); if (visual(m)) run = [m]; continue; }
    run.push(m);
  }
  close();
  return { lead, hidden };
}

export function mediaOf(m: Msg, gallery: ViewerItem[], album?: Msg[]): typeof NO_MEDIA {
  const voiceMine = m.from === "me";
  const open = (url: string) => () => openViewer(gallery, Math.max(0, gallery.findIndex(g => g.url === url)));
  if (album && album.length >= 4) {
    return {
      ...NO_MEDIA, voiceMine, pad: "3px 3px 5px", inPad: "0 7px",
      album: album.slice(0, 4).map(a => ({ src: a.media!.url, video: a.media!.kind === "video", view: open(a.media!.url) })),
      albumMore: album.length - 4,
    };
  }
  const md = m.media;
  if (!md) return { ...NO_MEDIA, voiceMine };
  const k = md.kind, url = md.url, framed = k === "image" || k === "video" || k === "file";
  return {
    ...NO_MEDIA, voiceMine,
    img: k === "image" ? url : "",
    vid: k === "video" ? url : "",
    // iPhone draws a video's first frame only when asked for a moment into it.
    vidSrc: k === "video" ? firstFrameSrc(url) : "",
    aud: k === "audio" ? url : "",
    file: k === "file" ? url : "",
    mh: k === "image" || k === "video" ? mediaHeight(url) : "",
    docName: k === "file" ? md.name || "Document" : "",
    docType: k === "file" ? docLabel(md.name, md.mime) : "",
    isPdf: k === "file" && docLabel(md.name, md.mime) === "PDF",
    view: k === "audio" ? undefined
      : k === "file" ? () => openViewer([{ kind: "file", url, name: md.name, mime: md.mime }], 0)
      : open(url),
    shape: k === "image" || k === "video" ? e => {
      const t = e.currentTarget as HTMLImageElement & HTMLVideoElement;
      rememberShape(url, t.naturalWidth || t.videoWidth, t.naturalHeight || t.videoHeight);
    } : undefined,
    // A voice note sits closer to its bubble too ("語音聊天的畫面改小一點").
    pad: framed ? "3px 3px 5px" : k === "audio" ? "6px 9px 5px" : "10px 13px",
    // A voice note's time sits left of its 52px picture (2026-10-15, WhatsApp's layout — shared/voice-note.tsx).
    inPad: framed ? "0 7px" : k === "audio" ? "0 62px 0 2px" : "0",
    // 2026-10-14 ("語音氣泡還是一樣"): the time moves up beside the voice note's duration instead of a line of its own.
    // 2026-10-15: the duration moved onto the waveform's row, so the time is its own row again, close under it.
    timeTop: k === "audio" ? "-18px" : "4px",
  };
}

/**
 * Your own bubble (the owner, 2026-10-15: "聊天室的 bubble 可以換成橙色嗎？" — picked the brand's orange with white words,
 * as iMessage's blue): both chats, the salesperson's and the Control panel's. Its time is white, and its ticks are white
 * (delivered), light blue (read) or a pale red (not delivered) — the old blue and grey were lost on the orange.
 */
export const MINE_BG = "#BD4A19";
export const MINE_TIME = "rgba(255,255,255,.82)";
export function tickColor(status: string | undefined): string {
  return status === "read" ? "#A6DBFF" : status === "failed" ? "#FFD3C7" : "rgba(255,255,255,.82)";
}

/**
 * The mark after your own message's time, in its 16 × 11 box: a small clock while it is sent, a "!" in a circle when it
 * did not reach the customer, else the two ticks. Not delivered drew the two ticks too, a pale red WhatsApp's "delivered"
 * white could not be told from on the orange (the owner, 2026-10-17: the Team chat on Android showed two videos WhatsApp
 * had refused as sent).
 */
export function tickPathOf(status: string | undefined): string {
  return status === "sending" ? "M8 1.2a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6ZM8 3.3v2.4l1.6 1"
    : status === "failed" ? "M8 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM8 3.2v2.7M8 7.9v.1"
    : "M1 6l3 3 6-7M7 8.5l.5.5 6-7";
}
