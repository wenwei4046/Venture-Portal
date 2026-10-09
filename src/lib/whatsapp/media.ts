/**
 * A customer's photo, video, voice message or document, fetched from Meta.
 * WhatsApp gives a media id; the server asks Meta for a short-lived URL with
 * the token, then downloads it with the token again. The token and Meta's URL
 * never reach a browser — the member gets the file through our own route.
 */
import { GRAPH_VERSION } from "./send";

/** What the chat may show inline; anything else is offered as a download. */
const INLINE = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|3gpp)|audio\/(ogg|mpeg|mp4|aac|amr|opus))\b/i;

export const inlineType = (mime: string | null | undefined) => !!mime && INLINE.test(mime);

/** Media ids from Meta are digits; anything else is not asked for. */
export const validMediaId = (id: string | null | undefined): id is string => !!id && /^\d{5,32}$/.test(id);

export type MediaResult = { ok: true; body: ReadableStream<Uint8Array> | null; type: string; length: string | null } | { ok: false; status: number; error: string };

export async function fetchWhatsAppMedia(mediaId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<MediaResult> {
  if (!validMediaId(mediaId)) return { ok: false, status: 400, error: "Not a media id." };
  const auth = { Authorization: `Bearer ${token}` };
  let info: { url?: string; mime_type?: string } | null;
  try {
    const r = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, { headers: auth, cache: "no-store" });
    info = r.ok ? await r.json() : null;
    if (!r.ok) return { ok: false, status: r.status === 404 ? 404 : 502, error: r.status === 404 ? "WhatsApp no longer has this file (media is kept for a limited time)." : "WhatsApp did not give the file." };
  } catch {
    return { ok: false, status: 502, error: "Could not reach WhatsApp." };
  }
  // Only ever download from Meta's own servers.
  let url: URL;
  try { url = new URL(info?.url ?? ""); } catch { return { ok: false, status: 502, error: "WhatsApp did not give the file." }; }
  if (url.protocol !== "https:" || !/(^|\.)(fbsbx|facebook|whatsapp)\.(com|net)$/.test(url.hostname)) {
    return { ok: false, status: 502, error: "WhatsApp gave an unexpected address." };
  }
  try {
    const file = await fetchImpl(url, { headers: auth, cache: "no-store" });
    if (!file.ok) return { ok: false, status: 502, error: "WhatsApp did not give the file." };
    return { ok: true, body: file.body, type: info?.mime_type || file.headers.get("content-type") || "application/octet-stream", length: file.headers.get("content-length") };
  } catch {
    return { ok: false, status: 502, error: "Could not download the file from WhatsApp." };
  }
}
