/**
 * Workspace's reports (the owner, 2026-10-27: "我每个星期都会跟老板个rd汇报本周的广告表现 … workspace 可以放在左边report的下方（独立）"):
 * the arithmetic behind a Weekly / Monthly report — its period and the one before, the CRM's own figures, who the leads
 * went to, which properties were asked about, and what customers asked most. No AI (the owner: "不要做AI的选择"): the
 * questions are counted by keywords, a customer once a topic. The screen is DeskWorkspace.tsx.
 */
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { inSource, type SourcePick } from "@/lib/member/crm-source";

const DAY = 86_400_000;
export type Range = { a: number; b: number };
export type ReportPeriod = "week" | "lastweek" | "month" | "lastmonth" | "custom";
export type ReportSection = "totals" | "byAd" | "shots" | "reps" | "props" | "questions";

export interface WorkspaceReport {
  id: string;
  name: string;
  period: ReportPeriod;
  /** A custom period's first and last day, "YYYY-MM-DD" (the owner, 2026-10-27: "让我custome 日期"). */
  from?: string; to?: string;
  src: SourcePick;
  metrics: string[];
  sections: ReportSection[];
}

export const SECTIONS: [ReportSection, string][] = [
  ["totals", "Totals vs the period before"], ["byAd", "Each ad's figures"], ["shots", "Each ad's picture"],
  ["reps", "Who the leads went to"], ["props", "Properties asked about"], ["questions", "What customers asked most"],
];
export const PERIODS: [ReportPeriod, string][] = [["week", "This week"], ["lastweek", "Last week"], ["month", "This month"], ["lastmonth", "Last month"], ["custom", "Custom"]];
/**
 * Every metric a report can work out (2026-10-27, the owner: "我要可以加指标得功能"): Meta's that the server reads
 * (metaFigures) and the CRM's own — the rest of Ads Performance's list (engagement, video) Meta's figures do not carry.
 */
export const REPORT_METRICS = ["spend", "dbudget", "impr", "reach", "results", "cpr", "freq", "cpm", "cpp", "msgconv", "cpmsg", "clicks", "cpc", "ctr", "allclk", "ctrall", "cpcall",
  "leads", "cpl", "appt", "apptrate", "cpappt", "showup", "showrate", "won", "winrate", "cpwon"];
const DEF_METRICS = ["spend", "leads", "cpl", "appt", "apptrate", "showup", "showrate"];
const ALL_SECTIONS = SECTIONS.map(s => s[0]);

export const DEFAULT_REPORTS: WorkspaceReport[] = [
  { id: "weekly", name: "Weekly report", period: "week", src: "all", metrics: DEF_METRICS, sections: ALL_SECTIONS },
  { id: "monthly", name: "Monthly report", period: "month", src: "all", metrics: DEF_METRICS, sections: ALL_SECTIONS },
];

const day0 = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** The period (Monday to Sunday; the 1st to the month's end — up to today while it runs) and the same length before it. */
export function periodRanges(p: ReportPeriod, now: Date, custom?: { from?: string; to?: string }): { cur: Range; prev: Range } {
  const today = day0(now.getTime());
  if (p === "custom") {
    // Custom: the days picked (either way round), against as many days just before them.
    const at = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`).getTime() : NaN);
    let a = at(custom?.from), b = at(custom?.to);
    if (Number.isNaN(a)) a = Number.isNaN(b) ? today - 6 * DAY : b;
    if (Number.isNaN(b)) b = a;
    if (a > b) [a, b] = [b, a];
    const n = Math.round((b - a) / DAY) + 1;
    return { cur: { a, b }, prev: { a: day0(a - n * DAY + DAY / 2), b: day0(a - DAY + DAY / 2) } };
  }
  if (p === "week" || p === "lastweek") {
    const mon = today - ((new Date(today).getDay() + 6) % 7) * DAY;
    const a = p === "week" ? mon : mon - 7 * DAY, b = p === "week" ? today : mon - DAY;
    const n = Math.round((b - a) / DAY) + 1;
    return { cur: { a, b }, prev: { a: a - 7 * DAY, b: a - 7 * DAY + (n - 1) * DAY } };
  }
  const d = new Date(today), y = d.getFullYear(), m = d.getMonth() - (p === "lastmonth" ? 1 : 0);
  const a = new Date(y, m, 1).getTime(), end = new Date(y, m + 1, 0).getTime(), b = p === "month" ? today : end;
  const n = Math.round((b - a) / DAY) + 1, pa = new Date(y, m - 1, 1).getTime(), pend = new Date(y, m, 0).getTime();
  return { cur: { a, b }, prev: { a: pa, b: Math.min(pend, pa + (n - 1) * DAY) } };
}

export const inRange = (iso: string | null | undefined, r: Range) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= r.a && t < r.b + DAY; };

/** The CRM's own figures for some customers over a range — a customer counted once for appointments (2026-10-27 rule). */
export function crmFigures(cs: CrmCustomer[], visits: CrmVisit[], r: Range): Record<string, number | null> {
  const leads = cs.filter(c => inRange(c.createdAt, r)), ids = new Set(leads.map(c => c.id));
  const vs = visits.filter(v => ids.has(v.customerId) && v.state !== "cancelled");
  const appt = new Set(vs.map(v => v.customerId)).size, showup = new Set(vs.filter(v => v.state === "attended").map(v => v.customerId)).size;
  const won = leads.filter(c => c.status === "won").length;
  return { leads: leads.length, appt, showup, won, apptrate: leads.length ? (appt / leads.length) * 100 : null,
    showrate: appt ? (showup / appt) * 100 : null, winrate: leads.length ? (won / leads.length) * 100 : null };
}

/** The leads of a report: its period, its source. */
export const reportLeads = (cs: CrmCustomer[], r: Range, src: SourcePick) => cs.filter(c => inRange(c.createdAt, r) && inSource(c, src));

/** Who the leads went to ("回复的人 = 分配给哪个业务"): each person's leads, appointments and show-ups, most leads first. */
export function leadsByRep(leads: CrmCustomer[], visits: CrmVisit[], nameOf: (id: string | null | undefined) => string) {
  const m = new Map<string, CrmCustomer[]>();
  for (const c of leads) { const k = c.assignedTo ? nameOf(c.assignedTo) : "No one yet"; m.set(k, [...(m.get(k) ?? []), c]); }
  return [...m].map(([name, cs]) => {
    const ids = new Set(cs.map(c => c.id)), vs = visits.filter(v => ids.has(v.customerId) && v.state !== "cancelled");
    return { name, leads: cs.length, appt: new Set(vs.map(v => v.customerId)).size, showup: new Set(vs.filter(v => v.state === "attended").map(v => v.customerId)).size };
  }).sort((x, y) => y.leads - x.leads || x.name.localeCompare(y.name));
}

/** Each ad's leads by person ("Hector 3 · Luis 2"). */
export function repsOfAd(leads: CrmCustomer[], nameOf: (id: string | null | undefined) => string): string {
  const m = new Map<string, number>();
  for (const c of leads) { const k = c.assignedTo ? nameOf(c.assignedTo) : "No one yet"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].sort((x, y) => y[1] - x[1]).map(([n, k]) => `${n} ${k}`).join(" · ");
}

/**
 * The property an ad promotes, read off its name: the last "( … )" ("… (Skyline Embassy)"), else what follows its tag
 * ("【介绍型短视频】Astrum Ampang") when that is a short place name; null when the name says none.
 */
export function propertyOfAd(name: string | null | undefined): string | null {
  const s = (name ?? "").trim();
  const paren = [...s.matchAll(/[(（]([^()（）]{2,40})[)）]/g)].pop()?.[1]?.trim();
  if (paren) return paren;
  const after = s.split(/[\]】]/).pop()?.trim() ?? "";
  return after && after !== s && after.length <= 30 && !/[㐀-鿿]/.test(after) ? after : null;
}

/**
 * Properties asked about: the Location filled on the customer (Customer info), else the property in their ad's name —
 * counted as written, case and spaces aside, a shorter name joined to the longer one it starts ("Astrum" → "Astrum Ampang").
 */
export function propertyRanking(leads: CrmCustomer[]) {
  const m = new Map<string, { label: string; n: number; fromAd: number }>();
  let none = 0;
  for (const c of leads) {
    const loc = (c.details?.loc ?? "").trim().replace(/\s+/g, " "), ad = loc ? null : propertyOfAd(c.ad);
    const raw = loc || ad;
    if (!raw) { none++; continue; }
    const k = raw.toLowerCase(), cur = m.get(k);
    m.set(k, { label: cur?.label ?? raw, n: (cur?.n ?? 0) + 1, fromAd: (cur?.fromAd ?? 0) + (ad ? 1 : 0) });
  }
  for (const k of [...m.keys()].sort((a, b) => a.length - b.length)) {
    const into = [...m.keys()].find(o => o !== k && o.startsWith(`${k} `));
    if (into) { const a = m.get(k)!, b = m.get(into)!; m.set(into, { label: b.label, n: b.n + a.n, fromAd: b.fromAd + a.fromAd }); m.delete(k); }
  }
  return { rows: [...m.values()].sort((x, y) => y.n - x.n || x.label.localeCompare(y.label)), notFilled: none };
}

/** What customers ask, by keywords (Chinese, English, Malay) — a customer once a topic, however often they asked. */
export const QUESTION_TOPICS: [string, RegExp][] = [
  ["Price / quotation", /价格|價格|报价|報價|多少钱|多少錢|几钱|幾錢|费用|費用|预算|預算|price|quot|budget|how much|cost|harga|berapa/i],
  ["Design fee", /设计费|設計費|design fee|设计费用|設計費用/i],
  ["Rental / returns", /出租|租金|回报|回報|租客|airbnb|homestay|rental|rent\b|roi|yield|sewa/i],
  ["How long it takes", /多久|几时|幾時|什么时候|什麼時候|工期|完工|how long|when can|duration|timeline|berapa lama/i],
  ["Visit / appointment", /看房|预约|預約|见面|見面|展厅|展廳|showroom|appointment|site visit|visit|meet/i],
  ["Location / which unit", /地址|在哪里|在哪裡|在哪边|哪里|哪裡|location|address|where is|which unit|lokasi/i],
  ["Payment / instalments", /付款|分期|订金|訂金|定金|payment|instal|deposit|bayar/i],
  ["Furniture / full package", /家具|全屋|配套|furniture|package|fully furnished|perabot/i],
  ["Management", /管理|代管|托管|management|manage/i],
  ["Renovation scope", /装修|裝修|翻新|renovat|reno\b|kitchen|厨房|廚房|wardrobe|衣柜|衣櫃/i],
];

export function questionTopics(leads: CrmCustomer[], r: Range) {
  const rows = QUESTION_TOPICS.map(([label, re]) => {
    let n = 0, example = "";
    for (const c of leads) {
      const hit = (c.messages ?? []).find(m => m.from === "lead" && inRange(m.at, r) && re.test(m.text ?? ""));
      if (hit) { n++; if (!example) example = (hit.text ?? "").replace(/\s+/g, " ").slice(0, 90); }
    }
    return { label, n, example, share: leads.length ? n / leads.length : 0 };
  });
  return rows.filter(x => x.n > 0).sort((x, y) => y.n - x.n);
}

/** The change from the period before: "+12%", "−5%", "New", "±0"; good = moving the right way (a cost going down). */
export function changeOf(k: string, a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null;
  const lower = /^(cpl|cpappt|cpwon|cpmsg|cpc|cpm|cpr|cpp|cpcall|spend)$/.test(k);
  if (b === 0) return a === 0 ? { t: "±0", good: true } : { t: "New", good: !lower };
  const d = ((a - b) / Math.abs(b)) * 100;
  return { t: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(Math.round(d))}%`, good: lower ? d <= 0 : d >= 0 };
}

/** Kept per browser (Workspace's reports are one's own — a private window keeps the two defaults). */
const KEY = "crm.workspace.reports.v1";
export function loadReports(): WorkspaceReport[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null") as WorkspaceReport[] | null; if (Array.isArray(v) && v.length) return v; } catch { /* storage refused */ }
  return DEFAULT_REPORTS;
}
export function saveReports(list: WorkspaceReport[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage refused */ } }
