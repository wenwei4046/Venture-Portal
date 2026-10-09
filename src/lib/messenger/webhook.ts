/**
 * The Messenger webhook, the pure half: Meta's Page payload turned into the
 * flat rows crm_ingest_messenger writes. The handshake and the signature are
 * the same as WhatsApp's (one Meta app) — src/lib/whatsapp/webhook.ts.
 *
 * Meta calls /api/messenger/v1/webhook with object "page"; each entry is one
 * of our Pages, each messaging event one thing that happened in a chat:
 *   message      — the customer wrote (text and/or attachments);
 *                  is_echo = the Page's own message (ours, or from Meta's inbox): skipped;
 *   postback     — the customer tapped a button (its title is the text);
 *   referral     — on a click-to-Messenger ad: which ad brought them;
 *   delivery     — our messages (by mid) reached them;
 *   read         — they read everything we sent up to a moment (watermark).
 */

export type MsgKind = "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "button" | "other";

export interface MsgInbound {
  externalId: string;    // mid — re-deliveries carry the same one
  pageId: string;        // our Page they wrote to
  psid: string;          // the customer's page-scoped id
  name: string | null;   // filled by the route from the profile, when Meta gives it
  kind: MsgKind;
  body: string | null;
  sentAt: string;        // ISO
  ad: { sourceId: string | null; headline: string | null; sourceUrl: string | null } | null;
}

export interface MsgDelivery {
  messages: MsgInbound[];
  /** Our messages that reached the customer. */
  delivered: { externalId: string }[];
  /** The customer read everything we sent them up to watermark. */
  reads: { pageId: string; psid: string; watermark: string }[];
  ignored: number;
}

interface Referral { source?: string; type?: string; ref?: string; ad_id?: string; ads_context_data?: { ad_title?: string; post_id?: string } }
interface Attachment { type?: string; title?: string; payload?: { url?: string; sticker_id?: number; coordinates?: { lat?: number; long?: number } } }
interface Event {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Attachment[]; quick_reply?: { payload?: string }; referral?: Referral };
  postback?: { mid?: string; title?: string; referral?: Referral };
  referral?: Referral;
  delivery?: { mids?: string[] };
  read?: { watermark?: number };
}

const iso = (ms: number | undefined) => (Number.isFinite(ms) && ms! > 0 ? new Date(ms!).toISOString() : new Date().toISOString());

function adOf(r: Referral | undefined): MsgInbound["ad"] {
  if (!r || (!r.ad_id && r.source !== "ADS")) return null;
  return { sourceId: r.ad_id ?? null, headline: r.ads_context_data?.ad_title ?? null, sourceUrl: null };
}

function kindOf(a: Attachment | undefined): MsgKind {
  switch (a?.type) {
    case "image": return a.payload?.sticker_id ? "sticker" : "image";
    case "video": return "video";
    case "audio": return "audio";
    case "file": return "document";
    case "location": return "location";
    default: return a ? "other" : "text";
  }
}

/** Meta's delivery → flat rows. Tolerates anything unexpected; never throws on shape. */
export function parseMessengerDelivery(body: unknown): MsgDelivery {
  const out: MsgDelivery = { messages: [], delivered: [], reads: [], ignored: 0 };
  const b = body as { object?: string; entry?: { id?: string; messaging?: Event[] }[] } | null;
  if (b?.object !== "page" || !Array.isArray(b.entry)) { out.ignored++; return out; }
  for (const entry of b.entry) {
    const pageId = entry?.id;
    if (!pageId || !Array.isArray(entry.messaging)) { out.ignored++; continue; }
    for (const e of entry.messaging) {
      const psid = e?.sender?.id;
      if (e?.delivery?.mids) { for (const mid of e.delivery.mids) if (mid) out.delivered.push({ externalId: mid }); continue; }
      if (e?.read?.watermark && psid) { out.reads.push({ pageId, psid, watermark: iso(e.read.watermark) }); continue; }
      if (!psid || psid === pageId) { out.ignored++; continue; }
      if (e.message) {
        if (e.message.is_echo || !e.message.mid) { out.ignored++; continue; }
        const first = e.message.attachments?.[0];
        const body = e.message.text ?? first?.title
          ?? (first?.payload?.coordinates ? `${first.payload.coordinates.lat},${first.payload.coordinates.long}` : null);
        out.messages.push({
          externalId: e.message.mid, pageId, psid, name: null, kind: e.message.text ? "text" : kindOf(first), body: body ?? null,
          sentAt: iso(e.timestamp), ad: adOf(e.message.referral ?? e.referral),
        });
        continue;
      }
      if (e.postback?.mid || e.postback?.title) {
        out.messages.push({
          externalId: e.postback.mid ?? `postback.${psid}.${e.timestamp}`, pageId, psid, name: null, kind: "button",
          body: e.postback.title ?? null, sentAt: iso(e.timestamp), ad: adOf(e.postback.referral ?? e.referral),
        });
        continue;
      }
      out.ignored++; // a referral on its own (no message yet), an opt-in, a reaction…
    }
  }
  return out;
}
