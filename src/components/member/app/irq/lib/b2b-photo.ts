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

/** The address the page draws a b2b photo from: this origin's, so the PDF can draw it. Any other picture as it is. */
export const viaThisOrigin = (src: string) => (b2bPhotoUrl(src) ? "/member/irq-photo?u=" + encodeURIComponent(src) : src);
