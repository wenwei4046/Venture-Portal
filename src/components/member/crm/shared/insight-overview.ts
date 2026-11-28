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
import { feeFixedOf, feeMonths, isoOf, monthFee, noAdRepeats } from "../desk/vm/adsperf";
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
  /**
   * Whether a range is read again for every ad, not only the ones not read yet (2026-11-25, the owner: "所有的数据都要 up to
   * date" — the phone kept the first spend it read for "This month" all month). Absent: only what is missing.
   */
  askAll?: (key: string, until: string) => boolean;
  /** The viewer's marketing fee a brand a month; absent = their saved figure (`data.uiPrefs.mktFee`), else RM 2,500. */
  fee?: number;
}

export interface OvMoney { spend: number | null; fee: number | null; cost: number | null; cpl: number | null }
export interface OvAdRow extends OvMoney { id: string; name: string; brand: string; leads: number; appt: number; won: number; sales: number; wonPaid: number; came: number; paid: boolean;
  /** The customers its Leads and Appt count (2026-11-27, "overview 也要"): the period's leads newest first, those who booked. */
  leadIds: string[]; apptIds: string[];
  /** Of its leads sent a template (a lead form's: the chat opens only once they answer it), who replied after it and who
   *  did not (the owner, 2026-11-28: "发了template 过去后，客户又回复=青色，没回复=黄色"). */
  repliedIds: string[]; noReplyIds: string[];
  /** …and of those sent a template, who booked an appointment (green, 2026-11-28: "新增有appt 有另一个颜色"). */
  tplApptIds: string[];
  /** Meta's figures for the period (a paid ad, read); null until read or with no money. */ fig: MetaFig | null }
export interface OvBrandRow extends OvMoney { key: SourceBrand | "none"; label: string; leads: number; appt: number; won: number; sales: number; wonPaid: number; came: number; fig: MetaFig | null }
export interface OvWork { leads: number; avgReply: number | null; booked: number; apptRate: number | null; came: number; due: number; showRate: number | null; won: number;
  /** RM: the Won amount of the period's leads marked won (crm_contacts.won_amount, asked when a visit is marked Won). */ sales: number;
  /** Won customers with an amount — what AOV divides by. */ wonPaid: number }
export interface OvPersonRow extends OvWork { id: string; name: string }
export interface OvTeamRow extends OvWork { key: string; name: string; people: OvPersonRow[] }
export interface OvAdTeams { id: string; name: string; leads: number; teams: { key: string; name: string; leads: number; booked: number; won: number; sales: number; wonPaid: number; came: number }[] }

export interface OverviewFigures {
  ads: OvMoney & { leads: number; appt: number; won: number; sales: number; ready: boolean };
  adsPrev: OvMoney & { leads: number; sales: number };
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
    came: n.came, due: n.due, showRate: n.due ? (n.came / n.due) * 100 : null, won: n.won, sales: salesOf(cs, r), wonPaid: wonPaidOf(cs, r) };
}
/**
 * After our template (the owner, 2026-11-28: a lead form's customer writes first, but the chat stays shut until they
 * answer the template the team sends): of the customers sent one, those who wrote again after the first template, and
 * those who have not. A customer never sent a template is in neither.
 */
export function templateReplies(cs: CrmCustomer[]): { replied: string[]; noReply: string[] } {
  const replied: string[] = [], noReply: string[] = [];
  for (const c of cs) {
    const t = c.messages.filter(m => m.from === "me" && m.kind === "template").map(m => new Date(m.at).getTime()).sort((a, b) => a - b)[0];
    if (t == null) continue;
    (c.messages.some(m => m.from === "lead" && new Date(m.at).getTime() > t) ? replied : noReply).push(c.id);
  }
  return { replied, noReply };
}
/** The range's won leads that have an amount (AOV's divisor). */
export function wonPaidOf(cs: CrmCustomer[], r: OvRange): number {
  return cs.filter(c => c.status === "won" && inRange(c.createdAt, r) && Number(c.wonAmount) > 0).length;
}
/** The Won amount of the range's leads marked won — the leads Won counts (numbersOf), each customer once. */
export function salesOf(cs: CrmCustomer[], r: OvRange): number {
  return cs.reduce((s, c) => (c.status === "won" && inRange(c.createdAt, r) && Number(c.wonAmount) > 0 ? s + Number(c.wonAmount) : s), 0);
}

export function overviewFigures(p: OverviewIn): OverviewFigures {
  const { data, r, prev, now, meta } = p;
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const fixed = p.fee ?? feeFixedOf(data.uiPrefs);
  const repeats = noAdRepeats(data.customers);
  const adCs = data.customers.filter(c => !repeats.has(c.id));
  // Leads count each PERSON once, everywhere (the owner, 2026-11-23: 185 / 180 / 186 → "能不能统一"; picked "一人只算一次"):
  // a "no ad" chat that is already an ad's lead (noAdRepeats) is not a lead again — its visits and its sale still count.
  const workAll = (cs: CrmCustomer[], rr: OvRange): OvWork => {
    const w = workOf(cs, data, rr, now), extra = cs.filter(c => repeats.has(c.id) && inRange(c.createdAt, rr)).length;
    if (!extra) return w;
    const leads = Math.max(0, w.leads - extra);
    return { ...w, leads, apptRate: leads ? (w.booked / leads) * 100 : null };
  };

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
  // Meta's figures for some ads, added up as Ads Performance adds them; null until every one was read.
  const figOf = (want: string[], a: number, b: number): MetaFig | null => {
    if (!p.money || !want.length) return null;
    const got = meta?.[metaKey(a, b)];
    if (!got || want.some(id => !(id in got))) return null;
    return want.reduce((s, id) => { const g = got[id]; return g ? { spend: s.spend + g.spend, impr: s.impr + g.impr, reach: s.reach + g.reach, clicks: s.clicks + g.clicks, allClicks: s.allClicks + g.allClicks, msgconv: s.msgconv + g.msgconv } : s; },
      { spend: 0, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0 } as MetaFig);
  };
  // The fee is the calendar month's, on every ad of the brand: its share of the months' spend (Ads Performance's feeRate).
  const feeRate = (a: number, b: number): number | null => {
    // The viewer's own fee a month for each brand that spent (monthFee; RM 0 until they change it — feeFixedOf, 2026-11-27).
    const ms = feeMonths(a, b, T).map(([x, y]) => monthFee(paidIds, brandOfAd, ids => spendOf(ids, x, y), fixed));
    if (!ms.length || ms.some(m => m == null)) return null;
    const spent = ms.reduce((n: number, m) => n + (m?.spent ?? 0), 0), fee = ms.reduce((n: number, m) => n + (m?.fee ?? 0), 0);
    return spent > 0 ? fee / spent : 0;
  };
  const rate = feeRate(r.a, r.b), ratePrev = feeRate(prev.a, prev.b);
  // A range that IS its fee months (This month, a whole past month) is billed the months' own fee, not spend × rate: the
  // range and the month are two reads of Ads Manager taken moments apart, and the share drifted off the bill (the owner's
  // 2026-11-27 screenshot: RM 2,505 for a RM 2,500 month, spend RM 8,235 against a month read at RM 8,227).
  const wholeFee = (a: number, b: number): number | null => {
    const fm = feeMonths(a, b, T);
    if (!fm.length || a !== fm[0][0] || b < new Date(new Date(fm[fm.length - 1][0]).getFullYear(), new Date(fm[fm.length - 1][0]).getMonth() + 1, 0).getTime()) return null;
    const ms = fm.map(([x, y]) => monthFee(paidIds, brandOfAd, ids => spendOf(ids, x, y), fixed));
    return ms.some(m => m == null) ? null : ms.reduce((n: number, m) => n + (m?.fee ?? 0), 0);
  };
  const money = (spend: number | null, leads: number, rt: number | null, whole: number | null = null): OvMoney => {
    const fee = spend == null || rt == null ? null : whole ?? spend * rt, cost = fee == null || spend == null ? null : spend + fee;
    return { spend, fee, cost, cpl: cost == null || !leads ? null : cost / leads };
  };
  const leadsIn = (cs: CrmCustomer[], rr: OvRange) => cs.filter(c => inRange(c.createdAt, rr));

  const adRows: OvAdRow[] = ids.map(id => {
    const cs = adCs.filter(c => adKey(c) === id), w = workOf(cs, data, r, now), paid = isMetaId(id);
    const first = data.customers.find(c => adKey(c) === id);
    const name = first?.adId ? first.ad : first ? `No ad · ${first.channel === "whatsapp" ? "WhatsApp" : "Messenger"}` : data.adNames?.[id]?.name ?? id;
    const b = brandOfAd(id);
    // numbersOf's own leads and booked, as ids.
    const lc = cs.filter(c => inRange(c.createdAt, r)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)), leadIds = lc.map(c => c.id);
    const apptIds = lc.filter(c => data.visits.some(v => v.customerId === c.id && v.state !== "cancelled")).map(c => c.id);
    const rep = templateReplies(lc);
    const sent = new Set([...rep.replied, ...rep.noReply]);
    return { id, name, leadIds, apptIds, repliedIds: rep.replied, noReplyIds: rep.noReply, tplApptIds: apptIds.filter(x => sent.has(x)), brand: b ? BRAND_LABEL[b] : "", leads: w.leads, appt: w.booked, won: w.won, sales: w.sales, wonPaid: w.wonPaid, came: w.came, paid, fig: paid ? figOf([id], r.a, r.b) : null, ...money(paid ? spendOf([id], r.a, r.b) : 0, w.leads, rate) };
  }).filter(a => a.leads > 0 || (a.paid && (a.spend ?? 0) > 0) || (a.paid && a.spend == null && p.money))
    .sort((x, y) => y.leads - x.leads || (y.spend ?? 0) - (x.spend ?? 0) || x.name.localeCompare(y.name));

  const leadsNow = leadsIn(adCs, r).length;
  const nAll = numbersOf(adCs, data.visits, r, now);
  const spendNow = spendOf(paidIds, r.a, r.b);
  const ads = { ...money(spendNow, leadsNow, rate, wholeFee(r.a, r.b)), leads: leadsNow, appt: nAll.booked, won: nAll.won, sales: salesOf(adCs, r), ready: !p.money || spendNow != null };
  const leadsPrev = leadsIn(adCs, prev).length;
  const adsPrev = { ...money(spendOf(paidIds, prev.a, prev.b), leadsPrev, ratePrev, wholeFee(prev.a, prev.b)), leads: leadsPrev, sales: salesOf(adCs, prev) };

  // By brand: each brand's ads (a lead's brand is its account's; an ad with none yet, its Page's).
  const brandKeys: (SourceBrand | "none")[] = ["conts", "dc", "none"];
  const brands: OvBrandRow[] = brandKeys.map(k => {
    const mine = ids.filter(id => (brandOfAd(id) ?? "none") === k), cs = adCs.filter(c => mine.includes(adKey(c)));
    const w = workOf(cs, data, r, now);
    return { key: k, label: k === "none" ? "Other" : BRAND_LABEL[k], leads: w.leads, appt: w.booked, won: w.won, sales: w.sales, wonPaid: w.wonPaid, came: w.came, fig: figOf(mine.filter(isMetaId), r.a, r.b), ...money(spendOf(mine.filter(isMetaId), r.a, r.b), w.leads, rate) };
  }).filter(b => b.leads > 0 || (b.spend ?? 0) > 0);

  // The teams: the Revenue Director's own, then each team, each person; customers nobody has yet last.
  const groups: { key: string; name: string; people: { id: string; name: string }[] }[] = [
    ...(p.directors.length ? [{ key: p.directorTeam, name: p.directorTeam, people: p.directors }] : []),
    ...p.teams.map(t => ({ key: t.id, name: t.name, people: t.people })),
  ];
  const ofIds = (pids: string[]) => data.customers.filter(c => c.assignedTo && pids.includes(c.assignedTo));
  const teams: OvTeamRow[] = groups.map(g => ({
    key: g.key, name: g.name, ...workAll(ofIds(g.people.map(x => x.id)), r),
    people: g.people.map(x => ({ id: x.id, name: x.name, ...workAll(ofIds([x.id]), r) })).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name)),
  }));
  const placed = new Set(groups.flatMap(g => g.people.map(x => x.id)));
  const nobody = data.customers.filter(c => !c.assignedTo || !placed.has(c.assignedTo));
  const nobodyW = workAll(nobody, r);
  if (nobodyW.leads) teams.push({ key: "", name: NOBODY, ...nobodyW, people: [] });

  // Ad → teams: each ad's leads of the period, by the team that has them now.
  const teamOfPerson = new Map<string, { key: string; name: string }>();
  for (const g of groups) for (const x of g.people) if (!teamOfPerson.has(x.id)) teamOfPerson.set(x.id, { key: g.key, name: g.name });
  const adTeams: OvAdTeams[] = adRows.filter(a => a.leads > 0).map(a => {
    const cs = leadsIn(adCs.filter(c => adKey(c) === a.id), r);
    const by = new Map<string, { key: string; name: string; leads: number; booked: number; won: number; sales: number; wonPaid: number; came: number }>();
    for (const c of cs) {
      const t = (c.assignedTo && teamOfPerson.get(c.assignedTo)) || { key: "", name: NOBODY };
      const row = by.get(t.key) ?? { ...t, leads: 0, booked: 0, won: 0, sales: 0, wonPaid: 0, came: 0 };
      row.leads++;
      if (data.visits.some(v => v.customerId === c.id && v.state !== "cancelled")) row.booked++;
      if (data.visits.some(v => v.customerId === c.id && v.state === "attended" && inRange(v.start, r))) row.came++;
      if (c.status === "won") { row.won++; if (Number(c.wonAmount) > 0) { row.sales += Number(c.wonAmount); row.wonPaid++; } }
      by.set(t.key, row);
    }
    return { id: a.id, name: a.name, leads: a.leads, teams: [...by.values()].sort((x, y) => (x.key === "" ? 1 : 0) - (y.key === "" ? 1 : 0) || y.leads - x.leads || x.name.localeCompare(y.name)) };
  });

  // What Meta still has to tell: the range, the range before, and every month the fee is read on.
  const ranges = [[r.a, r.b], [prev.a, prev.b], ...feeMonths(r.a, r.b, T), ...feeMonths(prev.a, prev.b, T)] as [number, number][];
  const need = !p.money || !paidIds.length ? [] : ranges
    .filter(([a, b], i, l) => l.findIndex(([x, y]) => x === a && y === b) === i)
    .map(([a, b]) => ({ key: metaKey(a, b), since: isoOf(a), until: isoOf(b), ids: p.askAll?.(metaKey(a, b), isoOf(b)) ? paidIds : paidIds.filter(id => !(id in (meta?.[metaKey(a, b)] ?? {}))) }))
    .filter(n => n.ids.length);

  return { ads, adsPrev, work: workAll(data.customers, r), workPrev: workAll(data.customers, prev), brands, adRows, teams, adTeams, need };
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

export interface OvTip { sub: string[]; title?: string }
/**
 * Each tile's hover (the owner, 2026-11-17: "鼠标指向这些数据会出现小字提示，像 ads performance 一样"): how the figure is
 * worked out, in the period's own numbers where there are any, then what it is compared with — Ads Performance's card
 * (sub: the first line bold; title: under a rule, faint). `vs` names the compared dates ("vs 1–17 Oct").
 */
export function overviewTiles(f: OverviewFigures, withMoney: boolean, vs = "vs last") {
  const t = (label: string, value: string, c: { d: string; good: boolean }, tip: OvTip, sub = "") => ({ label, value, d: c.d, good: c.good, sub, tip });
  const was = (v: string) => `${vs}: ${v}`;
  const a = f.ads, ap = f.adsPrev, w = f.work, wp = f.workPrev;
  const div = (x: number, y: number, out: string) => (y ? [`${x.toLocaleString("en-MY")} ÷ ${y.toLocaleString("en-MY")} = ${out}`] : []);
  return [
    ...(withMoney ? [
      t("Ads spend", rm(a.spend), change(a.spend, ap.spend, "cost"), {
        sub: ["Ads spend = what Ads Manager spent on the ads", ...(a.fee == null ? [] : [`Marketing fee's share ${rm2(a.fee)} is added in Total cost`])], title: was(rm(ap.spend)) },
        a.fee == null ? "" : `+ fee ${rm(a.fee)}`),
      t("Total cost", rm(a.cost), change(a.cost, ap.cost, "cost"), {
        sub: ["Total cost = ads spend + marketing fee's share", ...(a.spend == null || a.fee == null ? [] : [`${rm2(a.spend)} + ${rm2(a.fee)} = ${rm2(a.cost)}`])], title: was(rm(ap.cost)) }),
      // Over every lead of the period, not the ads' alone (the owner, 2026-11-17: "perlead, 除 total leads").
      t("Per lead", rm2(perLead(a.cost, w.leads)), change(perLead(a.cost, w.leads), perLead(ap.cost, wp.leads), "cost"), {
        sub: ["Per lead = (ads spend + fee) ÷ total leads", ...(a.cost == null || !w.leads ? [] : [`${rm2(a.cost)} ÷ ${w.leads.toLocaleString("en-MY")} = ${rm2(perLead(a.cost, w.leads))}`])], title: was(rm2(perLead(ap.cost, wp.leads))) }),
    ] : []),
    t("Leads", w.leads.toLocaleString("en-MY"), change(w.leads, wp.leads, "count"), {
      sub: ["Leads = new customers in the period", "Each customer counted once"], title: was(wp.leads.toLocaleString("en-MY")) }),
    t("Avg. reply", mins(w.avgReply), change(w.avgReply, wp.avgReply, "time"), {
      sub: ["Avg. reply = a customer's message to our next reply, averaged", "Replies made in the period · auto-replies don't count"], title: was(mins(wp.avgReply)) }),
    t("Appt rate", pctOf(w.apptRate), change(w.apptRate, wp.apptRate, "rate"), {
      sub: ["Appt rate = leads who booked ÷ leads", ...div(w.booked, w.leads, pctOf(w.apptRate))], title: was(pctOf(wp.apptRate)) }),
    t("Show-up", pctOf(w.showRate), change(w.showRate, wp.showRate, "rate"), {
      sub: ["Show-up = customers who came ÷ visits due", ...div(w.came, w.due, pctOf(w.showRate))], title: was(pctOf(wp.showRate)) }),
    t("Won", w.won.toLocaleString("en-MY"), change(w.won, wp.won, "count"), {
      sub: ["Won = the period's leads marked won"], title: was(wp.won.toLocaleString("en-MY")) }),
    // The owner, 2026-11-17: "新增：conversion rate, total sales, ROAS, AOV" — sales = the Won amount asked when a visit is
    // marked Won; ROAS on the ads' own sales and total cost.
    t("Total sales", rm(w.sales), change(w.sales, wp.sales, "count"), {
      sub: ["Total sales = the Won amount of the period's leads marked won", w.wonPaid ? `${w.wonPaid.toLocaleString("en-MY")} won with an amount · ${rm2(w.sales)}` : "No customer marked Won with an amount yet", "Recorded only · commission is unchanged"], title: was(rm(wp.sales)) }),
    t("Conversion", pctOf(convOf(w)), change(convOf(w), convOf(wp), "rate"), {
      sub: ["Conversion = won ÷ customers who showed up", w.came ? div(w.won, w.came, pctOf(convOf(w)))[0] : "Nobody showed up in the period"], title: was(pctOf(convOf(wp))) }),
    t("AOV", rm(aovOf(w)), change(aovOf(w), aovOf(wp), "count"), {
      sub: ["AOV = total sales ÷ won customers with an amount", w.wonPaid ? `${rm2(w.sales)} ÷ ${w.wonPaid.toLocaleString("en-MY")} = ${rm2(aovOf(w))}` : "No customer marked Won with an amount yet"], title: was(rm(aovOf(wp))) }),
    ...(withMoney ? [
      t("ROAS", roasText(w.sales, a.cost), change(roasOf(w.sales, a.cost), roasOf(wp.sales, ap.cost), "count"), {
        sub: ["ROAS = total sales ÷ total cost (ads spend + marketing fee's share)",
          ...(w.sales && a.cost ? [`${rm(w.sales)} ÷ ${rm(a.cost)} = ${roasText(w.sales, a.cost)} (ads + fee)`] : [!w.sales ? "No customer marked Won with an amount yet" : "No ads cost read for the period yet"]),
          ...(w.sales && a.spend ? [`${rm(w.sales)} ÷ ${rm(a.spend)} = ${roasText(w.sales, a.spend)} (ads only)`] : [])], title: was(roasText(wp.sales, ap.cost)) }),
    ] : []),
  ];
}

export const perLead = (cost: number | null | undefined, leads: number) => (cost == null || !leads ? null : cost / leads);
export const convOf = (x: { won: number; came: number }) => (x.came ? (x.won / x.came) * 100 : null);
export const aovOf = (x: { wonPaid: number; sales: number }) => (x.wonPaid ? x.sales / x.wonPaid : null);
export const roasOf = (sales: number, cost: number | null | undefined) => (sales > 0 && cost && cost > 0 ? sales / cost : null);
export const roasText = (sales: number, cost: number | null | undefined) => { const v = roasOf(sales, cost); return v == null ? "—" : `${v.toFixed(2)}×`; };

/**
 * The tables' added columns (the owner, 2026-11-17: "我要的 metric 是 cpc etc, 目前有的这些可以保留，此外是 + 数据，不是替换"):
 * every column the tables have stays; "+" adds one of these, each with ×. The CRM's own figures, then Meta's per ad (what
 * Ads Performance's figures are made of — the same cache, `apMeta`; no new read from Meta). A team has no cost or ad
 * figures, so it is offered the CRM's alone.
 */
export type OvColKey = "sales" | "conv" | "aov" | "roas" | "appt" | "impr" | "reach" | "freq" | "cpm" | "clicks" | "cpc" | "ctr" | "allclk" | "msgconv" | "cpmsg";
export const OV_COLS: { key: OvColKey; label: string; group: "CRM" | "Meta Ads"; money?: boolean; ads?: boolean }[] = [
  { key: "sales", label: "Sales", group: "CRM" }, { key: "conv", label: "Conversion", group: "CRM" }, { key: "aov", label: "AOV", group: "CRM" },
  { key: "roas", label: "ROAS", group: "CRM", money: true, ads: true }, { key: "appt", label: "Appt rate", group: "CRM", ads: true },
  { key: "impr", label: "Impressions", group: "Meta Ads", money: true, ads: true }, { key: "reach", label: "Reach", group: "Meta Ads", money: true, ads: true },
  { key: "freq", label: "Frequency", group: "Meta Ads", money: true, ads: true }, { key: "cpm", label: "CPM", group: "Meta Ads", money: true, ads: true },
  { key: "clicks", label: "Link clicks", group: "Meta Ads", money: true, ads: true }, { key: "cpc", label: "CPC", group: "Meta Ads", money: true, ads: true },
  { key: "ctr", label: "CTR", group: "Meta Ads", money: true, ads: true }, { key: "allclk", label: "Clicks (all)", group: "Meta Ads", money: true, ads: true },
  { key: "msgconv", label: "Conversations", group: "Meta Ads", money: true, ads: true }, { key: "cpmsg", label: "Cost / conversation", group: "Meta Ads", money: true, ads: true },
];
export const colsFor = (table: "ads" | "team", money: boolean) => OV_COLS.filter(c => (!c.money || money) && (!c.ads || table === "ads"));
/** A kept list of added columns: what the person added, known keys only, once each (an older single pick reads as one). */
export function keptCols(v: unknown): OvColKey[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  return list.filter((k, n): k is OvColKey => OV_COLS.some(c => c.key === k) && list.indexOf(k) === n);
}
const num = (v: number) => Math.round(v).toLocaleString("en-MY");
export function colValue(key: OvColKey, x: { leads: number; won: number; sales: number; wonPaid: number; came: number; appt?: number; booked?: number; cost?: number | null; fig?: MetaFig | null }): string {
  if (key === "sales") return rm(x.sales);
  if (key === "conv") return pctOf(convOf(x));
  if (key === "aov") return rm(aovOf(x));
  if (key === "roas") return roasText(x.sales, x.cost);
  if (key === "appt") { const b = x.appt ?? x.booked ?? 0; return pctOf(x.leads ? (b / x.leads) * 100 : null); }
  const f = x.fig;
  if (!f) return "—";
  const per = (n: number) => (n ? rm2(f.spend / n) : "—");
  switch (key) {
    case "impr": return num(f.impr);
    case "reach": return num(f.reach);
    case "freq": return f.reach ? (f.impr / f.reach).toFixed(2) : "—";
    case "cpm": return f.impr ? rm2((f.spend / f.impr) * 1000) : "—";
    case "clicks": return num(f.clicks);
    case "cpc": return per(f.clicks);
    case "ctr": return f.impr ? `${((f.clicks / f.impr) * 100).toFixed(2)}%` : "—";
    case "allclk": return num(f.allClicks);
    case "msgconv": return num(f.msgconv);
    case "cpmsg": return per(f.msgconv);
  }
  return "—";
}

/** Days in a range, both ends counted. */
export const daysIn = (r: OvRange) => Math.round((r.b - r.a) / DAY) + 1;
