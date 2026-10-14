import type { SyntheticEvent } from "react";
import type { CrmChatMessage } from "@/lib/member/crm-data";
import { docLabel, mediaHeight, openViewer, rememberShape, type ViewerItem } from "./viewer";

/**
 * A message's photo, video, voice note or document as both chats draw it (the salesperson's and the panel's; markup
 * `tools/crm-design/chat-media.cjs`). The owner, 2026-10-14:
 * - "點入聊天室時，它還是會有載入的痕跡（畫面一直跳動）": a photo's box is drawn at its final size before it loads — its own
 *   shape once seen (`mediaHeight`), else a portrait box — so nothing below it moves while the chat opens;
 * - "聊天室的邊框不要那麼大": a photo, video or document sits 3 px inside its bubble, as WhatsApp's (`pad`);
 * - a tap opens the in-app viewer (shared/viewer.tsx) on the chat's photos and videos, a document on its own;
 * - "發送 pdf, 可以直接顯示 pdf 的名": a document is a tile with its name and type, not "Open file".
 */
type Msg = Pick<CrmChatMessage, "id" | "media">;

export const NO_MEDIA = {
  img: "", vid: "", vidSrc: "", aud: "", file: "", mh: "", docName: "", docType: "",
  view: undefined as (() => void) | undefined, shape: undefined as ((e: SyntheticEvent<HTMLImageElement | HTMLVideoElement>) => void) | undefined,
  pad: "10px 13px", inPad: "0",
};

/** The chat's photos and videos, oldest first: what left / right steps through in the viewer. */
export function galleryOf(messages: Msg[]): ViewerItem[] {
  return messages.flatMap(m => (m.media && (m.media.kind === "image" || m.media.kind === "video") ? [{ kind: m.media.kind, url: m.media.url }] : []));
}

export function mediaOf(m: Msg, gallery: ViewerItem[]): typeof NO_MEDIA {
  const md = m.media;
  if (!md) return NO_MEDIA;
  const k = md.kind, url = md.url, framed = k === "image" || k === "video" || k === "file";
  return {
    img: k === "image" ? url : "",
    vid: k === "video" ? url : "",
    // iPhone draws a video's first frame only when asked for a moment into it.
    vidSrc: k === "video" ? (url.startsWith("blob:") ? url : `${url}#t=0.1`) : "",
    aud: k === "audio" ? url : "",
    file: k === "file" ? url : "",
    mh: k === "image" || k === "video" ? mediaHeight(url) : "",
    docName: k === "file" ? md.name || "Document" : "",
    docType: k === "file" ? docLabel(md.name, md.mime) : "",
    view: k === "audio" ? undefined
      : k === "file" ? () => openViewer([{ kind: "file", url, name: md.name, mime: md.mime }], 0)
      : () => openViewer(gallery, Math.max(0, gallery.findIndex(g => g.url === url))),
    shape: k === "image" || k === "video" ? e => {
      const t = e.currentTarget as HTMLImageElement & HTMLVideoElement;
      rememberShape(url, t.naturalWidth || t.videoWidth, t.naturalHeight || t.videoHeight);
    } : undefined,
    pad: framed ? "3px 3px 5px" : "10px 13px",
    inPad: framed ? "0 7px" : "0",
  };
}
