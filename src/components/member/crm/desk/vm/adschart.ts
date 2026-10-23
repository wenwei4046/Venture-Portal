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

export type ChartFmt = "rm" | "n" | "pct";
export const CHART_METRICS: [string, string, ChartFmt][] = [
  ["spend", "Amount spent", "rm"], ["leads", "Leads", "n"], ["cpl", "Cost per lead", "rm"], ["appt", "Appointments", "n"],
  ["showup", "Showed up", "n"], ["won", "Won", "n"], ["msgconv", "Conversations started", "n"], ["impr", "Impressions", "n"],
  ["clicks", "Link clicks", "n"], ["ctr", "CTR (link)", "pct"], ["cpc", "Cost per link click", "rm"], ["cpm", "CPM", "rm"],
];
export const CHART_DEF: (string | null)[] = ["spend", "leads", "cpl", "appt"];
export const CHART_MAX = 6;
/** One colour a tile's PLACE, so a line keeps its colour when another is hidden or taken off (globals.css --crm-series-*). */
export const SERIES = [1, 2, 3, 4, 5, 6].map(n => `var(--crm-series-${n})`);
const META_KEYS = new Set(["spend", "cpl", "msgconv", "impr", "clicks", "ctr", "cpc", "cpm"]);

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
  v == null ? "—" : f === "rm" ? `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : f === "pct" ? `${v.toFixed(2)}%` : Math.round(v).toLocaleString("en-MY");

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
    showup[i] += vs.filter(v => v.state === "attended").length;
    if (c.status === "won") won[i]++;
  }
  const read = meta.filter((m): m is Record<string, MetaFig> => !!m);
  const sum = (k: keyof MetaFig) => days.map(d => read.reduce((n, m) => n + (m[d]?.[k] ?? 0), 0));
  const spend = sum("spend"), impr = sum("impr"), clicks = sum("clicks"), msgconv = sum("msgconv");
  const div = (a: number[], b: number[], x = 1) => a.map((n, i) => (b[i] ? (n / b[i]) * x : null));
  const all: Record<string, (number | null)[]> = { leads, appt, showup, won, spend, impr, clicks, msgconv,
    cpl: div(spend, leads), ctr: div(clicks, impr, 100), cpc: div(spend, clicks), cpm: div(spend, impr, 1000) };
  const none = days.map(() => null);
  return Object.fromEntries(keys.map(k => [k, META_KEYS.has(k) && !read.length ? none : all[k] ?? none]));
}

/** Where each value sits from 0 (the bottom) to 1 (that line's highest day); null where there is no figure. */
export function scaled(values: (number | null)[]): (number | null)[] {
  const top = Math.max(0, ...values.filter((v): v is number => v != null));
  return values.map(v => (v == null ? null : top > 0 ? v / top : 0));
}

