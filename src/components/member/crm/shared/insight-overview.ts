/**
 * Insight › Overview (the owner, 2026-11-17: "我想在 insight 加 Overview，主要是整合 ads performance + team performance";
 * asked, picked every figure offered, both screens, and the brand picked at the top). One page that puts Ads
 * Performance's money beside Team performance's work, worked out here once for the desktop (desk/vm/overview.ts) and
 * the phone (shared/phone-overview.tsx) from what the CRM already reads — no new database read:
 *  - the ads: spend, the month's marketing fee on it, total cost, leads, cost per lead (Ads Performance's rule: spend
 *    with its share of the fee ÷ leads), appointments and won — overall, by brand and ad by ad;
 *  - the team: leads, average reply, appt rate, show-up and won — overall (with the period before), team by team
 *    (each opening to its people) and, per ad, which teams its leads went to.
 * Meta's spend comes from the same cache Ads Performance fills (`apMeta`, keyed "from|to"); `need` names the ranges and
 * ads still to ask for, as Ads Performance's `apNeed` does. Until they arrive the money reads "—".
 */
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";
import type { CrmCustomer, CrmData } from "@/lib/member/crm-data";
import { BRAND_LABEL, adPageInSource, brandOf, sourceOf, type SourceBrand, type SourcePick } from "@/lib/member/crm-source";
import { feeMonths, isoOf, marketingFee, noAdRepeats } from "../desk/vm/adsperf";
import { inRange, numbersOf } from "../panel/vm/common";

export interface OvRange { a: number; b: number }
/** Meta's figures by range ("YYYY-MM-DD|YYYY-MM-DD") and ad id; an ad read as nothing is `null`. */
export type OvMeta = Record<string, Record<string, MetaFig | null>> | undefined;
export interface OvTeamIn { id: string; name: string; people: { id: string; name: string }[] }

export interface OverviewIn {
  /** The CRM's data with hidden ads already left out and the brand already picked (`inBrand`). */
  data: CrmData;
  r: OvRange;
  prev: OvRange;
  now: Date;
  teams: OvTeamIn[];
  directors: { id: string; name: string }[];
  /** The Revenue Director's row's name. */
  directorTeam: string;
  /** The brand picked at the top: an ad with no lead yet is kept only when its Page is that brand's. */
  src: SourcePick | null | undefined;
  meta: OvMeta;
  /** Ads Performance's figures are CRM · Manage's (readsAds): without it the money is never asked for. */
  money: boolean;
}

export interface OvMoney { spend: number | null; fee: number | null; cost: number | null; cpl: number | null }
export interface OvAdRow extends OvMoney { id: string; name: string; brand: string; leads: number; appt: number; won: number; paid: boolean }
export interface OvBrandRow extends OvMoney { key: SourceBrand | "none"; label: string; leads: number; appt: number; won: number }
export interface OvWork { leads: number; avgReply: number | null; booked: number; apptRate: number | null; came: number; due: number; showRate: number | null; won: number }
export interface OvPersonRow extends OvWork { id: string; name: string }
export interface OvTeamRow extends OvWork { key: string; name: string; people: OvPersonRow[] }
export interface OvAdTeams { id: string; name: string; leads: number; teams: { key: string; name: string; leads: number; booked: number; won: number }[] }

export interface OverviewFigures {
  ads: OvMoney & { leads: number; appt: number; won: number; ready: boolean };
  adsPrev: OvMoney & { leads: number };
  work: OvWork;
  workPrev: OvWork;
  brands: OvBrandRow[];
  adRows: OvAdRow[];
  teams: OvTeamRow[];
  adTeams: OvAdTeams[];
  /** Meta's ranges still to read: `{ key, since, until, ids }`, as Ads Performance's apNeed. */
  need: { key: string; since: string; until: string; ids: string[] }[];
}

const DAY = 86_400_000;
export const NOBODY = "Nobody yet";
const isMetaId = (id: string) => /^[0-9]{5,32}$/.test(id);
const adKey = (c: Pick<CrmCustomer, "adId" | "channel">) => c.adId ?? `ch:${c.channel}`;
export const metaKey = (a: number, b: number) => `${isoOf(a)}|${isoOf(b)}`;

/** Avg. reply in minutes: each customer message → our next reply (auto-replies don't count), replies made in the range. */
export function avgReplyOf(customers: CrmCustomer[], r: OvRange): number | null {
  const gaps: number[] = [];
  for (const c of customers) {
    let wait: number | null = null;
    for (const m of c.messages) {
      const t = new Date(m.at).getTime();
      if (m.from === "lead" && wait == null) wait = t;
      if (m.from === "me" && !m.auto && wait != null) { if (inRange(m.at, r)) gaps.push((t - wait) / 60_000); wait = null; }
    }
  }
  return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
}

/** A group of customers' work over the range: Insight's own rules (numbersOf — a customer counted once). */
export function workOf(cs: CrmCustomer[], data: CrmData, r: OvRange, now: Date): OvWork {
  const n = numbersOf(cs, data.visits, r, now);
  return { leads: n.leads, avgReply: avgReplyOf(cs, r), booked: n.booked, apptRate: n.leads ? (n.booked / n.leads) * 100 : null,
    came: n.came, due: n.due, showRate: n.due ? (n.came / n.due) * 100 : null, won: n.won };
}

export function overviewFigures(p: OverviewIn): OverviewFigures {
  const { data, r, prev, now, meta } = p;
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const repeats = noAdRepeats(data.customers);
  const adCs = data.customers.filter(c => !repeats.has(c.id));

  // Every ad: those that brought leads (in this brand) and those added before their first lead whose Page is the brand's.
  const added = Object.entries(data.adNames ?? {}).filter(([, n]) => n.added && !n.hidden && adPageInSource(n.pageId, p.src)).map(([id]) => id);
  const ids = [...new Set([...data.customers.map(adKey), ...added])];
  const brandOfAd = (id: string): SourceBrand | null => {
    const c = data.customers.find(x => adKey(x) === id);
    return (c ? sourceOf(c).brand : null) ?? brandOf(data.adNames?.[id]?.pageId);
  };
  const paidIds = ids.filter(isMetaId);

  // Meta's spend for some ads over a range; null until every one of them was read.
  const spendOf = (want: string[], a: number, b: number): number | null => {
    if (!p.money) return null;
    if (!want.length) return 0;
    const got = meta?.[metaKey(a, b)];
    if (!got || want.some(id => !(id in got))) return null;
    return want.reduce((s, id) => s + (got[id]?.spend ?? 0), 0);
  };
  // The fee is the calendar month's, on every ad of the brand: its share of the months' spend (Ads Performance's feeRate).
  const feeRate = (a: number, b: number): number | null => {
    const ms = feeMonths(a, b, T).map(([x, y]) => spendOf(paidIds, x, y));
    if (!ms.length || ms.some(s => s == null)) return null;
    const spent = ms.reduce((n: number, s) => n + (s ?? 0), 0), fee = ms.reduce((n: number, s) => n + (marketingFee(s) ?? 0), 0);
    return spent > 0 ? fee / spent : 0;
  };
  const rate = feeRate(r.a, r.b), ratePrev = feeRate(prev.a, prev.b);
  const money = (spend: number | null, leads: number, rt: number | null): OvMoney => {
    const fee = spend == null || rt == null ? null : spend * rt, cost = fee == null || spend == null ? null : spend + fee;
    return { spend, fee, cost, cpl: cost == null || !leads ? null : cost / leads };
  };
  const leadsIn = (cs: CrmCustomer[], rr: OvRange) => cs.filter(c => inRange(c.createdAt, rr));

  const adRows: OvAdRow[] = ids.map(id => {
    const cs = adCs.filter(c => adKey(c) === id), w = workOf(cs, data, r, now), paid = isMetaId(id);
    const first = data.customers.find(c => adKey(c) === id);
    const name = first?.adId ? first.ad : first ? `No ad · ${first.channel === "whatsapp" ? "WhatsApp" : "Messenger"}` : data.adNames?.[id]?.name ?? id;
    const b = brandOfAd(id);
    return { id, name, brand: b ? BRAND_LABEL[b] : "", leads: w.leads, appt: w.booked, won: w.won, paid, ...money(paid ? spendOf([id], r.a, r.b) : 0, w.leads, rate) };
  }).filter(a => a.leads > 0 || (a.paid && (a.spend ?? 0) > 0) || (a.paid && a.spend == null && p.money))
    .sort((x, y) => y.leads - x.leads || (y.spend ?? 0) - (x.spend ?? 0) || x.name.localeCompare(y.name));

  const leadsNow = leadsIn(adCs, r).length;
  const nAll = numbersOf(adCs, data.visits, r, now);
  const spendNow = spendOf(paidIds, r.a, r.b);
  const ads = { ...money(spendNow, leadsNow, rate), leads: leadsNow, appt: nAll.booked, won: nAll.won, ready: !p.money || spendNow != null };
  const leadsPrev = leadsIn(adCs, prev).length;
  const adsPrev = { ...money(spendOf(paidIds, prev.a, prev.b), leadsPrev, ratePrev), leads: leadsPrev };

  // By brand: each brand's ads (a lead's brand is its account's; an ad with none yet, its Page's).
  const brandKeys: (SourceBrand | "none")[] = ["conts", "dc", "none"];
  const brands: OvBrandRow[] = brandKeys.map(k => {
    const mine = ids.filter(id => (brandOfAd(id) ?? "none") === k), cs = adCs.filter(c => mine.includes(adKey(c)));
    const w = workOf(cs, data, r, now);
    return { key: k, label: k === "none" ? "Other" : BRAND_LABEL[k], leads: w.leads, appt: w.booked, won: w.won, ...money(spendOf(mine.filter(isMetaId), r.a, r.b), w.leads, rate) };
  }).filter(b => b.leads > 0 || (b.spend ?? 0) > 0);

  // The teams: the Revenue Director's own, then each team, each person; customers nobody has yet last.
  const groups: { key: string; name: string; people: { id: string; name: string }[] }[] = [
    ...(p.directors.length ? [{ key: p.directorTeam, name: p.directorTeam, people: p.directors }] : []),
    ...p.teams.map(t => ({ key: t.id, name: t.name, people: t.people })),
  ];
  const ofIds = (pids: string[]) => data.customers.filter(c => c.assignedTo && pids.includes(c.assignedTo));
  const teams: OvTeamRow[] = groups.map(g => ({
    key: g.key, name: g.name, ...workOf(ofIds(g.people.map(x => x.id)), data, r, now),
    people: g.people.map(x => ({ id: x.id, name: x.name, ...workOf(ofIds([x.id]), data, r, now) })).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name)),
  }));
  const placed = new Set(groups.flatMap(g => g.people.map(x => x.id)));
  const nobody = data.customers.filter(c => !c.assignedTo || !placed.has(c.assignedTo));
  const nobodyW = workOf(nobody, data, r, now);
  if (nobodyW.leads) teams.push({ key: "", name: NOBODY, ...nobodyW, people: [] });

  // Ad → teams: each ad's leads of the period, by the team that has them now.
  const teamOfPerson = new Map<string, { key: string; name: string }>();
  for (const g of groups) for (const x of g.people) if (!teamOfPerson.has(x.id)) teamOfPerson.set(x.id, { key: g.key, name: g.name });
  const adTeams: OvAdTeams[] = adRows.filter(a => a.leads > 0).map(a => {
    const cs = leadsIn(adCs.filter(c => adKey(c) === a.id), r);
    const by = new Map<string, { key: string; name: string; leads: number; booked: number; won: number }>();
    for (const c of cs) {
      const t = (c.assignedTo && teamOfPerson.get(c.assignedTo)) || { key: "", name: NOBODY };
      const row = by.get(t.key) ?? { ...t, leads: 0, booked: 0, won: 0 };
      row.leads++;
      if (data.visits.some(v => v.customerId === c.id && v.state !== "cancelled")) row.booked++;
      if (c.status === "won") row.won++;
      by.set(t.key, row);
    }
    return { id: a.id, name: a.name, leads: a.leads, teams: [...by.values()].sort((x, y) => (x.key === "" ? 1 : 0) - (y.key === "" ? 1 : 0) || y.leads - x.leads || x.name.localeCompare(y.name)) };
  });

  // What Meta still has to tell: the range, the range before, and every month the fee is read on.
  const ranges = [[r.a, r.b], [prev.a, prev.b], ...feeMonths(r.a, r.b, T), ...feeMonths(prev.a, prev.b, T)] as [number, number][];
  const need = !p.money || !paidIds.length ? [] : ranges
    .filter(([a, b], i, l) => l.findIndex(([x, y]) => x === a && y === b) === i)
    .map(([a, b]) => ({ key: metaKey(a, b), since: isoOf(a), until: isoOf(b), ids: paidIds.filter(id => !(id in (meta?.[metaKey(a, b)] ?? {}))) }))
    .filter(n => n.ids.length);

  return { ads, adsPrev, work: workOf(data.customers, data, r, now), workPrev: workOf(data.customers, data, prev, now), brands, adRows, teams, adTeams, need };
}

/* ── Words, the same on both screens ───────────────────────────────────── */

export const rm = (v: number | null | undefined) => (v == null ? "—" : `RM ${Math.round(v).toLocaleString("en-MY")}`);
export const rm2 = (v: number | null | undefined) => (v == null ? "—" : `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const pctOf = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)}%`);
export const mins = (m: number | null | undefined) => (m == null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

/** A change against the period before, and whether it is good news: a cost going down is, a reply getting faster is. */
export function change(now: number | null, before: number | null, kind: "count" | "rate" | "cost" | "time"): { d: string; good: boolean } {
  if (now == null || before == null) return { d: "—", good: true };
  if (kind === "rate") { const x = Math.round(now - before); return { d: `${x >= 0 ? "+" : "−"}${Math.abs(x)} pts`, good: x >= 0 }; }
  if (kind === "time") { const x = now - before; return { d: x === 0 ? "0 min" : `${x > 0 ? "+" : "−"}${mins(Math.abs(x))}`, good: x <= 0 }; }
  if (!before) return { d: now ? "New" : "—", good: kind !== "cost" };
  const x = Math.round(((now - before) / before) * 100);
  return { d: `${x >= 0 ? "+" : "−"}${Math.abs(x)}%`, good: kind === "cost" ? x <= 0 : x >= 0 };
}

/** The six tiles across the top: the ads' three money figures, then the team's leads, appt rate and won. */
export function overviewTiles(f: OverviewFigures, withMoney: boolean) {
  const t = (label: string, value: string, c: { d: string; good: boolean }, sub = "") => ({ label, value, d: c.d, good: c.good, sub });
  return [
    ...(withMoney ? [
      t("Ads spend", rm(f.ads.spend), change(f.ads.spend, f.adsPrev.spend, "cost"), f.ads.fee == null ? "" : `+ fee ${rm(f.ads.fee)}`),
      t("Total cost", rm(f.ads.cost), change(f.ads.cost, f.adsPrev.cost, "cost")),
      t("Per lead", rm2(f.ads.cpl), change(f.ads.cpl, f.adsPrev.cpl, "cost")),
    ] : []),
    t("Leads", f.work.leads.toLocaleString("en-MY"), change(f.work.leads, f.workPrev.leads, "count")),
    t("Avg. reply", mins(f.work.avgReply), change(f.work.avgReply, f.workPrev.avgReply, "time")),
    t("Appt rate", pctOf(f.work.apptRate), change(f.work.apptRate, f.workPrev.apptRate, "rate")),
    t("Show-up", pctOf(f.work.showRate), change(f.work.showRate, f.workPrev.showRate, "rate")),
    t("Won", f.work.won.toLocaleString("en-MY"), change(f.work.won, f.workPrev.won, "count")),
  ];
}

/** Days in a range, both ends counted. */
export const daysIn = (r: OvRange) => Math.round((r.b - r.a) / DAY) + 1;
