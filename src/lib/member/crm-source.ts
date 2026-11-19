/**
 * Where an enquiry came from (the owner, 2026-10-27: "能不能分开清楚看到哪些咨询的来源，分为DC (WA, Messager) & the conts
 * (WA, Msg)"): the brand — DC (Dream Crafter Design) or The Conts — by the WhatsApp number or Facebook Page the customer
 * wrote to (crm_contacts.account_id: WhatsApp's phone number id, Messenger's Page id), and the channel. An ad with no lead
 * yet is placed by its Page (crm_ad_names.page_id). A number or Page not listed here has no brand ("Other").
 */
import type { CrmChannel } from "./crm-data";

export type SourceBrand = "conts" | "dc";
export type SourceKey = `${SourceBrand}:${CrmChannel}`;
export type SourcePick = "all" | SourceBrand | SourceKey;

/** The CRM's numbers and Pages, by brand (checked on production 2026-10-27). */
const ACCOUNTS: Record<string, SourceBrand> = {
  "1438056256053876": "conts", // WhatsApp 018-358 0219 — "The Cont"
  "102351059576534": "conts", // Page: The Conts Property Management
  "1422533724269131": "dc", // WhatsApp 018-907 9042 — "Dream Crafter Design"
  "478652958664343": "dc", // Page: Dream Crafter Design
};

export const BRAND_LABEL: Record<SourceBrand, string> = { conts: "The Conts", dc: "Dream Crafter" };
/** Each brand's WhatsApp number (its phone number id) — where an Instant Form lead from its Page is reached (2026-10-30). */
export const BRAND_WHATSAPP: Record<SourceBrand, string> = { conts: "1438056256053876", dc: "1422533724269131" };
const CH_LABEL: Record<CrmChannel, string> = { whatsapp: "WhatsApp", messenger: "Messenger" };

export const brandOf = (accountId: string | null | undefined): SourceBrand | null => (accountId ? ACCOUNTS[accountId] ?? null : null);

/** A customer's source: its brand, key and words ("The Conts · WhatsApp"; "WhatsApp" alone when the brand is not known). */
export function sourceOf(c: { channel: CrmChannel; accountId?: string | null }) {
  const brand = brandOf(c.accountId);
  return { brand, key: brand ? (`${brand}:${c.channel}` as SourceKey) : null, label: brand ? `${BRAND_LABEL[brand]} · ${CH_LABEL[c.channel]}` : CH_LABEL[c.channel], brandLabel: brand ? BRAND_LABEL[brand] : "" };
}

/** The picks a source filter offers, in this order. */
export const SOURCE_PICKS: { v: SourcePick; label: string; sub: boolean }[] = [
  { v: "all", label: "All sources", sub: false },
  { v: "conts", label: "The Conts", sub: false },
  { v: "conts:whatsapp", label: "The Conts · WhatsApp", sub: true },
  { v: "conts:messenger", label: "The Conts · Messenger", sub: true },
  { v: "dc", label: "Dream Crafter", sub: false },
  { v: "dc:whatsapp", label: "Dream Crafter · WhatsApp", sub: true },
  { v: "dc:messenger", label: "Dream Crafter · Messenger", sub: true },
];
export const SOURCE_KEYS: SourceKey[] = ["conts:whatsapp", "conts:messenger", "dc:whatsapp", "dc:messenger"];
export const sourceLabel = (pick: SourcePick) => SOURCE_PICKS.find(p => p.v === pick)?.label ?? "All sources";

/** Whether a customer is in the pick. */
export function inSource(c: { channel: CrmChannel; accountId?: string | null }, pick: SourcePick | null | undefined): boolean {
  if (!pick || pick === "all") return true;
  const s = sourceOf(c);
  return pick.includes(":") ? s.key === pick : s.brand === pick;
}

/** Whether an ad with no lead yet is in the pick, by its Page (its channel is not known before a lead). */
export function adPageInSource(pageId: string | null | undefined, pick: SourcePick | null | undefined): boolean {
  if (!pick || pick === "all") return true;
  const b = brandOf(pageId);
  return !!b && pick.split(":")[0] === b;
}

/** An ad's brand: its leads' number or Page (the most of them), else the Page Meta named for it; none known, null. */
export function adBrandOf(adId: string, data: { customers: { adId?: string | null; channel: CrmChannel; accountId?: string | null }[]; adNames?: Record<string, { pageId?: string | null }> }): SourceBrand | null {
  let conts = 0, dc = 0;
  for (const c of data.customers) if (c.adId === adId) { const b = brandOf(c.accountId); if (b === "conts") conts++; else if (b === "dc") dc++; }
  if (conts || dc) return dc > conts ? "dc" : "conts";
  return brandOf(data.adNames?.[adId]?.pageId);
}

/**
 * Assignment's ads split IR | DC (the owner, 2026-11-19: "assignment 广告的部分，要可以拆分 dc & ir", shown apart only — the
 * dealer is unchanged). IR is The Conts' ads (and an ad whose brand is not known); DC Dream Crafter's. Opens on IR; the
 * tabs show only while there are ads of both.
 */
export type AdBrandPick = "ir" | "dc";
export function brandSplit(ids: string[], brandOfAd: (id: string) => SourceBrand | null, pick: AdBrandPick | null | undefined) {
  const side = (id: string): AdBrandPick => (brandOfAd(id) === "dc" ? "dc" : "ir");
  const n = { ir: ids.filter(id => side(id) === "ir").length, dc: ids.filter(id => side(id) === "dc").length };
  const both = n.ir > 0 && n.dc > 0;
  const on: AdBrandPick | null = both ? (pick === "dc" ? "dc" : "ir") : null;
  return {
    on,
    tabs: both ? (["ir", "dc"] as const).map(k => ({ key: k, label: k === "ir" ? "IR" : "DC", n: n[k], on: on === k })) : [],
    keep: (id: string) => !on || side(id) === on,
  };
}

/**
 * The brand a Revenue app view opens the CRM on (2026-11-17 — the owner: "Dream Crafter view 默认打开 dream crafter 的数据，
 * 聊天室等"): the Dream Crafter sub-department (code DC) holds the CRM to Dream Crafter's customers; every other view, every brand.
 */
export function crmBrandOfView(subCode: string | null | undefined, viewCodes: (string | null | undefined)[] = []): SourceBrand | null {
  const code = (subCode ?? "").trim().toUpperCase(), codes = viewCodes.map(c => (c ?? "").trim().toUpperCase());
  if (code === "DC") return "dc";
  // The IR view holds the CRM to IR's (The Conts') — customers, ads, the calendar (2026-11-19, the owner: "IR 只能看到 IR 的数据，
  // 包含广告，calendar 等") — for whoever can switch to the DC view for DC's; somebody with no DC view keeps every brand they hold
  // (else a DC customer of theirs would be out of sight everywhere).
  if (code === "IR" && codes.includes("DC")) return "conts";
  return null;
}
