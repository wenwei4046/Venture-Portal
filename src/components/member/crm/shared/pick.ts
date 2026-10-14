/**
 * Photos and videos picked for a chat wait on a preview before they go (user 2026-10-13: "直接在選擇照片時左上角有個小小的
 * HD 按鈕，選擇就是HD"): the picture(s), a small HD switch top-left, Cancel, Send. Standard sends each photo upright and
 * at most 1600 px on its long side; HD upright at its own size (shared/image-prep.ts). A video too (2026-10-14, the owner:
 * "拍照和錄像要有 HD"): standard is made smaller to send quickly (8 MB, 960 px), HD keeps its quality up to the channel's
 * limit (shared/video-fit.ts).
 */
import type { MouseEvent } from "react";
import { prepareImage } from "./image-prep";
import { markStandard } from "./video-fit";

export interface Picked { items: { file: File; url: string; video: boolean }[]; hd: boolean }

export function pickedOf(files: File[]): Picked {
  return { hd: false, items: files.map(file => ({ file, url: typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "", video: file.type.startsWith("video/") })) };
}

const forget = (p: Picked) => p.items.forEach(it => { if (it.url) URL.revokeObjectURL(it.url); });

/** The preview's view model, the same in the salesperson's chat and the Control panel's. */
export function pickVM(p: Picked | null | undefined, set: (p: Picked | null) => void, send: (files: File[]) => Promise<unknown>) {
  if (!p) return null;
  const photos = p.items.filter(it => !it.video).length, n = p.items.length;
  return {
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
        const files = await Promise.all(p.items.map(it => (it.video ? Promise.resolve(p.hd ? it.file : markStandard(it.file)) : prepareImage(it.file, p.hd))));
        forget(p);
        await send(files);
      })();
    },
  };
}
export type PickVM = NonNullable<ReturnType<typeof pickVM>>;
