/**
 * Photos and videos picked for a chat wait on a preview before they go (user 2026-10-13: "直接在選擇照片時左上角有個小小的
 * HD 按鈕，選擇就是HD"): the picture(s), a small HD switch top-left, Cancel, Send. Standard sends each photo upright and
 * at most 1600 px on its long side; HD upright at its own size (shared/image-prep.ts). A video too (2026-10-14, the owner:
 * "拍照和錄像要有 HD"): standard is made smaller to send quickly (8 MB, 960 px), HD keeps its quality up to the channel's
 * limit (shared/video-fit.ts).
 *
 * Since the same evening the preview is WhatsApp's editor, full screen (the owner: "編輯工具也開始做吧"; markup
 * shared/pick-editor.tsx): each photo keeps its edits — turn, crop, drawing, text, stickers (shared/edit-render.ts) —
 * each video the part kept and whether its sound goes, and the caption is typed there.
 */
import type { MouseEvent } from "react";
import { prepareImage } from "./image-prep";
import { isEdited, renderEdited, type PhotoEdits } from "./edit-render";
import { markCut, markStandard, markVideoEdits, type VideoCut } from "./video-fit";

export interface PickedItem {
  file: File; url: string; video: boolean; edits?: PhotoEdits; cut?: VideoCut; seconds?: number; caption?: string;
  /** A portrait photo from the camera, still to be cropped to 9:16 once its size is known (2026-10-15; any edit clears it). */
  fill916?: boolean;
}

/**
 * The camera's photo cropped to fill a 9:16 screen (the owner, 2026-10-15: "相機能不能是 full screen 9:16", choosing a crop in
 * the editor over a camera of our own — a page cannot ask the phone's camera for 9:16, and our own would lose its picture
 * processing): the middle 9:16 of a portrait frame, in the frame's 0–1 coordinates. A landscape or already-9:16 photo is
 * left whole (null). Reset in Crop gives the whole photo back.
 */
export function crop916(w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  if (!(w > 0 && h > 0) || w >= h) return null;
  const r = 9 / 16, now = w / h;
  if (Math.abs(now - r) / r < 0.03) return null;
  if (now > r) { const cw = (h * r) / w; return { x: (1 - cw) / 2, y: 0, w: cw, h: 1 }; }
  const ch = w / r / h;
  return { x: 0, y: (1 - ch) / 2, w: 1, h: ch };
}
export interface Picked { items: PickedItem[]; hd: boolean; at?: number; caption?: string }

/** Each item's own caption (the owner, 2026-10-14: "選好圖片後，下方也可編輯" — WhatsApp asks one per photo); the first
 * starts as what was typed in the reply box. */
export const captionOf = (p: Picked, i: number) => p.items[i]?.caption ?? (i === 0 ? p.caption ?? "" : "");

export function pickedOf(files: File[], opts: { camera?: boolean } = {}): Picked {
  return { hd: false, at: 0, caption: "", items: files.map(file => ({ file, url: typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "", video: file.type.startsWith("video/"), ...(opts.camera && file.type.startsWith("image/") ? { fill916: true } : {}) })) };
}

const forget = (p: Picked) => p.items.forEach(it => { if (it.url) URL.revokeObjectURL(it.url); });

/** What is sent for one item: a photo with its edits drawn in (or just made ready), a video marked HD / trimmed / muted. */
export async function finalFile(it: PickedItem, hd: boolean): Promise<File> {
  if (it.video) {
    const f = hd ? it.file : markStandard(it.file);
    if (isEdited(it.edits)) markVideoEdits(f, it.edits!);
    const cut = it.cut;
    return cut && (cut.mute || cut.start > 0.05 || (it.seconds != null && cut.end < it.seconds - 0.05)) ? markCut(f, cut) : f;
  }
  return isEdited(it.edits) ? renderEdited(it.file, it.edits!, hd) : prepareImage(it.file, hd);
}

/** The preview's view model, the same in the salesperson's chat and the Control panel's. */
export function pickVM(p: Picked | null | undefined, set: (p: Picked | null) => void, send: (files: File[], captions: string[]) => Promise<unknown>) {
  if (!p) return null;
  const photos = p.items.filter(it => !it.video).length, n = p.items.length;
  return {
    p, set,
    items: p.items.map(it => ({ img: it.video ? "" : it.url, vid: it.video ? it.url : "" })),
    hdBg: p.hd ? "var(--crm-ink)" : "#fff", hdFg: p.hd ? "#fff" : "var(--crm-ink)", hdBd: p.hd ? "var(--crm-ink)" : "var(--crm-line)",
    toggleHd: () => set({ ...p, hd: !p.hd }),
    title: n === 1 ? (p.items[0].video ? "1 video" : "1 photo") : `${n} items`,
    note: p.hd ? `HD · ${photos ? "full size" : "full quality"}` : `Standard · made smaller to send quickly · tap HD for ${photos ? "full size" : "full quality"}`,
    sendLabel: n === 1 ? "Send" : `Send ${n}`,
    stop: (e: MouseEvent) => e.stopPropagation(),
    cancel: () => { forget(p); set(null); },
    send: () => {
      set(null);
      void (async () => {
        const files = await Promise.all(p.items.map(it => finalFile(it, p.hd)));
        forget(p);
        await send(files, p.items.map((_, i) => captionOf(p, i).trim()));
      })();
    },
  };
}
export type PickVM = NonNullable<ReturnType<typeof pickVM>>;
