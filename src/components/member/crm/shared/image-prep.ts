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

/** Photos already made ready (the preview's Send): the send does not draw them again (and an HD one stays HD). */
const ready = new WeakSet<File>();
export const isPrepared = (f: File) => ready.has(f);

/**
 * A JPEG's EXIF orientation (1–8) and its stored size, read from its first bytes. The camera writes the pixels as the
 * sensor saw them and says in the EXIF how to turn them; iPhone's browser did not always turn them while decoding, and the
 * JPEG we draw carries no EXIF, so the customer got a sideways photo on WhatsApp's computer app (the owner, 2026-10-14:
 * "手機拍照和發送後的畫面，圖片是正的，電腦端看到是反的"). Not a JPEG, or no EXIF: orientation 1.
 */
export function jpegFacts(buf: ArrayBuffer): { orientation: number; w: number; h: number } {
  const v = new DataView(buf), out = { orientation: 1, w: 0, h: 0 };
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return out;
  let p = 2;
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) break;
    const marker = v.getUint8(p + 1), len = v.getUint16(p + 2);
    if (marker === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) { // "Exif"
      const t = p + 10, le = v.getUint16(t) === 0x4949;
      const u16 = (o: number) => v.getUint16(o, le), u32 = (o: number) => v.getUint32(o, le);
      if (t + 8 <= v.byteLength) {
        const ifd = t + u32(t + 4), n = ifd + 2 <= v.byteLength ? u16(ifd) : 0;
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 10 > v.byteLength) break;
          if (u16(e) === 0x0112) { const o = u16(e + 8); if (o >= 1 && o <= 8) out.orientation = o; break; }
        }
      }
    } else if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && p + 9 <= v.byteLength) {
      out.h = v.getUint16(p + 5); out.w = v.getUint16(p + 7);
      break;
    }
    if (marker === 0xda) break;
    p += 2 + len;
  }
  return out;
}

/** The canvas turn that draws pixels stored with EXIF `o` upright, for a drawn size of w × h (as seen upright). */
export function orientTransform(o: number, w: number, h: number): [number, number, number, number, number, number] {
  switch (o) {
    case 2: return [-1, 0, 0, 1, w, 0];
    case 3: return [-1, 0, 0, -1, w, h];
    case 4: return [1, 0, 0, -1, 0, h];
    case 5: return [0, 1, 1, 0, 0, 0];
    case 6: return [0, 1, -1, 0, w, 0];
    case 7: return [0, -1, -1, 0, w, h];
    case 8: return [0, -1, 1, 0, 0, h];
    default: return [1, 0, 0, 1, 0, 0];
  }
}

/** Whether this browser turns a photo by its EXIF while decoding — learnt from the first sideways (5–8) photo it sees. */
let browserTurns: boolean | null = null;

export async function prepareImage(file: File, hd: boolean): Promise<File> {
  if (!/^image\//.test(file.type) || file.type === "image/gif" || typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const facts = /jpe?g/i.test(file.type) ? jpegFacts(await file.slice(0, 262144).arrayBuffer()) : { orientation: 1, w: 0, h: 0 };
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const o = facts.orientation, sideways = o >= 5;
    // A sideways photo tells: decoded with its stored width, the browser did not turn it.
    if (sideways && facts.w && facts.h && facts.w !== facts.h) browserTurns = bmp.width !== facts.w;
    const turn = o !== 1 && browserTurns === false;
    const upW = turn && sideways ? bmp.height : bmp.width, upH = turn && sideways ? bmp.width : bmp.height;
    const { w, h } = fitSize(upW, upH, hd ? HD_SIDE : STANDARD_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext("2d");
    if (!g) return file;
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); // a transparent PNG becomes a white-backed JPEG, not a black one
    if (turn) { g.setTransform(...orientTransform(o, w, h)); g.drawImage(bmp, 0, 0, sideways ? h : w, sideways ? w : h); }
    else g.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", hd ? 0.92 : 0.82));
    if (!blob) return file;
    const out = new File([blob], jpegName(file.name || "photo"), { type: "image/jpeg" });
    ready.add(out);
    return out;
  } catch {
    return file;
  }
}
