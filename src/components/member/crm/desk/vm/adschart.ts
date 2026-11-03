/**
 * Ads Performance's chart (2026-10-23, the owner: "在此分页里加一个数据图（参考图3，是谷歌广告的成效显示），他可以增加更多的
 * 数据在图片中"): Google Ads' overview — a row of metric tiles, each the range's total in its own colour, and one line a
 * tile day by day. Up to six tiles; a tile's metric is picked from its menu, + adds one, × takes one off, a tap hides or
 * shows its line. The metrics differ in scale (RM, counts, %), so each line is drawn against its own highest day — one
 * plotting area, no second axis — and the figures themselves are in the tiles and the hover.
 *
 * Day by day: the CRM's own (a lead counted on the day it came in, its visit, show-up and won with it — as the table
 * counts them over a range) and Meta's (`metaAdDaily`, summed over the ads on screen).
 */
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";

export type ChartFmt = "rm" | "n" | "pct" | "x";
/** The chart picks from the table's own metrics (2026-10-23, the owner: "这个 + 要可以选择要看什么资料，他的资料跟下方的
 * + 是一样的") — Customise metrics' list, less Delivery (a word, not a figure); vm/adsperf.ts builds it from METRICS. */
export const chartFmtOf = (f: string): ChartFmt => (f === "rm" || f === "rm2" ? "rm" : f === "pct" ? "pct" : f === "x" ? "x" : "n");
export const CHART_DEF: (string | null)[] = ["spend", "leads", "cpl", "appt", "impr"];
export const CHART_MAX = 6;
/** One colour a tile's PLACE, so a line keeps its colour when another is hidden or taken off (globals.css --crm-series-*). */
export const SERIES = [1, 2, 3, 4, 5, 6].map(n => `var(--crm-series-${n})`);
/** Each place's card tint (v2 note 02: "tint background with a 3px top border in the series colour"). */
export const SERIES_TINT = [1, 2, 3, 4, 5, 6].map(n => `var(--crm-series-tint-${n})`);
/** Every metric that is Meta's, or built on Meta's spend: empty until an ad has been read. */
const META_KEYS = new Set(["spend", "impr", "reach", "results", "cpr", "freq", "cpm", "cpp", "msgconv", "cpmsg", "newmsg", "msgreply", "blocks", "clicks", "cpc", "ctr", "allclk", "ctrall", "cpcall", "outclk",
  "eng", "reacts", "comments", "shares", "saves", "follows", "cpe", "v3", "thru", "cpthru", "v25", "v50", "v75", "v100", "hook", "cpl", "cpappt", "cpwon"]);

export const isoOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayLabel = (iso: string) => `${parseInt(iso.slice(8, 10), 10)} ${MON[parseInt(iso.slice(5, 7), 10) - 1]}`;

/** Every day from a to b (local midnights), at most 400. */
export function daysOf(a: number, b: number): string[] {
  const out: string[] = [];
  for (let d = new Date(a); d.getTime() <= b && out.length < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(isoOf(d.getTime()));
  return out;
}

export const chartFmt = (v: number | null | undefined, f: ChartFmt) =>
  v == null ? "—" : f === "rm" ? `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : f === "pct" ? `${v.toFixed(2)}%` : f === "x" ? v.toFixed(2) : Math.round(v).toLocaleString("en-MY");

/**
 * Each metric's value day by day. `meta` holds one entry per ad on screen: its days (a day it did not deliver is 0), null
 * when Meta cannot show it, undefined while it is being read. Meta's metrics are null on every day until at least one ad
 * has been read.
 */
export function dailySeries(keys: string[], days: string[], cs: CrmCustomer[], visits: CrmVisit[], meta: (Record<string, MetaFig> | null | undefined)[]): Record<string, (number | null)[]> {
  const idx = new Map(days.map((d, i) => [d, i]));
  const z = () => days.map(() => 0);
  const leads = z(), appt = z(), showup = z(), won = z();
  const live = new Map<string, CrmVisit[]>();
  for (const v of visits) if (v.state !== "cancelled") live.set(v.customerId, [...(live.get(v.customerId) ?? []), v]);
  for (const c of cs) {
    const i = idx.get(isoOf(new Date(c.createdAt).getTime()));
    if (i == null) continue;
    leads[i]++;
    const vs = live.get(c.id) ?? [];
    if (vs.length) appt[i]++;
    if (vs.some(v => v.state === "attended")) showup[i]++;
    if (c.status === "won") won[i]++;
  }
  const read = meta.filter((m): m is Record<string, MetaFig> => !!m);
  const sum = (k: Exclude<keyof MetaFig, "budget">) => days.map(d => read.reduce((n, m) => n + (m[d]?.[k] ?? 0), 0));
  const spend = sum("spend"), impr = sum("impr"), reach = sum("reach"), clicks = sum("clicks"), allclk = sum("allClicks"), msgconv = sum("msgconv");
  const div = (a: number[], b: number[], x = 1) => a.map((n, i) => (b[i] ? (n / b[i]) * x : null));
  // Each metric as the table builds it over a range (vm/adsperf.ts › metaFigures / crmFigures), one day at a time; a day's
  // reach is the ads' reach that day added up. Meta's metrics the CRM does not read (engagement, video …) stay empty.
  const all: Record<string, (number | null)[]> = { leads, appt, showup, won, spend, impr, reach, clicks, allclk, msgconv, results: msgconv,
    cpl: div(spend, leads), cpappt: div(spend, appt), cpwon: div(spend, won), cpr: div(spend, msgconv), cpmsg: div(spend, msgconv),
    freq: div(impr, reach), cpm: div(spend, impr, 1000), cpp: div(spend, reach, 1000), ctr: div(clicks, impr, 100), cpc: div(spend, clicks),
    ctrall: div(allclk, impr, 100), cpcall: div(spend, allclk), apptrate: div(appt, leads, 100), showrate: div(showup, appt, 100), winrate: div(won, leads, 100) };
  const none = days.map(() => null);
  return Object.fromEntries(keys.map(k => [k, META_KEYS.has(k) && !read.length ? none : all[k] ?? none]));
}

/** Where each value sits from 0 (the bottom) to 1 (that line's highest day); null where there is no figure. */
export function scaled(values: (number | null)[]): (number | null)[] {
  const top = Math.max(0, ...values.filter((v): v is number => v != null));
  return values.map(v => (v == null ? null : top > 0 ? v / top : 0));
}

