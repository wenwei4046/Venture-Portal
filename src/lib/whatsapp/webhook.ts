/**
 * The WhatsApp Cloud API webhook, the pure half: Meta's verification
 * handshake, the delivery signature, and turning Meta's nested payload into
 * the flat rows the ingest RPC writes. No I/O here, so every rule is tested.
 *
 * Meta calls the portal two ways at one Callback URL
 * (/api/whatsapp/v1/webhook):
 *   GET  — once, when somebody saves the Callback URL in the app dashboard:
 *          hub.mode=subscribe & hub.verify_token=<WHATSAPP_VERIFY_TOKEN> &
 *          hub.challenge=<n>. Answer the challenge only if the token matches.
 *   POST — every message, and every status of a message we sent, signed
 *          X-Hub-Signature-256: sha256=<HMAC-SHA256 of the raw body with the
 *          app secret (META_APP_SECRET)>.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison; false for different lengths without leaking where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type VerifyOutcome =
  | { ok: true; challenge: string }
  | { ok: false; status: 403 | 503; reason: string };

/** The GET handshake. Unset token → 503 (not configured), never a pass. */
export function verifyHandshake(params: URLSearchParams, expectedToken: string | undefined): VerifyOutcome {
  if (!expectedToken) return { ok: false, status: 503, reason: "WHATSAPP_VERIFY_TOKEN is not set" };
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !challenge || !safeEqual(token, expectedToken)) {
    return { ok: false, status: 403, reason: "verify token or mode did not match" };
  }
  return { ok: true, challenge };
}

/** The POST signature: HMAC-SHA256 of the exact raw body. Unset secret → false, never a pass. */
export function signatureValid(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header, expected);
}

/* ── Meta's payload, the parts the CRM reads ───────────────────────────── */

interface WaMedia { id?: string; mime_type?: string; caption?: string; filename?: string }
interface WaMessage {
  id?: string;
  from?: string;
  /** The customer's business-scoped user ID (BSUID) — the only id Meta sends when they use a WhatsApp username and hide their number (2026). */
  from_user_id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: WaMedia; video?: WaMedia; audio?: WaMedia & { voice?: boolean }; document?: WaMedia; sticker?: WaMedia;
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  /** A click-to-WhatsApp ad: which ad the customer came from. */
  referral?: { source_type?: string; source_id?: string; source_url?: string; headline?: string; body?: string; ctwa_clid?: string };
}
interface WaStatus { id?: string; status?: string; timestamp?: string; recipient_id?: string; errors?: { code?: number; title?: string }[] }
interface WaValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id?: string; user_id?: string; profile?: { name?: string; username?: string } }[];
  messages?: WaMessage[];
  statuses?: WaStatus[];
}

/* ── What the ingest RPC receives ──────────────────────────────────────── */

export type WaMessageKind = "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "button" | "other";

export interface WaInboundMessage {
  externalId: string;           // wamid — re-deliveries carry the same one
  phoneNumberId: string;        // our number the customer wrote to
  waId: string;                 // the customer's WhatsApp id: their number (digits), or their BSUID ("MY.1052…") when a username hides it
  name: string | null;          // their WhatsApp profile name
  kind: WaMessageKind;
  body: string | null;          // text, caption, button title or a location summary
  mediaId: string | null;       // download later with the token; never a URL from Meta
  mediaMime: string | null;
  sentAt: string;               // ISO
  ad: { sourceId: string | null; headline: string | null; sourceUrl: string | null } | null;
}

export interface WaStatusUpdate {
  externalId: string;
  status: "sent" | "delivered" | "read" | "failed";
  at: string;
  error: string | null;
}

export interface WaDelivery {
  messages: WaInboundMessage[];
  statuses: WaStatusUpdate[];
  /** Changes that were not WhatsApp messages/statuses (other fields Meta may send) — logged, not applied. */
  ignored: number;
}

const iso = (unixSeconds: string | undefined) => {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
};

function readMessage(m: WaMessage, phoneNumberId: string, names: Map<string, string>): WaInboundMessage | null {
  // A customer with a WhatsApp username may come with no number at all, only their BSUID (user 2026-10-12: a
  // colleague's "WhatsApp testing" was dropped). The number is kept whenever Meta sends it.
  const from = m.from || m.from_user_id;
  if (!m.id || !from) return null;
  const media: WaMedia | undefined = m.image ?? m.video ?? m.audio ?? m.document ?? m.sticker;
  const known: WaMessageKind[] = ["text", "image", "video", "audio", "document", "sticker", "location", "button"];
  const kind: WaMessageKind = m.type === "interactive" ? "button" : known.includes(m.type as WaMessageKind) ? (m.type as WaMessageKind) : "other";
  const body =
    m.text?.body ??
    media?.caption ??
    m.button?.text ??
    m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ??
    (m.location ? [m.location.name, m.location.address, m.location.latitude != null ? `${m.location.latitude},${m.location.longitude}` : null].filter(Boolean).join(" · ") : null) ??
    null;
  return {
    externalId: m.id,
    phoneNumberId,
    waId: from,
    name: names.get(from) ?? null,
    kind,
    body,
    mediaId: media?.id ?? null,
    mediaMime: media?.mime_type ?? null,
    sentAt: iso(m.timestamp),
    ad: m.referral ? { sourceId: m.referral.source_id ?? null, headline: m.referral.headline ?? null, sourceUrl: m.referral.source_url ?? null } : null,
  };
}

/** Meta's delivery → flat rows. Tolerates anything unexpected; never throws on shape. */
export function parseDelivery(body: unknown): WaDelivery {
  const out: WaDelivery = { messages: [], statuses: [], ignored: 0 };
  const entries = (body as { entry?: { changes?: { field?: string; value?: WaValue }[] }[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (change?.field !== "messages" || v?.messaging_product !== "whatsapp" || !v.metadata?.phone_number_id) { out.ignored++; continue; }
      const phoneNumberId = v.metadata.phone_number_id;
      // Each contact's name under every id it carries — its number and its BSUID — so either finds it.
      const names = new Map((v.contacts ?? []).flatMap(c => [c.wa_id, c.user_id].filter((k): k is string => !!k).map(k => [k, c.profile?.name ?? ""] as const)));
      for (const m of v.messages ?? []) { const row = readMessage(m, phoneNumberId, names); if (row) out.messages.push(row); }
      for (const s of v.statuses ?? []) {
        if (!s.id || !["sent", "delivered", "read", "failed"].includes(s.status ?? "")) continue;
        out.statuses.push({
          externalId: s.id,
          status: s.status as WaStatusUpdate["status"],
          at: iso(s.timestamp),
          error: s.errors?.length ? s.errors.map(e => [e.code, e.title].filter(Boolean).join(" ")).join("; ") : null,
        });
      }
    }
  }
  return out;
}

export { callbackUrl } from "./callback";
