/**
 * Channels (CRM Desktop v2, README › 7): what the CRM reads of Meta and sends back to it — the Facebook Pages
 * (details, opening hours), their Messenger profile (greeting, ice breakers, menu), the WhatsApp numbers (quality,
 * limit, the business profile, automations), the WhatsApp templates and the permissions the system user holds. Every
 * call is the Graph API with the System User token (server only — never the browser), a Page's own token asked
 * with it (lib/messenger/send.ts › pageToken). Each read fails soft: a part Meta does not give comes back null and
 * the page says "View in Meta" there. Pure request builders and parsers (tested), and the fetches beside them.
 */
import { GRAPH_VERSION } from "@/lib/whatsapp/send";

export const graph = (path: string) => `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;

export interface PageInfo { id: string; name: string; followers: number | null; about: string; phone: string; website: string; email: string; hours: Record<string, string> | null; picture: string | null }
export interface MessengerProfile { greeting: string; ice: string[]; menu: { title: string; type: string }[] }
export interface WaNumber { id: string; number: string; verifiedName: string; quality: string; limit: string; nameStatus: string }
export interface WaProfile { about: string; address: string; description: string; email: string; websites: string[]; vertical: string }
export interface WaAutomation { welcome: boolean; prompts: string[]; commands: { name: string; description: string }[] }
export interface MetaTemplate { name: string; category: string; language: string; status: string }
export interface MetaPermission { permission: string; status: string }

/** Meta's day keys for a Page's hours (mon_1_open … sun_1_close) ⇄ our Mon … Sun. */
export const HOUR_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function parsePage(j: Record<string, unknown> | null, id: string): PageInfo | null {
  if (!j || typeof j.name !== "string") return null;
  const emails = Array.isArray(j.emails) ? (j.emails as string[]) : [];
  const pic = (j.picture as { data?: { url?: string } } | undefined)?.data?.url ?? null;
  return { id, name: j.name, followers: typeof j.followers_count === "number" ? j.followers_count : null, about: String(j.about ?? ""), phone: String(j.phone ?? ""),
    website: String(j.website ?? ""), email: emails[0] ?? "", hours: j.hours && typeof j.hours === "object" ? (j.hours as Record<string, string>) : null, picture: pic };
}
export function parseMessengerProfile(j: { data?: Record<string, unknown>[] } | null): MessengerProfile | null {
  const d = j?.data?.[0];
  if (!j || !Array.isArray(j.data)) return null;
  const greet = (d?.greeting as { locale: string; text: string }[] | undefined)?.find(g => g.locale === "default")?.text ?? "";
  const ice = ((d?.ice_breakers as { call_to_actions?: { question: string }[]; question?: string }[] | undefined) ?? [])
    .flatMap(x => (x.call_to_actions ? x.call_to_actions.map(c => c.question) : x.question ? [x.question] : []));
  const menu = ((d?.persistent_menu as { locale: string; call_to_actions?: { title: string; type: string }[] }[] | undefined) ?? [])
    .find(m => m.locale === "default")?.call_to_actions?.map(c => ({ title: c.title, type: c.type === "web_url" ? "Link" : "Reply" })) ?? [];
  return { greeting: greet, ice, menu };
}
/** What we send for the Messenger profile: the greeting, up to 4 ice breakers, up to 5 menu items (replies). */
export function messengerProfileBody(p: MessengerProfile) {
  const ice = p.ice.map(q => q.trim()).filter(Boolean).slice(0, 4);
  const menu = p.menu.filter(m => m.title.trim()).slice(0, 5);
  return {
    greeting: [{ locale: "default", text: p.greeting.slice(0, 160) }],
    ice_breakers: ice.length ? [{ locale: "default", call_to_actions: ice.map((q, i) => ({ question: q.slice(0, 80), payload: `ICE_${i + 1}` })) }] : [],
    persistent_menu: menu.length ? [{ locale: "default", composer_input_disabled: false, call_to_actions: menu.map((m, i) => ({ type: "postback", title: m.title.slice(0, 30), payload: `MENU_${i + 1}` })) }] : [],
  };
}
/** A Page's opening hours for Meta: { mon_1_open: "10:00", mon_1_close: "21:00", … } from our open / from / to per day. */
export function hoursBody(days: { open: boolean; from: string; to: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  days.forEach((d, i) => { if (d.open && d.from && d.to) { out[`${HOUR_DAYS[i]}_1_open`] = d.from; out[`${HOUR_DAYS[i]}_1_close`] = d.to; } });
  return out;
}
export function parseHours(h: Record<string, string> | null): { open: boolean; from: string; to: string }[] {
  return HOUR_DAYS.map(d => ({ open: !!h?.[`${d}_1_open`], from: h?.[`${d}_1_open`] ?? "10:00", to: h?.[`${d}_1_close`] ?? "21:00" }));
}
export function parseWaNumbers(j: { data?: Record<string, unknown>[] } | null): WaNumber[] | null {
  if (!j || !Array.isArray(j.data)) return null;
  return j.data.map(n => ({ id: String(n.id), number: String(n.display_phone_number ?? ""), verifiedName: String(n.verified_name ?? ""),
    quality: String(n.quality_rating ?? ""), limit: String(n.messaging_limit_tier ?? ""), nameStatus: String(n.name_status ?? "") }));
}
export function parseWaProfile(j: { data?: Record<string, unknown>[] } | null): WaProfile | null {
  const d = j?.data?.[0];
  if (!d) return null;
  return { about: String(d.about ?? ""), address: String(d.address ?? ""), description: String(d.description ?? ""), email: String(d.email ?? ""),
    websites: Array.isArray(d.websites) ? (d.websites as string[]) : [], vertical: String(d.vertical ?? "") };
}
/** WhatsApp's business categories (the profile's `vertical`), as the profile names them. */
export const WA_VERTICALS: [string, string][] = [
  ["RETAIL", "Shopping & retail"], ["PROF_SERVICES", "Professional services"], ["EVENT_PLAN", "Event planning & service"], ["OTHER", "Other"],
];
/** Meta's tier names in words. */
export const limitWords = (t: string) => ({ TIER_50: "50 / day", TIER_250: "250 / day", TIER_1K: "1,000 / day", TIER_10K: "10,000 / day", TIER_100K: "100,000 / day", TIER_UNLIMITED: "Unlimited" } as Record<string, string>)[t] ?? (t || "—");
export const qualityWords = (q: string) => ({ GREEN: "High", YELLOW: "Medium", RED: "Low", UNKNOWN: "Not rated yet" } as Record<string, string>)[q] ?? (q || "—");
/** A template's body for Meta: {{1}}, {{2}} … each with an example. */
export function templateBody(t: { name: string; category: string; language: string; body: string }) {
  const n = [...new Set((t.body.match(/\{\{(\d+)\}\}/g) ?? []))].length;
  const LANG: Record<string, string> = { English: "en", "Bahasa Melayu": "ms", Chinese: "zh_CN" };
  return { name: t.name, category: t.category.toUpperCase(), language: LANG[t.language] ?? "en",
    components: [{ type: "BODY", text: t.body, ...(n ? { example: { body_text: [Array.from({ length: n }, (_, i) => (i === 0 ? "Aisyah" : `example ${i + 1}`))] } } : {}) }] };
}
export const LANG_WORDS: Record<string, string> = { en: "English", en_US: "English", en_GB: "English", ms: "Bahasa Melayu", zh_CN: "Chinese", zh_TW: "Chinese", zh_HK: "Chinese" };

async function getJson<T>(url: string, token: string, fetchImpl: typeof fetch): Promise<T | null> {
  try {
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json().catch(() => null)) as T | null;
  } catch { return null; }
}
/** A write to Meta: its answer in words ("Meta refused: …") when it is not a yes. */
export async function postJson(url: string, token: string, body: unknown, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const r = await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const j = (await r.json().catch(() => null)) as { error?: { message?: string; error_user_msg?: string } } & Record<string, unknown> | null;
    if (!r.ok || j?.error) return { ok: false, error: `Meta refused: ${j?.error?.error_user_msg ?? j?.error?.message ?? `error ${r.status}`}`.slice(0, 250) };
    return { ok: true, data: j ?? {} };
  } catch { return { ok: false, error: "Could not reach Meta. Please try again." }; }
}

export const readPage = (id: string, token: string, f: typeof fetch = fetch) =>
  getJson<Record<string, unknown>>(graph(`${id}?fields=name,followers_count,about,phone,website,emails,hours,picture`), token, f).then(j => parsePage(j, id));
export const readMessengerProfile = (pageToken: string, f: typeof fetch = fetch) =>
  getJson<{ data?: Record<string, unknown>[] }>(graph("me/messenger_profile?fields=greeting,ice_breakers,persistent_menu"), pageToken, f).then(parseMessengerProfile);
export const readWaNumbers = (waba: string, token: string, f: typeof fetch = fetch) =>
  getJson<{ data?: Record<string, unknown>[] }>(graph(`${waba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status`), token, f).then(parseWaNumbers);
export const readWaProfile = (pn: string, token: string, f: typeof fetch = fetch) =>
  getJson<{ data?: Record<string, unknown>[] }>(graph(`${pn}/whatsapp_business_profile?fields=about,address,description,email,websites,vertical`), token, f).then(parseWaProfile);
export const readWaAutomation = (pn: string, token: string, f: typeof fetch = fetch) =>
  getJson<{ conversational_automation?: { enable_welcome_message?: boolean; prompts?: string[]; commands?: { command_name: string; command_description: string }[] } }>(graph(`${pn}?fields=conversational_automation`), token, f)
    .then(j => (j ? { welcome: !!j.conversational_automation?.enable_welcome_message, prompts: j.conversational_automation?.prompts ?? [], commands: (j.conversational_automation?.commands ?? []).map(c => ({ name: c.command_name, description: c.command_description })) } : null));
export const readTemplates = (waba: string, token: string, f: typeof fetch = fetch) =>
  getJson<{ data?: { name: string; category: string; language: string; status: string }[] }>(graph(`${waba}/message_templates?fields=name,category,language,status&limit=100`), token, f)
    .then(j => (j?.data ? j.data.map(t => ({ name: t.name, category: t.category, language: t.language, status: t.status })) : null));
export const readPermissions = (token: string, f: typeof fetch = fetch) =>
  getJson<{ data?: MetaPermission[] }>(graph("me/permissions"), token, f).then(j => (j?.data ? j.data : null));

/**
 * v2 frame 09b (note 07): one business profile, written to the number's WhatsApp and / or its Facebook Page.
 * WhatsApp takes about (139), description, address, email, one website and the category (vertical); a new display name
 * is a request Meta reviews (`new_display_name` on the number). The Page takes about, description, its website and email
 * — not its name, category, address (a structured location) or picture, which stay Facebook's to change.
 */
export interface BusinessProfile { name: string; about: string; description: string; address: string; email: string; website: string; vertical: string }
export const waProfileBody = (p: BusinessProfile, handle?: string | null) => ({
  messaging_product: "whatsapp", about: p.about.slice(0, 139), description: p.description.slice(0, 512), address: p.address.slice(0, 256),
  email: p.email.slice(0, 128), websites: p.website.trim() ? [p.website.trim()] : [], vertical: p.vertical || "OTHER",
  ...(handle ? { profile_picture_handle: handle } : {}),
});
export const pageProfileBody = (p: BusinessProfile) => ({
  about: p.about.slice(0, 255), description: p.description.slice(0, 1000), website: p.website.trim(), emails: p.email.trim() ? [p.email.trim()] : [],
});

/** A photo for a WhatsApp profile: Meta's Resumable Upload (the app's uploads session, then the bytes), answering its handle. */
export async function uploadWaPhoto(token: string, bytes: ArrayBuffer, mime: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: true; handle: string } | { ok: false; error: string }> {
  const dbg = await getJson<{ data?: { app_id?: string } }>(graph(`debug_token?input_token=${encodeURIComponent(token)}`), token, fetchImpl);
  const app = dbg?.data?.app_id;
  if (!app) return { ok: false, error: "Meta did not say which app the token belongs to, so the photo could not be sent." };
  const start = await postJson(graph(`${app}/uploads?file_length=${bytes.byteLength}&file_type=${encodeURIComponent(mime)}`), token, {}, fetchImpl);
  const id = start.ok ? String(start.data.id ?? "") : "";
  if (!id) return { ok: false, error: start.ok ? "Meta did not open an upload for the photo." : start.error };
  try {
    const r = await fetchImpl(graph(id), { method: "POST", headers: { Authorization: `OAuth ${token}`, file_offset: "0" }, body: bytes, cache: "no-store" });
    const j = (await r.json().catch(() => null)) as { h?: string; error?: { message?: string } } | null;
    if (!r.ok || !j?.h) return { ok: false, error: `Meta refused the photo: ${j?.error?.message ?? `error ${r.status}`}`.slice(0, 250) };
    return { ok: true, handle: j.h };
  } catch { return { ok: false, error: "Could not reach Meta with the photo. Please try again." }; }
}
