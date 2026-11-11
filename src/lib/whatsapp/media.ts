/**
 * A customer's photo, video, voice message or document, fetched from Meta.
 * WhatsApp gives a media id; the server asks Meta for a short-lived URL with
 * the token, then downloads it with the token again. The token and Meta's URL
 * never reach a browser — the member gets the file through our own route.
 */
import { GRAPH_VERSION } from "./send";

/** What the chat may show inline; anything else is offered as a download. */
const INLINE = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|3gpp|quicktime)|audio\/(ogg|mpeg|mp4|aac|amr|opus|webm|x-m4a)|application\/pdf)\b/i;

export const inlineType = (mime: string | null | undefined) => !!mime && INLINE.test(mime);

/** Media ids from Meta are digits; anything else is not asked for. */
export const validMediaId = (id: string | null | undefined): id is string => !!id && /^\d{5,32}$/.test(id);

export type MediaResult = { ok: true; body: ReadableStream<Uint8Array> | null; type: string; length: string | null; partial?: boolean; range?: string | null } | { ok: false; status: number; error: string };

/** A Messenger attachment's address, only on Meta's own hosts (https); null otherwise. The browser goes there itself. */
export function messengerMediaAddress(address: string | null | undefined): string | null {
  try {
    const url = new URL(address ?? "");
    return url.protocol === "https:" && /(^|\.)(fbcdn\.net|fbsbx\.com|facebook\.com)$/.test(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

/** How long WhatsApp keeps a customer's media id downloadable (since 2025-10-09; it was 30 days). */
export const WHATSAPP_KEEPS_DAYS = 7;
const DAY = 86_400_000;

/** When Messenger's signed address stops (its `oe=`, hex seconds), in ms; null when it carries none. */
export function messengerExpiresAt(address: string | null | undefined): number | null {
  const hex = /[?&]oe=([0-9A-Fa-f]{1,15})(?:&|#|$)/.exec(address ?? "")?.[1];
  return hex ? parseInt(hex, 16) * 1000 : null;
}

/**
 * A customer's file Meta no longer serves and we never kept (2026-11-10): which channel's, else null. A file in our own
 * bucket (media_path) never is; a WhatsApp media id older than 7 days is; a Messenger address past its `oe=`, or not on
 * Meta's hosts, is. GET /member/crm-media answers 410 for it and the chat draws "no longer available".
 * OUR OWN message never is (2026-11-11 — the owner read two "Voice message no longer available" tiles as our sent voice
 * notes): what we send is ours in crm-media, and Meta's 7 days are a customer's file only.
 */
export function goneAtMeta(row: { direction?: string | null; media_id?: string | null; media_path?: string | null; media_url?: string | null; sent_at?: string | null }, now = Date.now()): "whatsapp" | "messenger" | null {
  if (row.direction === "out") return null;
  if (row.media_path) return null;
  if (row.media_url) {
    if (!messengerMediaAddress(row.media_url)) return "messenger";
    const ends = messengerExpiresAt(row.media_url);
    return ends !== null && ends <= now ? "messenger" : null;
  }
  if (row.media_id && row.sent_at) {
    const at = Date.parse(row.sent_at);
    return Number.isFinite(at) && now - at > WHATSAPP_KEEPS_DAYS * DAY ? "whatsapp" : null;
  }
  return null;
}

/** Graph's answer for a media id — its short-lived address (Meta's hosts only) and type — downloading nothing. */
export async function whatsAppMediaInfo(mediaId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; url: URL; mime: string | null } | { ok: false; status: number; error: string }> {
  if (!validMediaId(mediaId)) return { ok: false, status: 400, error: "Not a media id." };
  let info: { url?: string; mime_type?: string } | null;
  try {
    const r = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    // 404 / 400: the id is gone at Meta (kept 7 days) — 410, which the chat takes as "no longer available" (2026-11-10).
    const gone = r.status === 404 || r.status === 400;
    if (!r.ok) return { ok: false, status: gone ? 410 : 502, error: gone ? "WhatsApp no longer has this file (media is kept for a limited time)." : "WhatsApp did not give the file." };
    info = await r.json();
  } catch {
    return { ok: false, status: 502, error: "Could not reach WhatsApp." };
  }
  // Only ever download from Meta's own servers.
  let url: URL;
  try { url = new URL(info?.url ?? ""); } catch { return { ok: false, status: 502, error: "WhatsApp did not give the file." }; }
  if (url.protocol !== "https:" || !/(^|\.)(fbsbx|facebook|whatsapp)\.(com|net)$/.test(url.hostname)) {
    return { ok: false, status: 502, error: "WhatsApp gave an unexpected address." };
  }
  return { ok: true, url, mime: info?.mime_type || null };
}

export async function fetchWhatsAppMedia(mediaId: string, token: string, fetchImpl: typeof fetch = fetch, range?: string | null): Promise<MediaResult> {
  const info = await whatsAppMediaInfo(mediaId, token, fetchImpl);
  if (!info.ok) return info;
  try {
    // A video or voice note asks in ranges; the range is passed on and Meta's part handed back as it comes (streamed).
    const file = await fetchImpl(info.url, { headers: { Authorization: `Bearer ${token}`, ...(range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {}) }, cache: "no-store" });
    if (!file.ok) return { ok: false, status: 502, error: "WhatsApp did not give the file." };
    return { ok: true, body: file.body, type: info.mime || file.headers.get("content-type") || "application/octet-stream", length: file.headers.get("content-length"),
      partial: file.status === 206, range: file.headers.get("content-range") };
  } catch {
    return { ok: false, status: 502, error: "Could not download the file from WhatsApp." };
  }
}
