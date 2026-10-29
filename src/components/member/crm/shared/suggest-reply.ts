/**
 * Suggested replies, without AI (the owner, 2026-10-29: "系统先去看客户的回复内容，根据过往的经验和总结，draft 出一个回复讯息模板 …
 * 业务能编辑再发送"; no API): the customer's last words are matched against what customers asked before
 * (crm_reply_examples — our team's answers, the chats that reached a visit or a sale first) and against one's quick
 * replies; the closest one to three come back as drafts, the customer's first name put in. Nothing is sent: a pick only
 * fills the reply box.
 *
 * Matching is words, not meaning: Latin words, Chinese characters in pairs, and a few topics that gather the many ways
 * one thing is asked (多少钱 / 几钱 / price / RM …).
 */
import type { CrmCustomer, CrmQuickReply } from "@/lib/member/crm-data";

export interface ReplyExample { q: string; a: string; won?: boolean; appt?: boolean }
export interface Suggestion { text: string; why: string }

/** The ways one thing is asked, each gathered into a topic token. */
const TOPICS: [string, RegExp][] = [
  ["price", /多少钱|几钱|价钱|价格|价位|费用|收费|报价|预算|配套多少|price|how much|cost|budget|quotation|\brm\s?\d|\bk\b/i],
  ["rent", /出租|租金|租客|租不出|短租|长租|rent|tenant|airbnb|grr|回报|return|roi|收入|income/i],
  ["furniture", /家具|家私|家电|furnish|furniture|fully|半装/i],
  ["reno", /装修|设计|配套|setup|set up|renovat|design|package|3-in-1|一站式|全包|厨柜|cabinet/i],
  ["visit", /看房|参观|样板|展厅|showroom|visit|appointment|预约|见面|meet|过来看/i],
  ["layout", /layout|平面|户型|房型|几房|sqft|尺寸|size|unit/i],
  ["key", /钥匙|拿钥匙|key|defect|验屋/i],
  ["where", /哪里|地址|在哪|where|location|address|waze|google map/i],
  ["time", /多久|几时|什么时候|几天|时间|when|how long|duration|开工/i],
  ["hello", /^\s*(hi|hello|hai|halo|harlo|你好|您好|哈喽|在吗)\b/i],
];

/** The words of a text: Latin words, Chinese characters in pairs, and its topics (each counted thrice). */
export function wordsOf(text: string): Map<string, number> {
  const out = new Map<string, number>(), add = (w: string, n = 1) => out.set(w, (out.get(w) ?? 0) + n);
  const t = text.toLowerCase();
  for (const m of t.match(/[a-z][a-z0-9'-]{1,}/g) ?? []) add(m);
  for (const run of t.match(/[一-鿿]+/g) ?? []) {
    if (run.length === 1) add(run);
    for (let i = 0; i + 1 < run.length; i++) add(run.slice(i, i + 2));
  }
  for (const [k, re] of TOPICS) if (re.test(text)) add(`#${k}`, 3);
  return out;
}

/** How close two texts' words are, 0–1 (weighted overlap). */
export function closeness(a: Map<string, number>, b: Map<string, number>): number {
  let both = 0, all = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) { const x = a.get(k) ?? 0, y = b.get(k) ?? 0; both += Math.min(x, y); all += Math.max(x, y); }
  return all ? both / all : 0;
}

/** The customer's words waiting for us: their text messages since our last one (the last three at most). */
export function waitingWords(c: Pick<CrmCustomer, "messages">): string {
  const out: string[] = [];
  for (let i = c.messages.length - 1; i >= 0 && out.length < 3; i--) {
    const m = c.messages[i];
    if (m.from === "me") { if (m.auto) continue; break; }
    if (m.from === "lead" && m.text?.trim() && (!m.kind || m.kind === "text")) out.unshift(m.text.trim());
  }
  return out.join("\n");
}

/**
 * What the suggestions answer: the customer's waiting words, else — once we have replied — their last two text messages
 * (the owner, 2026-10-29: "为什么现在都不会有 suggested replies?" — every chat had been answered, so there was nothing to
 * answer). The floating logo still shows only while words wait (`waitingWords`); Suggest reply opens any time.
 */
export function lastCustomerWords(c: Pick<CrmCustomer, "messages">): string {
  const waiting = waitingWords(c);
  if (waiting) return waiting;
  const out: string[] = [];
  for (let i = c.messages.length - 1; i >= 0 && out.length < 2; i--) {
    const m = c.messages[i];
    if (m.from === "lead" && m.text?.trim() && (!m.kind || m.kind === "text")) out.unshift(m.text.trim());
  }
  return out.join("\n");
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const fill = (text: string, c: Pick<CrmCustomer, "name">) => text.replace(/\{name\}/g, firstName(c.name) || "there").trim();

/** Up to `n` drafts for this chat: past answers to the closest questions (a visit or a sale first), and matching quick replies. */
export function suggestReplies(c: Pick<CrmCustomer, "name" | "messages">, examples: ReplyExample[], quick: CrmQuickReply[] = [], n = 3): Suggestion[] {
  const asked = lastCustomerWords(c);
  if (!asked) return [];
  const want = wordsOf(asked);
  const scored: { text: string; why: string; score: number }[] = [];
  for (const e of examples) {
    const s = closeness(want, wordsOf(e.q));
    if (s < 0.12) continue;
    scored.push({ text: fill(e.a, c), why: e.won ? `From a chat that ended in a sale · “${e.q.slice(0, 40)}”` : e.appt ? `From a chat that booked a visit · “${e.q.slice(0, 40)}”` : `Asked before · “${e.q.slice(0, 40)}”`,
      score: s + (e.won ? 0.25 : e.appt ? 0.15 : 0) });
  }
  for (const q of quick) {
    const s = closeness(want, wordsOf(`${q.shortcut} ${q.message}`));
    if (s < 0.1) continue;
    scored.push({ text: fill(q.message, c), why: `Quick reply /${q.shortcut}`, score: s + 0.1 });
  }
  const seen = new Set<string>(), out: Suggestion[] = [];
  for (const x of scored.sort((a, b) => b.score - a.score)) {
    const key = x.text.toLowerCase().replace(/\s+/g, " ");
    if (x.text.length < 4 || seen.has(key)) continue;
    seen.add(key); out.push({ text: x.text, why: x.why });
    if (out.length >= n) break;
  }
  return out;
}
