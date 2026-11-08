/**
 * One answer, for Calendar, Assignment › People and Team activity, to "who is this person this week": their team, the
 * days they get ad leads (Full time days), their leave, and whether they are out of the ad turn — no CRM login, locked,
 * paused, on leave now, or a Full time day that is not theirs. The same facts the dealer reads (crm_staff_locked: locked,
 * paused, on leave to the half hour; crm_fulltime_rules: a team's ticked people on its days), so the screens and the
 * dealing never disagree (docs/design_handoff_crm › Rules: "Calendar + People + Up next share one data model").
 * Times are the office's, "2026-11-06T18:00".
 */
import type { CrmData, CrmLeave, CrmPerson } from "@/lib/member/crm-data";
import { DIRECTOR_COLOUR, LEAVE_TINT, teamColour } from "./palette";
import { DIRECTOR_KEY } from "./up-next";

export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONF = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
export type Reason = CrmLeave["reason"];
export const REASONS: Reason[] = ["Annual", "Sick", "Training", "Other"];

export const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const shiftMonth = (m: string, n: number) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5) - 1 + n, 1)).toISOString().slice(0, 7);
/** Monday = 0 … Sunday = 6, of an office day. */
export const dowOf = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
export const mondayOf = (day: string) => addDays(day, -dowOf(day));
export const dd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return { d, m: MON[m - 1], y }; };
/** "Annual", "Sick" … or Other's own words. */
export const leaveWord = (l: { reason: Reason; note?: string }) => (l.reason === "Other" ? l.note || "Other" : l.reason);
/** "9 Nov 09:00 – 10 Nov 13:00", "4 Nov · 14:00–18:00". */
export const leaveRange = (l: { fromAt: string; toAt: string }) => {
  const [a, at] = l.fromAt.split("T"), [b, bt] = l.toAt.split("T"), x = dd(a), y = dd(b);
  return a === b ? `${x.d} ${x.m} · ${at}–${bt}` : `${x.d} ${x.m} ${at} – ${y.d} ${y.m} ${bt}`;
};
export const leaveTint = (r: Reason) => LEAVE_TINT[r];
/** A leave touching an office day (its first and last days count whole, as the prototype draws them). */
export const leaveOnDay = (l: CrmLeave, day: string) => l.fromAt.slice(0, 10) <= day && day <= l.toAt.slice(0, 10);

export interface BookTeam { key: string; name: string; dot: string; people: CrmPerson[] }
export type Status = "login" | "locked" | "paused" | "leave" | "active";

export interface PeopleBook {
  groups: BookTeam[];
  person(id: string): CrmPerson | undefined;
  teamOf(id: string): BookTeam;
  /** Mon–Sun: the days they get ad leads (their team's Full time row: ticked AND one of the team's days). */
  days(id: string): boolean[];
  leaves(id: string): CrmLeave[];
  leaveAt(id: string, at: string): CrmLeave | undefined;
  /** Out of the ad turn now, and why — the dealer's own order of questions. */
  status(id: string, now: string): { code: Status; label: string; leave?: CrmLeave };
  /** Some team has a Full time person on this weekday: only Full time people get leads that day (2026-10-23 rule). */
  fullTimeDay(dow: number): boolean;
  /** Who is in today's turn, else the short reason ("Not Full time", "Sick leave", "Paused", "Locked", "No CRM login"). */
  turn(id: string, now: string): { on: boolean; why: string };
}

export function peopleBook(d: CrmData, teams: { id: string; name: string; tl: CrmPerson; people: CrmPerson[] }[], directors: CrmPerson[]): PeopleBook {
  const locked = new Set(d.lockedStaff ?? []);
  const leaves = d.leaves ?? [];
  const groups: BookTeam[] = [
    ...(directors.length ? [{ key: DIRECTOR_KEY, name: "Revenue Director", dot: DIRECTOR_COLOUR[0], people: directors }] : []),
    ...teams.map((t, k) => ({ key: t.id, name: t.name, dot: teamColour(k)[0], people: [t.tl, ...t.people].filter((p, i, a) => p && a.findIndex(x => x.id === p.id) === i) })),
  ];
  const home = new Map<string, BookTeam>();
  groups.forEach(g => g.people.forEach(p => { if (!home.has(p.id)) home.set(p.id, g); }));
  const none: BookTeam = { key: "", name: "", dot: "var(--crm-faint)", people: [] };
  const days = (id: string) => {
    const r = d.ftRules.find(x => x.vals?.[id]);
    return DOW.map((_, i) => !!r && r.days.includes(i) && Number(r.vals[id]?.[String(i)] ?? 0) > 0);
  };
  const ftDays = new Set(d.ftRules.flatMap(r => r.days.filter(i => Object.values(r.vals ?? {}).some(m => Number(m?.[String(i)] ?? 0) > 0))));
  const leaveAt = (id: string, at: string) => leaves.find(l => l.staffId === id && l.fromAt <= at && at <= l.toAt);
  const person = (id: string) => d.people.find(p => p.id === id);
  const status = (id: string, now: string) => {
    const p = person(id), cur = leaveAt(id, now);
    if (p && p.login === false) return { code: "login" as const, label: "No CRM login" };
    if (locked.has(id)) return { code: "locked" as const, label: "Locked" };
    if (p?.paused) return { code: "paused" as const, label: "Paused" };
    if (cur) return { code: "leave" as const, label: `${leaveWord(cur)} leave`, leave: cur };
    return { code: "active" as const, label: "Active" };
  };
  return {
    groups, person,
    teamOf: id => home.get(id) ?? none,
    days, leaves: id => leaves.filter(l => l.staffId === id),
    leaveAt, status,
    fullTimeDay: dow => ftDays.has(dow),
    turn(id, now) {
      const s = status(id, now);
      if (s.code !== "active") return { on: false, why: s.code === "leave" ? s.label : s.label };
      const dow = dowOf(now.slice(0, 10));
      if (ftDays.has(dow) && !days(id)[dow]) return { on: false, why: "Not Full time" };
      return { on: true, why: "" };
    },
  };
}
