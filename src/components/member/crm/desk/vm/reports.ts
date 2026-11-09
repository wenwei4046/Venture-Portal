/**
 * Reports (2026-10-23, the owner: "在左手边功能加一个报告的功能，里面分成不一样的 category（leads by ads, ads performance，
 * 更多细节的报告都在这边看到）"; asked, each its own: Ads performance · Leads by ad · Salespeople · Appointments & show-ups ·
 * Lead sources & status; Ads Performance and Assignment › Leads by ad stay where they are too). The pure arithmetic of
 * the three new reports over the customers and visits the CRM already reads — nothing new is read.
 *
 * Counted as the rest of the CRM counts: a lead belongs to the period it came in (createdAt) and to whoever holds it now;
 * its visit, show-up, win and loss go with it. A visit report counts visits by their own day.
 */
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { CRM_LOST_REASONS } from "@/lib/member/crm";
import { sourceOf, SOURCE_PICKS } from "@/lib/member/crm-source";

export type RpPeriod = "today" | "week" | "month" | "last" | "all" | "custom";
/**
 * v4 D6a (notes/25): the same period switch as Insight — Today · This week · This month · Custom; Last month and All time
 * are Custom's presets now (shared/date-range.tsx). "last" / "all" stay readable for a period kept from before.
 */
export const RP_PERIODS: [RpPeriod, string][] = [["today", "Today"], ["week", "This week"], ["month", "This month"], ["custom", "Custom"]];
const DAY = 86_400_000;

/** The period's first and last moment (local days; the week from Monday). */
export function periodRange(p: RpPeriod, now: Date): [number, number] {
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (p === "today") return [T, T + DAY - 1];
  if (p === "week") return [T - ((now.getDay() + 6) % 7) * DAY, T + DAY - 1];
  if (p === "month" || p === "custom") return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), T + DAY - 1];
  if (p === "last") return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1];
  return [-Infinity, T + DAY - 1];
}
const inRange = (iso: string, [a, b]: [number, number]) => { const t = new Date(iso).getTime(); return t >= a && t <= b; };
const rate = (n: number, of: number) => (of ? n / of : null);

/** One row of a breakdown: its label, count and share of the whole. */
export interface Part { label: string; n: number; share: number }
export function breakdown<T>(items: T[], keyOf: (x: T) => string, order?: string[]): Part[] {
  const m = new Map<string, number>();
  for (const x of items) m.set(keyOf(x), (m.get(keyOf(x)) ?? 0) + 1);
  const rows = [...m].map(([label, n]) => ({ label, n, share: items.length ? n / items.length : 0 }));
  return order ? rows.sort((a, b) => (order.indexOf(a.label) + 1 || 99) - (order.indexOf(b.label) + 1 || 99) || b.n - a.n)
    : rows.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

/** Salespeople: each person who holds leads of the period — their figures, and the minutes to their first reply. */
export interface SalesRow {
  id: string; name: string; team: string; leads: number; replied: number; replyRate: number | null; firstReplyMin: number | null;
  appt: number; apptRate: number | null; showed: number; showRate: number | null; won: number; winRate: number | null; lost: number;
}
export function salespeopleReport(cs: CrmCustomer[], visits: CrmVisit[], range: [number, number], nameOf: (id: string) => string, teamOf: (id: string) => string | null): { rows: SalesRow[]; total: SalesRow } {
  const live = new Map<string, CrmVisit[]>();
  for (const v of visits) if (v.state !== "cancelled") live.set(v.customerId, [...(live.get(v.customerId) ?? []), v]);
  const leads = cs.filter(c => inRange(c.createdAt, range));
  const figures = (id: string, name: string, team: string, list: CrmCustomer[]): SalesRow => {
    let replied = 0, mins = 0, timed = 0, appt = 0, showed = 0;
    for (const c of list) {
      const firstLead = c.messages.find(m => m.from === "lead"), firstOurs = c.messages.find(m => m.from === "me" && !m.auto && (!firstLead || m.at >= firstLead.at));
      if (firstOurs) { replied++; if (firstLead) { mins += Math.max(0, (new Date(firstOurs.at).getTime() - new Date(firstLead.at).getTime()) / 60000); timed++; } }
      const vs = live.get(c.id) ?? [];
      if (vs.length) { appt++; if (vs.some(v => v.state === "attended")) showed++; }
    }
    const won = list.filter(c => c.status === "won").length, lost = list.filter(c => c.status === "lost").length;
    return { id, name, team, leads: list.length, replied, replyRate: rate(replied, list.length), firstReplyMin: timed ? mins / timed : null,
      appt, apptRate: rate(appt, list.length), showed, showRate: rate(showed, appt), won, winRate: rate(won, list.length), lost };
  };
  const by = new Map<string, CrmCustomer[]>();
  for (const c of leads) by.set(c.assignedTo ?? "", [...(by.get(c.assignedTo ?? "") ?? []), c]);
  const rows = [...by].map(([id, list]) => figures(id, id ? nameOf(id) : "Not assigned yet", id ? teamOf(id) ?? "" : "", list))
    .sort((a, b) => Number(!a.id) - Number(!b.id) || b.leads - a.leads || a.name.localeCompare(b.name));
  return { rows, total: figures("", "All salespeople", "", leads) };
}

/** Appointments & show-ups: visits by their own day — the figures, then by showroom, weekday, time, salesperson and outcome. */
export interface ApptVisit { at: Date; room: string; rep: string; outcome: string; who?: string }
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const OUTCOMES = ["Upcoming", "To mark", "Showed up", "Won", "Follow up", "Lost", "No show", "Cancelled"];
export function appointmentsReport(vs: ApptVisit[]) {
  const n = (o: string) => vs.filter(v => v.outcome === o).length;
  // The figures count a customer once (2026-10-27, the owner: the rate, then "ok" to the tiles too): booked twice is one
  // booked, came twice one who came; a No show is a customer marked so who never came. The cards below stay visits.
  const whoOf = (v: ApptVisit, i: number) => v.who ?? `#${i}`, CAME = ["Showed up", "Won", "Follow up", "Lost"];
  const custOf = (keep: (v: ApptVisit) => boolean) => new Set(vs.map((v, i) => keep(v) ? whoOf(v, i) : null).filter((x): x is string => !!x));
  const cameC = custOf(v => CAME.includes(v.outcome));
  const noC = new Set([...custOf(v => v.outcome === "No show")].filter(w => !cameC.has(w)));
  const markedC = new Set([...cameC, ...noC]);
  const times = [...new Set(vs.map(v => v.at.getHours() * 60 + v.at.getMinutes()))].sort((a, b) => a - b)
    .map(m => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }));
  const timeOf = (v: ApptVisit) => v.at.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  return {
    figures: { booked: custOf(v => v.outcome !== "Cancelled").size, upcoming: custOf(v => v.outcome === "Upcoming").size, showed: cameC.size, noShow: noC.size,
      toMark: custOf(v => v.outcome === "To mark").size, cancelled: custOf(v => v.outcome === "Cancelled").size, showRate: rate(cameC.size, markedC.size) },
    byRoom: breakdown(vs, v => v.room), byDow: breakdown(vs, v => DOW[(v.at.getDay() + 6) % 7], DOW), byTime: breakdown(vs, timeOf, times),
    byRep: breakdown(vs, v => v.rep), byOutcome: breakdown(vs, v => v.outcome, OUTCOMES),
  };
}

/** Lead sources & status: the period's leads by channel, ad, status (the inbox's order), loss reason and property type. */
export function sourcesReport(cs: CrmCustomer[], range: [number, number], statusOf: (c: CrmCustomer) => string, channelName: (c: CrmCustomer) => string) {
  const leads = cs.filter(c => inRange(c.createdAt, range));
  const lost = leads.filter(c => c.status === "lost");
  const reason = (c: CrmCustomer) => CRM_LOST_REASONS.find(r => r.value === c.lost?.reason)?.label ?? "Not given";
  return {
    figures: { leads: leads.length, fromAds: leads.filter(c => c.adId).length, won: leads.filter(c => c.status === "won").length, lost: lost.length },
    byChannel: breakdown(leads, channelName),
    // By source (2026-10-27): The Conts / DC, each by WhatsApp · Messenger — a number or Page not listed is its channel alone.
    bySource: breakdown(leads, c => sourceOf(c).label, SOURCE_PICKS.filter(p => p.sub).map(p => p.label)), byAd: breakdown(leads, c => (c.adId ? c.ad || "Ad" : "No ad")),
    byStatus: breakdown(leads, statusOf, ["New", "Attention", "Follow up", "Appointment", "Won", "Lost", "Cold leads"]),
    lostWhy: breakdown(lost, reason, CRM_LOST_REASONS.map(r => r.label).concat("Not given")),
    byType: breakdown(leads, c => c.details.type || "Not filled yet"),
  };
}

/** "45 min", "3 h 10 min", "2 d 4 h" — a first reply's average wait. */
export function waitLabel(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 24 * 60) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h} h ${m} min` : `${h} h`; }
  const d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}
export const pctLabel = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);

/**
 * Every reply's wait in a chat, in minutes (the owner, 2026-11-09: the overall report's "平均回复时间"): each time the customer
 * writes after us (or first), the time until our next own message — auto-replies are not a reply. A wait still open is not
 * counted: it has no length yet.
 */
export function replyWaits(c: Pick<CrmCustomer, "messages">): number[] {
  const out: number[] = [];
  let since: string | null = null;
  for (const m of c.messages) {
    if (m.from === "lead") { if (!since) since = m.at; }
    else if (!m.auto && since) { out.push(Math.max(0, (new Date(m.at).getTime() - new Date(since).getTime()) / 60000)); since = null; }
  }
  return out;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Who a chat waits on (v4 D6a, notes/25): "Never replied" (no message of ours, auto-replies aside), "Needs our reply" (the
 * customer wrote last), "Customer hasn't replied" (we wrote last), or "Visit booked" (one still to come) — and since when.
 * Won and lost chats are closed. "never" and "ours" are the ones that need a reply.
 */
export type ReplyKind = "never" | "ours" | "theirs" | "visit" | "closed";
export function replyState(c: Pick<CrmCustomer, "messages" | "createdAt" | "status" | "id">, visits: Pick<CrmVisit, "customerId" | "state" | "start">[], now: Date): { kind: ReplyKind; since: number; visitAt: string | null } {
  const next = visits.filter(v => v.customerId === c.id && v.state === "booked" && new Date(v.start).getTime() >= now.getTime()).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (c.status === "won" || c.status === "lost") return { kind: "closed", since: 0, visitAt: null };
  if (next) return { kind: "visit", since: 0, visitAt: next.start };
  const real = c.messages.filter(m => !(m.from === "me" && m.auto));
  const ours = real.filter(m => m.from === "me");
  const t = (iso: string) => new Date(iso).getTime();
  if (!ours.length) { const firstLead = real.find(m => m.from === "lead"); return { kind: "never", since: firstLead ? t(firstLead.at) : t(c.createdAt), visitAt: null }; }
  const last = real[real.length - 1];
  if (last.from === "lead") {
    // The first of the customer's messages after our last one: how long they have waited.
    const lastOurs = ours[ours.length - 1], firstWaiting = real.find(m => m.from === "lead" && m.at > lastOurs.at) ?? last;
    return { kind: "ours", since: t(firstWaiting.at), visitAt: null };
  }
  return { kind: "theirs", since: t(last.at), visitAt: null };
}
export const needsReply = (k: ReplyKind) => k === "never" || k === "ours";
/** "3 d", "9 h", "40 m" — a wait in the panel's plain sentences. */
export function waitWords(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m >= 1440 ? `${Math.floor(m / 1440)} d` : m >= 60 ? `${Math.floor(m / 60)} h` : `${m} m`;
}

/**
 * Overview's columns (v4 D6a, notes/25): Leads · Avg reply · Appts · Show-up · Won · Lost always; Columns adds Spend, Per
 * lead, Won rate, each status (New, Attention, Follow up, Appointment, Cold) and Channel (a WhatsApp and a Messenger count)
 * — off by default, in this order wherever they were ticked.
 */
export type RpColKey = "leads" | "avg" | "appt" | "show" | "won" | "lost" | "spend" | "perLead" | "wonRate" | "st:New" | "st:Attention" | "st:Follow up" | "st:Appointment" | "st:Cold leads" | "ch:wa" | "ch:ms";
export const RP_BASE_COLS: [RpColKey, string, number][] = [["leads", "Leads", 80], ["avg", "Avg reply", 100], ["appt", "Appts", 80], ["show", "Show-up", 90], ["won", "Won", 70], ["lost", "Lost", 70]];
/** The picker's choices: [pref key, label, its columns]. */
export const RP_PICKS: [string, string, [RpColKey, string, number][]][] = [
  ["spend", "Spend", [["spend", "Spend", 90]]], ["perLead", "Per lead", [["perLead", "Per lead", 80]]], ["wonRate", "Won rate", [["wonRate", "Won rate", 84]]],
  ["st:New", "New", [["st:New", "New", 64]]], ["st:Attention", "Attention", [["st:Attention", "Attention", 84]]], ["st:Follow up", "Follow up", [["st:Follow up", "Follow up", 84]]],
  ["st:Appointment", "Appointment", [["st:Appointment", "Appointment", 104]]], ["st:Cold leads", "Cold", [["st:Cold leads", "Cold", 64]]],
];
/** The picks remembered on the server, kept to the ones the picker knows (anything else ignored). */
export function readReportCols(v: unknown): string[] {
  return Array.isArray(v) ? RP_PICKS.map(p => p[0]).filter(k => v.includes(k)) : [];
}
/** The table's columns for the picks: the six, then the extras in the picker's order. */
export function reportColumns(picks: string[]): [RpColKey, string, number][] {
  return [...RP_BASE_COLS, ...RP_PICKS.filter(p => picks.includes(p[0])).flatMap(p => p[2])];
}
/** A column's raw figure (for sorting and drawing): spend from Meta when read, else null. */
export function colValue(f: OverviewFigs, k: RpColKey, spend: number | null): number | null {
  switch (k) {
    case "leads": return f.n; case "avg": return f.avgMin; case "appt": return f.appt; case "show": return f.show; case "won": return f.won; case "lost": return f.lost;
    case "spend": return spend; case "perLead": return spend != null && f.n ? spend / f.n : null; case "wonRate": return f.n ? f.won / f.n : null;
    case "ch:wa": return f.wa; case "ch:ms": return f.ms;
    default: return f.st[k.slice(3)] ?? 0;
  }
}
/** Rows by a column: high → low (null last), then the name. */
export function sortByCol<T extends { name: string; v: (k: RpColKey) => number | null }>(rows: T[], k: RpColKey, dir: "asc" | "desc"): T[] {
  return rows.slice().sort((a, b) => {
    const x = a.v(k), y = b.v(k);
    if (x == null || y == null) return x == null && y == null ? a.name.localeCompare(b.name) : x == null ? 1 : -1;
    return (dir === "desc" ? y - x : x - y) || a.name.localeCompare(b.name);
  });
}

/** A row's figures: its leads, average reply, appointments, show-ups, won and lost; per status and channel; who needs a reply. */
export interface OverviewFigs { n: number; avgMin: number | null; appt: number; show: number; won: number; lost: number; st: Record<string, number>; wa: number; ms: number; need: number }
export interface OverviewCustomer { id: string; name: string; status: string; avgMin: number | null; ad: string; rep: string; c: CrmCustomer }
export interface OverviewPerson extends OverviewFigs { id: string; name: string; customers: OverviewCustomer[] }
export interface OverviewAd extends OverviewFigs { key: string; name: string; channel: "whatsapp" | "messenger"; people: OverviewPerson[] }
/**
 * The overall report (the owner, 2026-11-09: "不同的广告进来目前分配给了哪些业务，他们回复的平均时间，点开之后可以看到每个客户（包含
 * 他们的状态，平均回复时间，广告来源），和 open chat"; then "salesperson & leads by ad & overview 是不是可以结合" — one report, two
 * views): the period's leads by ad (most first, no ad last) and under each the people who have them now, or by salesperson
 * (most first, nobody yet last) with every customer; an average reply is over every reply wait in those chats. An
 * appointment is a visit not cancelled; a show-up a visit attended.
 */
export function overviewReport(cs: CrmCustomer[], range: [number, number], adName: (c: CrmCustomer) => string, nameOf: (id: string) => string, statusOf: (c: CrmCustomer) => string,
  visits: CrmVisit[] = [], ad: string = "all", now: Date = new Date()): { byAd: OverviewAd[]; byRep: OverviewPerson[] } {
  const live = new Map<string, CrmVisit[]>();
  for (const v of visits) if (v.state !== "cancelled") live.set(v.customerId, [...(live.get(v.customerId) ?? []), v]);
  // v4 D6a: a lead from no ad is its channel's ("WhatsApp · no ad", "Messenger · no ad"), each its own row.
  const keyOf = (c: CrmCustomer) => c.adId || (c.channel ? `none:${c.channel}` : "none");
  const leads = cs.filter(c => inRange(c.createdAt, range) && (ad === "all" || keyOf(c) === ad || (ad === "none" && !c.adId)));
  const noAd = (c: CrmCustomer) => (c.channel === "whatsapp" ? "WhatsApp · no ad" : c.channel === "messenger" ? "Messenger · no ad" : "No ad");
  const adOf = (c: CrmCustomer) => (c.adId ? adName(c) : noAd(c));
  const figs = (list: CrmCustomer[]): OverviewFigs => {
    const st: Record<string, number> = {};
    for (const c of list) { const s = statusOf(c); st[s] = (st[s] ?? 0) + 1; }
    return { n: list.length, avgMin: mean(list.flatMap(replyWaits)),
      appt: list.filter(c => live.has(c.id)).length, show: list.filter(c => (live.get(c.id) ?? []).some(v => v.state === "attended")).length,
      won: list.filter(c => c.status === "won").length, lost: list.filter(c => c.status === "lost").length,
      st, wa: list.filter(c => c.channel === "whatsapp").length, ms: list.filter(c => c.channel === "messenger").length,
      need: list.filter(c => needsReply(replyState(c, visits, now).kind)).length };
  };
  const customer = (c: CrmCustomer): OverviewCustomer => ({ id: c.id, name: c.name, status: statusOf(c), avgMin: mean(replyWaits(c)), ad: adOf(c), rep: c.assignedTo ? nameOf(c.assignedTo) : "Nobody yet", c });
  const people = (list: CrmCustomer[]): OverviewPerson[] => {
    const by = new Map<string, CrmCustomer[]>();
    for (const c of list) { const k = c.assignedTo || ""; by.set(k, [...(by.get(k) ?? []), c]); }
    return [...by].map(([id, mine]) => ({ id, name: id ? nameOf(id) : "Nobody yet", ...figs(mine),
      customers: mine.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(customer) }))
      .sort((a, b) => (!a.id ? 1 : !b.id ? -1 : b.n - a.n || a.name.localeCompare(b.name)));
  };
  const byAdM = new Map<string, CrmCustomer[]>();
  for (const c of leads) { const k = keyOf(c); byAdM.set(k, [...(byAdM.get(k) ?? []), c]); }
  const isNone = (k: string) => k.startsWith("none");
  const byAd = [...byAdM].map(([key, list]) => ({ key, name: adOf(list[0]), channel: (list.some(c => c.channel === "whatsapp") ? "whatsapp" : "messenger") as OverviewAd["channel"], ...figs(list), people: people(list) }))
    .sort((a, b) => (isNone(a.key) !== isNone(b.key) ? (isNone(a.key) ? 1 : -1) : b.n - a.n || a.name.localeCompare(b.name)));
  return { byAd, byRep: people(leads) };
}
