/**
 * Lead form ads into the CRM (2026-10-30, the owner: "接下来的广告是设定成客户一定要填了一些资讯才能pm给我们 … 2种都做").
 * The webhook parses both kinds (lib/messenger/webhook.ts); this turns them into the rows `crm_ingest_lead` takes:
 *   - a Messenger lead ad's answers as they came;
 *   - an Instant Form lead read from the Graph API (`GET /{lead-id}` with the Page's token — the token needs
 *     `leads_retrieval`; refused, the lead is logged as unreadable, never dropped silently), its phone and name picked
 *     out of the answers, and the WhatsApp number of the Page's brand to reach them on (crm-source ACCOUNTS).
 */
import { GRAPH_VERSION } from "@/lib/whatsapp/send";
import { BRAND_WHATSAPP, brandOf } from "@/lib/member/crm-source";
import type { InstantLeadRef, MsgLead } from "./webhook";

export type LeadRow =
  | { kind: "messenger"; pageId: string; psid: string; name: string | null; at: string; ad: MsgLead["ad"]; complete: boolean; answers: { q: string; a: string }[] }
  | { kind: "instant"; pageId: string; leadId: string; formId: string | null; at: string; name: string | null; phone: string | null; waAccount: string | null;
      ad: { sourceId: string | null; headline: string | null } | null; complete: true; answers: { q: string; a: string }[] }
  | { kind: "instant"; pageId: string; leadId: string; error: string };

export const messengerLeadRow = (l: MsgLead): LeadRow => ({ kind: "messenger", pageId: l.pageId, psid: l.psid, name: l.name, at: l.sentAt, ad: l.ad, complete: l.complete, answers: l.answers });

/** "full_name" → "Full name"; Meta's own field names read as words. */
const words = (name: string) => { const s = name.replace(/[_-]+/g, " ").trim(); return s ? s[0].toUpperCase() + s.slice(1) : name; };
// A form's phone question may be its whole sentence ("sounds_good,_{{user_first_name}}._what_is_the_best_phone_number…").
const PHONE = /phone|mobile|whatsapp|contact_number|电话|手机/i;
const NAME = /^(full_name|name|姓名)$/i;
const FIRST = /^first_name$/i, LAST = /^last_name$/i;

/** An Instant Form lead's answers (Meta's field_data) → the row: its questions and answers, phone, name. */
export function instantLeadRow(ref: InstantLeadRef, lead: { field_data?: { name?: string; values?: unknown[] }[]; ad_id?: string; form_id?: string; created_time?: string }): LeadRow {
  const fields = (lead.field_data ?? []).filter(f => f?.name).map(f => ({ key: String(f.name), value: (f.values ?? []).map(v => String(v)).join(", ").trim() }));
  // A Messenger lead ad's lead is in Leads Center too (its form carries inbox_url): its chat brings it (the referral or
  // the summary), so it is not made a second customer on WhatsApp (found 2026-10-30 on The Conts' only form).
  if (fields.some(f => f.key === "inbox_url")) return { kind: "instant", pageId: ref.pageId, leadId: ref.leadId, error: "from a Messenger lead ad — taken by its chat" };
  const pick = (re: RegExp) => fields.find(f => re.test(f.key) && f.value)?.value ?? null;
  const name = pick(NAME) ?? ([pick(FIRST), pick(LAST)].filter(Boolean).join(" ") || null);
  const brand = brandOf(ref.pageId);
  const adId = lead.ad_id ?? ref.adId;
  return { kind: "instant", pageId: ref.pageId, leadId: ref.leadId, formId: lead.form_id ?? ref.formId, at: lead.created_time ? new Date(lead.created_time).toISOString() : ref.createdAt,
    name, phone: pick(PHONE), waAccount: brand ? BRAND_WHATSAPP[brand] : null, ad: adId ? { sourceId: adId, headline: null } : null, complete: true,
    answers: fields.map(f => ({ q: words(f.key), a: f.value })) };
}

/** Reads an Instant Form lead from Meta; Meta's refusal (no leads_retrieval, expired token) comes back as words. */
export async function readInstantLead(ref: InstantLeadRef, pageToken: string | null, fetchImpl: typeof fetch = fetch): Promise<LeadRow> {
  if (!pageToken) return { kind: "instant", pageId: ref.pageId, leadId: ref.leadId, error: "no Page token" };
  if (!/^\d{5,40}$/.test(ref.leadId)) return { kind: "instant", pageId: ref.pageId, leadId: ref.leadId, error: "not a lead id" };
  try {
    const r = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${ref.leadId}?fields=created_time,ad_id,form_id,field_data`,
      { headers: { Authorization: `Bearer ${pageToken}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    const j = (await r.json().catch(() => null)) as ({ error?: { message?: string } } & Parameters<typeof instantLeadRow>[1]) | null;
    if (!r.ok || !j || j.error) return { kind: "instant", pageId: ref.pageId, leadId: ref.leadId, error: j?.error?.message?.slice(0, 300) ?? `Meta answered ${r.status}` };
    return instantLeadRow(ref, j);
  } catch (e) {
    return { kind: "instant", pageId: ref.pageId, leadId: ref.leadId, error: e instanceof Error ? e.message.slice(0, 300) : "unreachable" };
  }
}
