// Lead View › a photo edited before it is sent (2026-10-28 — the user: "在图片发出前可以先编辑再发出"). The editor
// (PhotoEditor) works on a canvas; what it works out is here, pure, tested in photo-edit.test.ts.

/** The longest side a photo is worked on and sent at — Messenger shows nothing larger. */
export const PHOTO_MAX_SIDE = 2048

/** The size a photo is worked on at: its own, or scaled down so its longest side is PHOTO_MAX_SIDE. */
export function workSize(w: number, h: number, max: number = PHOTO_MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

export interface Rect { x: number; y: number; w: number; h: number }

/** A crop dragged on the screen (two corners, any order) in the canvas's own pixels, inside the canvas; null if too small. */
export function cropRect(a: { x: number; y: number }, b: { x: number; y: number }, scale: number, canvas: { w: number; h: number }): Rect | null {
  const x0 = Math.max(0, Math.min(a.x, b.x) * scale), y0 = Math.max(0, Math.min(a.y, b.y) * scale)
  const x1 = Math.min(canvas.w, Math.max(a.x, b.x) * scale), y1 = Math.min(canvas.h, Math.max(a.y, b.y) * scale)
  const r = { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) }
  return r.w >= 8 && r.h >= 8 ? r : null
}

/** A pen's width and a text's size for a photo this wide — they read the same on any photo. */
export function penWidth(w: number): number { return Math.max(3, Math.round(w / 180)) }
export function textSize(w: number): number { return Math.max(16, Math.round(w / 18)) }

/** What the edited photo is sent as: PNG stays PNG (it may be a screenshot), anything else a JPEG; its name to match. */
export function editedType(file: { name: string; type: string }): { type: 'image/png' | 'image/jpeg'; name: string } {
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const base = (file.name.replace(/\.[^.]*$/, '') || 'photo').slice(0, 100)
  return { type, name: `${base}.${type === 'image/png' ? 'png' : 'jpg'}` }
}

/** A photo the editor takes: a still picture the browser draws (not a GIF, whose motion a canvas would lose). */
export function editable(file: { type: string }): boolean {
  return /^image\/(jpeg|png|webp|heic|heif|bmp)$/.test(file.type)
}
