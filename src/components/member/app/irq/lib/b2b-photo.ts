// IR Quote (2026-11-09): b2b's product photos, as this origin hands them to the phone that draws the quotation's PDF
// (`/member/irq-photo`). Only b2b's own product photos pass: the address must be https on mm.hinlim.com under
// /cache/b2bfs/, with nothing that walks out of it.

export const B2B_PHOTO_ORIGIN = "https://mm.hinlim.com";
const PREFIX = "/cache/b2bfs/";

/** The b2b photo `raw` names, normalised, or null when it is anything else. */
export function b2bPhotoUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 600) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.origin !== B2B_PHOTO_ORIGIN || u.username || u.password || u.search || u.hash) return null;
  if (!u.pathname.startsWith(PREFIX) || /(^|\/)\.\.?(\/|$)|%2e|%2f|\\/i.test(u.pathname)) return null;
  return u.toString();
}

/**
 * A company photo's file on this origin (`/files/<bucket>/<path>`, Quote settings' own pictures) as its bucket and name,
 * or null. /files answers with a redirect to R2, which sends no CORS header — the PDF could not draw it (the user,
 * 2026-11-09: "手机分享和下载的pdf 没有图片"), so /member/irq-photo hands its bytes over itself.
 */
export function filesPhoto(raw: string | null | undefined): { bucket: string; name: string } | null {
  const m = /^\/files\/([a-z0-9][a-z0-9-]{1,62})\/([^?#]+)$/.exec(String(raw || ""));
  if (!m || m[2].length > 1024) return null;
  let name: string;
  try { name = decodeURIComponent(m[2]); } catch { return null; }
  if (/[\u0000-\u001f\u007f\\]/.test(name) || name.startsWith("/") || name.split("/").some(x => x === "" || x === "." || x === "..")) return null;
  return { bucket: m[1], name };
}

/** The address the PDF draws a photo from: this origin's, which hands over its bytes (b2b's or the company's). Any other picture as it is. */
export const viaThisOrigin = (src: string) =>
  b2bPhotoUrl(src) ? "/member/irq-photo?u=" + encodeURIComponent(src) : filesPhoto(src) ? "/member/irq-photo?f=" + encodeURIComponent(src) : src;
