/**
 * A photo's edits on the preview (the owner, 2026-10-14, WhatsApp's editor beside ours: save, HD, crop and turn,
 * stickers, text, drawing) and drawing them into the JPEG that is sent. The order is the editor's: the photo upright
 * (its EXIF, shared/image-prep.ts) → turned → cropped → the drawing, text and stickers on top. Everything on top is kept
 * in the cropped frame's own 0–1 coordinates, so it lands where it was put at any size.
 */
import { fitSize, HD_SIDE, markPrepared, prepareImage, STANDARD_SIDE } from "./image-prep";

export type Rect = { x: number; y: number; w: number; h: number };
export type Stroke = { color: string; width: number; pts: [number, number][] };
export type Label = { id: string; kind: "text" | "sticker"; text: string; color: string; x: number; y: number; size: number };
export interface PhotoEdits { turn: 0 | 1 | 2 | 3; crop: Rect; strokes: Stroke[]; labels: Label[] }

export const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
export const noEdits = (): PhotoEdits => ({ turn: 0, crop: { ...FULL }, strokes: [], labels: [] });
export const isEdited = (e?: PhotoEdits | null) =>
  !!e && (e.turn !== 0 || e.crop.x !== 0 || e.crop.y !== 0 || e.crop.w !== 1 || e.crop.h !== 1 || e.strokes.length > 0 || e.labels.length > 0);

/** The size of a w × h picture after `turn` quarter turns clockwise. */
export const turnedSize = (w: number, h: number, turn: number) => (turn % 2 ? { w: h, h: w } : { w, h });

/** A crop kept inside the picture and at least `min` of it on each side. */
export function clampCrop(r: Rect, min = 0.08): Rect {
  const w = Math.max(min, Math.min(1, r.w)), h = Math.max(min, Math.min(1, r.h));
  return { x: Math.max(0, Math.min(1 - w, r.x)), y: Math.max(0, Math.min(1 - h, r.y)), w, h };
}

/** Draws `src` (W × H, upright) turned and cropped onto `g`, filling outW × outH. */
export function drawBase(g: CanvasRenderingContext2D, src: CanvasImageSource, W: number, H: number, e: PhotoEdits, outW: number, outH: number) {
  const t = turnedSize(W, H, e.turn);
  const cx = e.crop.x * t.w, cy = e.crop.y * t.h, cw = e.crop.w * t.w, ch = e.crop.h * t.h;
  g.save();
  g.scale(outW / cw, outH / ch);
  g.translate(-cx, -cy);
  // turn the upright picture into the turned frame (0,0)–(t.w,t.h)
  if (e.turn === 1) { g.translate(t.w, 0); g.rotate(Math.PI / 2); }
  else if (e.turn === 2) { g.translate(t.w, t.h); g.rotate(Math.PI); }
  else if (e.turn === 3) { g.translate(0, t.h); g.rotate(-Math.PI / 2); }
  g.drawImage(src, 0, 0, W, H);
  g.restore();
}

/** Draws the drawing, text and stickers onto a w × h frame. Sizes are a share of the frame's shorter side. */
export function drawOver(g: CanvasRenderingContext2D, e: PhotoEdits, w: number, h: number) {
  const u = Math.min(w, h);
  g.save();
  g.lineCap = "round"; g.lineJoin = "round";
  for (const s of e.strokes) {
    if (!s.pts.length) continue;
    g.strokeStyle = s.color; g.lineWidth = s.width * u;
    g.beginPath();
    g.moveTo(s.pts[0][0] * w, s.pts[0][1] * h);
    for (const [x, y] of s.pts.slice(1)) g.lineTo(x * w, y * h);
    if (s.pts.length === 1) g.lineTo(s.pts[0][0] * w + 0.1, s.pts[0][1] * h);
    g.stroke();
  }
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const l of e.labels) {
    const px = l.size * u;
    g.font = `${l.kind === "text" ? "700 " : ""}${px}px Inter, -apple-system, "Segoe UI", sans-serif`;
    const lines = l.text.split("\n");
    lines.forEach((line, i) => {
      const y = l.y * h + (i - (lines.length - 1) / 2) * px * 1.2;
      if (l.kind === "text") { g.lineWidth = px / 8; g.strokeStyle = l.color === "#FFFFFF" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.85)"; g.strokeText(line, l.x * w, y); }
      g.fillStyle = l.color;
      g.fillText(line, l.x * w, y);
    });
  }
  g.restore();
}

/** The photo with its edits, as the JPEG that is sent: HD at up to 4096 px on its long side, standard at 1600. */
export async function renderEdited(file: File, e: PhotoEdits, hd: boolean): Promise<File> {
  const upright = await prepareImage(file, true);
  const bmp = await createImageBitmap(upright);
  const t = turnedSize(bmp.width, bmp.height, e.turn);
  const { w, h } = fitSize(Math.round(e.crop.w * t.w), Math.round(e.crop.h * t.h), hd ? HD_SIDE : STANDARD_SIDE);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return upright;
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  drawBase(g, bmp, bmp.width, bmp.height, e, w, h);
  drawOver(g, e, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", hd ? 0.92 : 0.85));
  return blob ? markPrepared(new File([blob], upright.name, { type: "image/jpeg" })) : upright;
}
