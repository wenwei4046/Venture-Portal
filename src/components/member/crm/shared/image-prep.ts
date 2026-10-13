/**
 * A photo is made ready on the phone before it is sent (user 2026-10-13: "照片發送後，接收到的照片是倒翻的"; "可選擇 HD").
 * A phone photo keeps its pixels as the sensor took them and only says, in its EXIF data, how to turn them; Messenger
 * shows the pixels as they are — upside down or sideways. Drawn once onto a canvas the right way up (the browser applies
 * the EXIF turn) and saved again as JPEG, it is upright everywhere, and the size is the member's choice:
 * - standard: the long side at most 1600 px, quality .82 — quick to send, what a chat shows anyway;
 * - HD: the photo's own size (the long side at most 4096 px), quality .92.
 * A GIF, a video or anything the browser cannot draw goes as it is.
 */

export const STANDARD_SIDE = 1600;
export const HD_SIDE = 4096;

/** The size a photo is drawn at: its own when it already fits, else the long side brought down to `max`. */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** "IMG_8396.HEIC" → "IMG_8396.jpg" */
export const jpegName = (name: string) => (name.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "photo") + ".jpg";

export async function prepareImage(file: File, hd: boolean): Promise<File> {
  if (!/^image\//.test(file.type) || file.type === "image/gif" || typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const { w, h } = fitSize(bmp.width, bmp.height, hd ? HD_SIDE : STANDARD_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) return file;
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); // a transparent PNG becomes a white-backed JPEG, not a black one
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", hd ? 0.92 : 0.82));
    return blob ? new File([blob], jpegName(file.name || "photo"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}
