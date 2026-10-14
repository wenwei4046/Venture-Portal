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
};

/** A message with no words, named in a chat list as the chat names it (it read "Attachment", or nothing). */
export function mediaWord(m: Pick<CrmChatMessage, "media">): string {
  const k = m.media?.kind;
  return k === "image" ? "📷 Photo" : k === "video" ? "🎥 Video" : k === "audio" ? "🎤 Voice message" : k === "file" ? `📄 ${m.media?.name ?? "Document"}` : "Attachment";
}

const visual = (m: Msg) => m.media?.kind === "image" || m.media?.kind === "video";

/** The chat's photos and videos, oldest first: what left / right steps through in the viewer. */
export function galleryOf(messages: Msg[]): ViewerItem[] {
  return messages.flatMap(m => (m.media && visual(m) ? [{ kind: m.media.kind as "image" | "video", url: m.media.url }] : []));
}

/**
 * Albums (WhatsApp's): four or more photos / videos in a row from the same side, without words of their own, each within
 * two minutes of the one before. The first message carries the album; the others are not drawn (`hidden`).
 */
export function albumsOf(messages: Msg[]): { lead: Map<string, Msg[]>; hidden: Set<string> } {
  const lead = new Map<string, Msg[]>(), hidden = new Set<string>();
  let run: Msg[] = [];
  const close = () => { if (run.length >= 4) { lead.set(run[0].id, run); run.slice(1).forEach(m => hidden.add(m.id)); } run = []; };
  for (const m of messages) {
    const prev = run[run.length - 1];
    const joins = visual(m) && !m.text && (!prev || (prev.from === m.from && Math.abs(new Date(m.at ?? 0).getTime() - new Date(prev.at ?? 0).getTime()) <= 120_000));
    if (!joins) { close(); if (visual(m) && !m.text) run = [m]; continue; }
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
    vidSrc: k === "video" ? (url.startsWith("blob:") ? url : `${url}#t=0.1`) : "",
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
    inPad: framed ? "0 7px" : k === "audio" ? "0 2px" : "0",
  };
}
