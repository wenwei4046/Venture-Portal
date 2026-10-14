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

export interface PickedItem { file: File; url: string; video: boolean; edits?: PhotoEdits; cut?: VideoCut; seconds?: number; caption?: string }
export interface Picked { items: PickedItem[]; hd: boolean; at?: number; caption?: string }

/** Each item's own caption (the owner, 2026-10-14: "選好圖片後，下方也可編輯" — WhatsApp asks one per photo); the first
 * starts as what was typed in the reply box. */
export const captionOf = (p: Picked, i: number) => p.items[i]?.caption ?? (i === 0 ? p.caption ?? "" : "");

export function pickedOf(files: File[]): Picked {
  return { hd: false, at: 0, caption: "", items: files.map(file => ({ file, url: typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "", video: file.type.startsWith("video/") })) };
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
    hdBg: p.hd ? "#3F2B22" : "#fff", hdFg: p.hd ? "#fff" : "#3F2B22", hdBd: p.hd ? "#3F2B22" : "#D9C7BA",
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
