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
  /** A photo, video, voice message or file: Meta's address for it (its own CDN, https only), shown through our route. */
  mediaUrl?: string | null;
  /** A file's own name, read off Meta's address (2026-10-27) — kept beside the message (crm_document_names). */
  fileName?: string | null;
  /** Meta's id of the message this one quotes (a reply to one message, 2026-10-27) — Lead View keeps it. */
  replyToMid?: string | null;
  sentAt: string;        // ISO
  /** media: "video" or "image" from the ad's context; sourceUrl: its post on Facebook (2026-10-15). */
  ad: { sourceId: string | null; headline: string | null; sourceUrl: string | null; media: string | null } | null;
}

/** Meta's own file hosts only (the ingest asks the same). */
export const metaMediaUrl = (u: string | undefined | null): string | null =>
  !!u && /^https:\/\/[A-Za-z0-9.-]+\.(fbcdn\.net|fbsbx\.com|facebook\.com)\//.test(u) ? u : null;

/**
 * A lead form ad's answers (2026-10-30, the owner: "客户一定要填了一些资讯才能pm给我们 … 2种都做"):
 *   messenger — Meta's Leadgen app asked inside Messenger, then handed the chat back: a referral LEAD_COMPLETE /
 *               LEAD_INCOMPLETE with `lead.data`, or (for an app not listening to referrals) the "Lead summary:" message
 *               marked hop_context messenger_lead_gen_*; both may come — the ingest says the answers once;
 *   instant   — an Instant Form on Facebook: Meta sends only its id (`changes` field `leadgen`); the route reads it.
 */
export interface MsgLead {
  pageId: string;
  psid: string;
  name: string | null;
  sentAt: string;
  ad: MsgInbound["ad"];
  complete: boolean;
  answers: { q: string; a: string }[];
}
export interface InstantLeadRef { pageId: string; leadId: string; formId: string | null; adId: string | null; createdAt: string }

export interface MsgDelivery {
  /** Lead form answers from Messenger lead ads, and Instant Form leads to read (both only when present). */
  leads?: MsgLead[];
  instant?: InstantLeadRef[];
  messages: MsgInbound[];
  /** Our messages that reached the customer. */
  delivered: { externalId: string }[];
  /** The customer read everything we sent them up to watermark. */
  reads: { pageId: string; psid: string; watermark: string }[];
  ignored: number;
}

export interface Referral { source?: string; type?: string; ref?: string; ad_id?: string; ads_context_data?: { ad_title?: string; post_id?: string; photo_url?: string; video_url?: string } }
interface Attachment { type?: string; title?: string; payload?: { url?: string; sticker_id?: number; coordinates?: { lat?: number; long?: number } } }
interface Event {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Attachment[]; quick_reply?: { payload?: string }; referral?: Referral; reply_to?: { mid?: string } };
  postback?: { mid?: string; title?: string; referral?: Referral };
  referral?: Referral;
  delivery?: { mids?: string[] };
  read?: { watermark?: number };
  lead?: { data?: { question?: string; answer?: string }[] };
  hop_context?: { metadata?: string };
  pass_thread_control?: { metadata?: string };
}

/** "Lead summary:\nQuestion: answer\n…" → the answers (the summary message Meta mocks as the customer's). */
export function summaryAnswers(text: string): { q: string; a: string }[] {
  return text.split("\n").slice(1).map(l => { const i = l.lastIndexOf(": "); return i > 0 ? { q: l.slice(0, i).trim(), a: l.slice(i + 2).trim() } : null; })
    .filter((x): x is { q: string; a: string } => !!x && !!x.q);
}
const leadTs = (t: unknown) => { const n = Number(t); return Number.isFinite(n) && n > 0 ? new Date(n < 1e12 ? n * 1000 : n).toISOString() : new Date().toISOString(); };

const iso = (ms: number | undefined) => (Number.isFinite(ms) && ms! > 0 ? new Date(ms!).toISOString() : new Date().toISOString());

export function adOf(r: Referral | undefined): MsgInbound["ad"] {
  if (!r || (!r.ad_id && r.source !== "ADS")) return null;
  const x = r.ads_context_data;
  return { sourceId: r.ad_id ?? null, headline: x?.ad_title ?? null,
    sourceUrl: x?.post_id && /^\d+_\d+$/.test(x.post_id) ? `https://www.facebook.com/${x.post_id}` : null,
    media: x?.video_url ? "video" : x?.photo_url ? "image" : null };
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

/** A file's name from Meta's address — its path's last part ("…/SA-GRR.docx?_nc_cat=…" → "SA-GRR.docx"). */
export function fileNameOf(url: string | null | undefined): string | null {
  const last = (url ?? "").split(/[?#]/)[0].split("/").pop() ?? "";
  let name = last;
  try { name = decodeURIComponent(last); } catch { /* keep it as it came */ }
  name = name.trim();
  return /\.[A-Za-z0-9]{1,8}$/.test(name) ? name.slice(0, 240) : null;
}

/** Meta's delivery → flat rows. Tolerates anything unexpected; never throws on shape. */
export function parseMessengerDelivery(body: unknown): MsgDelivery {
  const out: MsgDelivery = { messages: [], delivered: [], reads: [], ignored: 0 };
  const b = body as { object?: string; entry?: { id?: string | number; messaging?: Event[]; changes?: { field?: string; value?: Record<string, unknown> }[] }[] } | null;
  if (b?.object !== "page" || !Array.isArray(b.entry)) { out.ignored++; return out; }
  for (const entry of b.entry) {
    const pageId = entry?.id != null ? String(entry.id) : "";
    // An Instant Form lead: only its id comes; the route reads the answers (2026-10-30).
    if (pageId && Array.isArray(entry.changes)) {
      for (const c of entry.changes) {
        const v = c?.value;
        if (c?.field === "leadgen" && v?.leadgen_id != null) {
          (out.instant ??= []).push({ pageId: String(v.page_id ?? pageId), leadId: String(v.leadgen_id), formId: v.form_id != null ? String(v.form_id) : null,
            adId: v.ad_id != null ? String(v.ad_id) : null, createdAt: leadTs(v.created_time) });
        } else out.ignored++;
      }
      if (!Array.isArray(entry.messaging)) continue;
    }
    if (!pageId || !Array.isArray(entry.messaging)) { out.ignored++; continue; }
    for (const e of entry.messaging) {
      const psid = e?.sender?.id;
      if (e?.delivery?.mids) { for (const mid of e.delivery.mids) if (mid) out.delivered.push({ externalId: mid }); continue; }
      if (e?.read?.watermark && psid) { out.reads.push({ pageId, psid, watermark: iso(e.read.watermark) }); continue; }
      if (!psid || psid === pageId) { out.ignored++; continue; }
      // A Messenger lead ad's answers: the referral with lead.data (LEAD_COMPLETE / LEAD_INCOMPLETE)…
      const ref = e.referral;
      if (e.lead?.data || ref?.type === "LEAD_COMPLETE" || ref?.type === "LEAD_INCOMPLETE") {
        (out.leads ??= []).push({ pageId, psid, name: null, sentAt: iso(e.timestamp), ad: adOf(ref), complete: ref?.type !== "LEAD_INCOMPLETE",
          answers: (e.lead?.data ?? []).filter(x => x?.question).map(x => ({ q: String(x.question), a: String(x.answer ?? "") })) });
        continue;
      }
      // …or the summary Meta mocks as the customer's message (not shown in the thread to either side).
      const hop = e.hop_context?.metadata ?? "";
      if (e.message && hop.startsWith("messenger_lead_gen")) {
        (out.leads ??= []).push({ pageId, psid, name: null, sentAt: iso(e.timestamp), ad: null, complete: hop !== "messenger_lead_gen_incomplete",
          answers: summaryAnswers(e.message.text ?? "") });
        continue;
      }
      if (e.message) {
        if (e.message.is_echo || !e.message.mid) { out.ignored++; continue; }
        const first = e.message.attachments?.[0];
        const body = e.message.text ?? first?.title
          ?? (first?.payload?.coordinates ? `${first.payload.coordinates.lat},${first.payload.coordinates.long}` : null);
        out.messages.push({
          externalId: e.message.mid, pageId, psid, name: null, kind: e.message.text ? "text" : kindOf(first), body: body ?? null,
          ...(["image", "video", "audio", "file"].includes(first?.type ?? "") && metaMediaUrl(first?.payload?.url) ? { mediaUrl: metaMediaUrl(first?.payload?.url) } : {}),
          ...(first?.type === "file" && fileNameOf(first?.payload?.url) ? { fileName: fileNameOf(first?.payload?.url) } : {}),
          ...(e.message.reply_to?.mid ? { replyToMid: e.message.reply_to.mid } : {}),
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
