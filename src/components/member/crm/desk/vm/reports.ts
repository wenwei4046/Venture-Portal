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

export type RpPeriod = "week" | "month" | "last" | "all";
export const RP_PERIODS: [RpPeriod, string][] = [["week", "This week"], ["month", "This month"], ["last", "Last month"], ["all", "All time"]];
const DAY = 86_400_000;

/** The period's first and last moment (local days; the week from Monday). */
export function periodRange(p: RpPeriod, now: Date): [number, number] {
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (p === "week") return [T - ((now.getDay() + 6) % 7) * DAY, T + DAY - 1];
  if (p === "month") return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), T + DAY - 1];
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
  const showed = n("Showed up") + n("Won") + n("Follow up") + n("Lost");
  // The rate counts a customer once (2026-10-27): came at least once, of those who came or were marked No show.
  const whoOf = (v: ApptVisit, i: number) => v.who ?? `#${i}`, CAME = ["Showed up", "Won", "Follow up", "Lost"];
  const cameC = new Set(vs.map((v, i) => CAME.includes(v.outcome) ? whoOf(v, i) : null).filter(Boolean));
  const markedC = new Set([...cameC, ...vs.map((v, i) => v.outcome === "No show" ? whoOf(v, i) : null).filter(Boolean)]);
  const times = [...new Set(vs.map(v => v.at.getHours() * 60 + v.at.getMinutes()))].sort((a, b) => a - b)
    .map(m => new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }));
  const timeOf = (v: ApptVisit) => v.at.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  return {
    figures: { booked: vs.length - n("Cancelled"), upcoming: n("Upcoming"), showed, noShow: n("No show"), toMark: n("To mark"), cancelled: n("Cancelled"), showRate: rate(cameC.size, markedC.size) },
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
    byChannel: breakdown(leads, channelName), byAd: breakdown(leads, c => (c.adId ? c.ad || "Ad" : "No ad")),
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
