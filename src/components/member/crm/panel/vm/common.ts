/**
 * What every Control panel screen shares: the context, the teams (a TL and
 * everyone below them) in their colours, the period and its comparison, and
 * the numbers — leads, appointment rate, show-up, replied within 24 h — worked
 * out from the customers and visits themselves.
 */
import type { Dispatch, SetStateAction, SyntheticEvent } from "react";
import type { CrmCustomer, CrmData, CrmPerson, CrmVisit } from "@/lib/member/crm-data";
import { formatIntlDate } from "@/lib/utils";
import { downlineOf, jobTitle, ROLE_ORDER, teamName, titleOf, titleShort } from "../../shared/people";
import type { PanelActions } from "../actions";
import type { PanelUi, Period, Range } from "../ui";
import type { SalesTab } from "../../sales/ui";
import { DIRECTOR_COLOUR, teamColour, URGENCY_COLOUR } from "../../shared/palette";

export const DAY = 86_400_000;
export const day0 = (d: Date | number) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
export const gb = (d: Date | number, o: Intl.DateTimeFormatOptions) => formatIntlDate(new Date(d), o, "en-GB");
export const ini = (n: string) => n.trim().split(/\s+/).map(w => w[0] ?? "").slice(0, 2).join("").toUpperCase() || "?";
export const first = (n: string) => n.trim().split(/\s+/)[0] ?? n;
/** n ways, as even as whole numbers go (the remainder to the first ones). */
export const evenShare = (n: number) => { const b = Math.floor(100 / n), r = 100 - b * n; return (k: number) => b + (k < r ? 1 : 0); };
export const stop = (e: SyntheticEvent) => e.stopPropagation();
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
export const fShort = (t: number) => gb(t, { day: "numeric", month: "short" });
export const rangeText = (r: Range) => (r.a === r.b ? fShort(r.a) : `${fShort(r.a)} – ${fShort(r.b)}`);

/** Team colours, 4a (change list 6): the Director espresso, then orange, amber, oxblood, brown and the spares — crm/shared/palette.ts. */
const hue = (k: number): [string, string, string] => { const [c, tint] = teamColour(k); return [c, tint, tint]; };
export const DIRECTOR = { c: DIRECTOR_COLOUR[0], tint: DIRECTOR_COLOUR[1], own: DIRECTOR_COLOUR[1] };

export interface Team { id: string; tl: CrmPerson; name: string; who: string; c: string; tint: string; own: string; people: CrmPerson[] }

export interface PanelCtx {
  data: CrmData;
  me: CrmPerson;
  now: Date;
  live: boolean;
  ui: PanelUi;
  set: Dispatch<SetStateAction<PanelUi>>;
  patch: (p: Partial<PanelUi>) => void;
  act: PanelActions;
  nameOf: (id: string | null | undefined) => string;
  teams: Team[];
  /** The Directors (HOD), who sell too: their own customers are the "Director" row. */
  directors: CrmPerson[];
  teamOfStaff: (id: string | null | undefined) => Team | undefined;
  /** Open someone's own CRM (View as / a tapped chat): the salesperson screens, on their customers. */
  openCrmOf: (staffId: string, customerId?: string) => void;
  /** The Director: Control panel ⇄ My CRM — on `tab` (the phone's round button: Mine's first page), else the same page. */
  toMyCrm?: (tab?: SalesTab) => void;
  exitApp: () => void;
  slotCounts: Record<string, number>;
  /** One's recent emoji, shared with Mine's chat (sales/vm/composer.ts › SharedRecents). */
  recents?: import("../../sales/vm/composer").SharedRecents;
}

/** The teams, each a TL with everyone below them, in the design's order and colours. */
export function teamsOf(data: CrmData): Team[] {
  return data.people.filter(p => p.role === "tl").sort((a, b) => a.name.localeCompare(b.name)).map((tl, k) => {
    const [c, tint, own] = hue(k);
    const people = [tl, ...downlineOf(tl.id, data.people).map(id => data.people.find(p => p.id === id)!).filter(p => p && ["tl", "ta", "rs"].includes(p.role))]
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || Number(b.fullTime) - Number(a.fullTime) || a.name.localeCompare(b.name));
    const above = data.people.find(p => p.id === tl.uplineId && p.role === "stl");
    return { id: tl.id, tl, name: teamName(tl), who: above ? `Senior TL ${above.name}` : `TL ${tl.name}`, c, tint, own, people };
  });
}

/** "RS · Full time", "TL", "Senior TL" — as the design tags people. */
export const tagOf = (p: CrmPerson) => titleShort(p) + (p.role === "rs" ? ` · ${p.fullTime ? "Full time" : "Part time"}` : "");
export const subOf = (p: CrmPerson) => titleOf(p);

/** The period on screen: today, this week (Mon–Sun), this month, or the custom range. */
export function periodRange(per: Period, custom: Range | null, now: Date): Range {
  const T = day0(now);
  if (per === "custom" && custom) return custom;
  if (per === "day") return { a: T, b: T };
  if (per === "week") { const a = T - ((now.getDay() + 6) % 7) * DAY; return { a, b: a + 6 * DAY }; }
  return { a: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), b: new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime() };
}
export const inRange = (iso: string, r: Range) => { const t = day0(new Date(iso)); return t >= r.a && t <= r.b; };

export interface Numbers { leads: number; booked: number; came: number; due: number; noshow: number; replied24: number; waits: number }

/** The numbers of some customers over a range. */
export function numbersOf(customers: CrmCustomer[], visits: CrmVisit[], r: Range, now: Date): Numbers {
  const ids = new Set(customers.map(c => c.id));
  const leads = customers.filter(c => inRange(c.createdAt, r));
  const booked = leads.filter(c => visits.some(v => v.customerId === c.id && v.state !== "cancelled")).length;
  const vs = visits.filter(v => ids.has(v.customerId) && v.state !== "cancelled" && inRange(v.start, r));
  const due = vs.filter(v => v.state !== "booked" || new Date(v.start) <= now);
  // Replied within 24 h: each wait the customer started in the range, answered within a day (auto-replies don't count).
  let waits = 0, replied24 = 0;
  for (const c of customers) {
    let wait: number | null = null;
    for (const m of c.messages) {
      const t = new Date(m.at).getTime();
      if (m.from === "lead" && wait == null) { wait = t; if (inRange(m.at, r)) waits++; }
      if (m.from === "me" && !m.auto && wait != null) { if (inRange(new Date(wait).toISOString(), r) && t - wait <= DAY) replied24++; wait = null; }
    }
  }
  return { leads: leads.length, booked, came: vs.filter(v => v.state === "attended").length, due: due.length, noshow: vs.filter(v => v.state === "no_show").length, replied24, waits };
}

/* ── The date sheet: Period and Compare to (Overview, Ads Performance) ──── */

export function presets(now: Date): Record<"day" | "week" | "month", Range> & { last7: Range; last30: Range; lastMonth: Range } {
  const T = day0(now);
  return {
    day: periodRange("day", null, now), week: periodRange("week", null, now), month: periodRange("month", null, now),
    last7: { a: T - 6 * DAY, b: T }, last30: { a: T - 29 * DAY, b: T },
    lastMonth: { a: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), b: new Date(now.getFullYear(), now.getMonth(), 0).getTime() },
  };
}

export function dateSheetVM(ctx: PanelCtx) {
  const { ui, patch, set, now } = ctx;
  const isC = ui.period === "custom" && !!ui.ovRange, P = presets(now), T = day0(now);
  const cur = periodRange(ui.period, ui.ovRange, now);
  const ovRgTxt = isC && ui.ovRange ? rangeText(ui.ovRange) : "";
  const perT = isC ? "Custom" : { day: "Today", week: "This week", month: "This month", custom: "This month" }[ui.period];
  const perD = isC ? ovRgTxt : ui.period === "day" ? gb(now, { weekday: "short", day: "numeric", month: "short" }) : ui.period === "week" ? rangeText(P.week) : gb(now, { month: "long", year: "numeric" });
  const sh = ui.ovSheet, setS = (p: Partial<NonNullable<PanelUi["ovSheet"]>>) => set(u => (u.ovSheet ? { ...u, ovSheet: { ...u.ovSheet, ...p } } : u));
  const open = (only: boolean, tab: "a" | "b") => patch({ ovSheet: { a: cur.a, b: cur.b, per: isC ? null : (ui.period as "day" | "week" | "month"), ca: ui.cmp?.a ?? null, cb: ui.cmp?.b ?? null, tab, only, cm: [new Date(cur.a).getFullYear(), new Date(cur.a).getMonth()], step: 0 } });
  const base = {
    stop,
    adPerT: perT, adPerD: perD,
    ovOpenPeriod: () => open(true, "a"), ovOpenRange: () => open(false, "a"),
    ovCanClear: isC || !!ui.cmp || ui.period !== "month",
    ovClear: (e?: SyntheticEvent) => { e?.stopPropagation(); patch({ period: "month", ovRange: null, cmp: null, ovSheet: null }); },
    ovrOpen: !!sh, ovrShowTabs: !(sh?.only), ovrClose: () => patch({ ovSheet: null }), ovrWk: ["M", "T", "W", "T", "F", "S", "S"],
    ovrTabs: [] as { label: string; dot: string; pick: () => void; bg: string; fg: string; w: number; sh: string }[],
    ovrPresets: [] as { label: string; pick: () => void; bg: string; fg: string; bd: string }[],
    ovrCells: [] as { n: number; band: string; bandR: string; bg: string; sh: string; fg: string; w: number; pick?: () => void }[],
    ovrTitle: "", ovrPrev: () => {}, ovrNext: () => {}, ovrFromLbl: "From", ovrToLbl: "To", ovrFrom: "", ovrTo: "", ovrFromBd: "var(--crm-rule)", ovrToBd: "var(--crm-rule)",
    ovrApplyLabel: "", ovrApplyBg: "var(--crm-rust)", ovrApply: () => {},
  };
  if (!sh) return base;
  const onB = sh.tab === "b", A0 = Math.min(sh.a, sh.b), A1 = Math.max(sh.a, sh.b), hasB = sh.ca != null && sh.cb != null;
  const lo = onB ? (hasB ? Math.min(sh.ca!, sh.cb!) : null) : A0, hi = onB ? (hasB ? Math.max(sh.ca!, sh.cb!) : null) : A1;
  const cm = sh.cm, c1 = new Date(cm[0], cm[1], 1), l0 = (c1.getDay() + 6) % 7, rr = Math.ceil((l0 + new Date(cm[0], cm[1] + 1, 0).getDate()) / 7);
  const ACC = "var(--crm-rust)", BAND = "var(--crm-tint-attention)";
  const list: [string, Range, "day" | "week" | "month" | null][] = [["Today", P.day, "day"], ["This week", P.week, "week"], ["This month", P.month, "month"], ["Last 7 days", P.last7, null], ["Last 30 days", P.last30, null], ["Last month", P.lastMonth, null]];
  const cLo = hasB ? Math.min(sh.ca!, sh.cb!) : null, cHi = hasB ? Math.max(sh.ca!, sh.cb!) : null;
  return {
    ...base,
    ovrTitle: gb(c1, { month: "long", year: "numeric" }),
    ovrTabs: ([["a", "Period", "var(--crm-rust)"], ["b", "Compare to", "var(--crm-st-won)"]] as const).map(([k, label, dot]) => ({ label, dot,
      pick: () => { const ref = k === "b" ? (hasB ? new Date(cLo!) : new Date(new Date(A0).getFullYear(), new Date(A0).getMonth() - 1, 1)) : new Date(A0); setS({ tab: k, step: 0, cm: [ref.getFullYear(), ref.getMonth()] }); },
      bg: sh.tab === k ? "#fff" : "transparent", fg: sh.tab === k ? "var(--crm-ink)" : "var(--crm-muted)", w: sh.tab === k ? 650 : 500, sh: sh.tab === k ? "0 1px 3px rgba(42,22,12,.12)" : "none" })),
    ovrPrev: () => setS({ cm: [cm[1] ? cm[0] : cm[0] - 1, (cm[1] + 11) % 12] }), ovrNext: () => setS({ cm: [cm[1] === 11 ? cm[0] + 1 : cm[0], (cm[1] + 1) % 12] }),
    ovrPresets: list.map(([label, r, per]) => {
      const on = onB ? hasB && cLo === r.a && cHi === r.b : per ? sh.per === per : !sh.per && A0 === r.a && A1 === r.b;
      return { label, bg: on ? "var(--crm-ink)" : "#fff", fg: on ? "#fff" : "var(--crm-ink)", bd: on ? "var(--crm-ink)" : "var(--crm-rule)",
        pick: () => (onB ? setS({ ca: r.a, cb: r.b, step: 0 }) : setS({ a: r.a, b: r.b, per, step: 0 })) };
    }),
    ovrCells: Array.from({ length: rr * 7 }, (_, k) => {
      const d = new Date(cm[0], cm[1], 1 - l0 + k), t = d.getTime(), has = lo != null && hi != null, inn = has && t >= lo! && t <= hi!, end = has && (t === lo || t === hi), col = k % 7;
      return { n: d.getDate(), band: inn && lo !== hi ? BAND : "transparent",
        bandR: !inn || lo === hi ? "0" : t === lo || col === 0 ? (t === hi || col === 6 ? "20px" : "20px 0 0 20px") : t === hi || col === 6 ? "0 20px 20px 0" : "0",
        bg: end ? ACC : t === T ? "#fff" : "transparent", sh: end ? "0 3px 8px rgba(42,22,12,.22)" : t === T ? "inset 0 0 0 1.5px var(--crm-rust)" : "none",
        fg: end ? "#fff" : t > T ? "var(--crm-line)" : d.getMonth() === cm[1] ? "var(--crm-ink)" : "var(--crm-faint-2)", w: end || t === T ? 700 : 500,
        pick: t > T ? undefined : () => (onB ? setS(sh.step === 1 ? { cb: t, step: 0 } : { ca: t, cb: t, step: 1 }) : setS(sh.step === 1 ? { b: t, step: 0, per: null } : { a: t, b: t, step: 1, per: null })) };
    }),
    ovrFrom: lo == null ? "—" : fShort(lo), ovrTo: lo == null || hi == null ? "—" : sh.step === 1 ? "Pick end" : fShort(hi), ovrToBd: sh.step === 1 ? ACC : "var(--crm-rule)",
    ovrApplyLabel: onB && hasB ? `Compare ${rangeText({ a: cLo!, b: cHi! })}` : `Show ${rangeText({ a: A0, b: A1 })}`,
    ovrApply: () => patch({ period: sh.per ?? "custom", ovRange: sh.per ? ui.ovRange : { a: A0, b: A1 }, cmp: hasB ? { a: cLo!, b: cHi! } : null, ovSheet: null }),
  };
}

/** The Comparison card: the period against another, by the same rules. */
export function comparisonVM(ctx: PanelCtx, rows: (r: Range) => { label: string; a: number; fmt: (x: number) => string; rate: boolean }[]) {
  const { ui, patch, now } = ctx;
  const cur = periodRange(ui.period, ui.ovRange, now), c = ui.cmp;
  const cmpPick = () => patch({ ovSheet: { a: cur.a, b: cur.b, per: ui.period === "custom" ? null : (ui.period as "day" | "week" | "month"), ca: c?.a ?? null, cb: c?.b ?? null, tab: "b", only: true,
    cm: c ? [new Date(c.a).getFullYear(), new Date(c.a).getMonth()] : [new Date(cur.a).getMonth() ? new Date(cur.a).getFullYear() : new Date(cur.a).getFullYear() - 1, (new Date(cur.a).getMonth() + 11) % 12], step: 0 } });
  if (!c) return { cmpOn: true, cmpHas: false, cmpNone: true, cmpOpen: false, cmpPick, cmpA: rangeText(cur), cmpB: "", cmpOff: () => {}, cmpToggle: () => {}, cmpToggleLbl: "", cmpRot: "0deg", rows: [] as CmpRow[] };
  const A = rows(cur), B = rows(c);
  const out: CmpRow[] = A.map((r, k) => {
    const a = r.a, b = B[k].a, d = r.rate ? Math.round((a - b) * 100) : b ? Math.round(((a - b) / b) * 100) : 0, up = d >= 0;
    return { label: r.label, vA: r.fmt(a), vB: r.fmt(b), delta: `${up ? "+" : "−"}${Math.abs(d)}%`, dBg: d === 0 ? "var(--crm-field)" : up ? "var(--crm-tint-follow)" : "var(--crm-tint-attention)", dFg: d === 0 ? "var(--crm-muted)" : up ? "var(--crm-brown)" : "var(--crm-oxblood)", rule: k ? "1px solid var(--crm-rule)" : "0" };
  });
  return { cmpOn: true, cmpHas: true, cmpNone: false, cmpPick, cmpOpen: !ui.cmpFold, cmpA: rangeText(cur), cmpB: rangeText(c),
    cmpToggleLbl: ui.cmpFold ? "Show" : "Hide", cmpRot: ui.cmpFold ? "0deg" : "180deg", cmpToggle: () => patch({ cmpFold: !ui.cmpFold }), cmpOff: () => patch({ cmp: null }), rows: out };
}
export interface CmpRow { label: string; vA: string; vB: string; delta: string; dBg: string; dFg: string; rule: string }

/* ── People, as the panel groups them ─────────────────────────────────── */

/** Where a person sits on the panel: their team, "Director" for a HOD, or nowhere (a Senior TL above the teams, say). */
export interface Seat { id: string; name: string; c: string; tint: string; own: string }
export function seatOf(ctx: PanelCtx, staffId: string | null | undefined): Seat | null {
  if (!staffId) return null;
  if (ctx.directors.some(d => d.id === staffId)) return { id: "hod", name: "Director", ...DIRECTOR };
  const t = ctx.teamOfStaff(staffId);
  return t ? { id: t.id, name: t.name, c: t.c, tint: t.tint, own: t.own } : null;
}
export const NO_SEAT: Seat = { id: "", name: "", c: "var(--crm-muted)", tint: "var(--crm-field)", own: "var(--crm-field)" };

/** "Revenue Specialist · Full time" — the sheets' second line. */
export const subLine = (p: CrmPerson) => (p.role === "hod" ? `${jobTitle(p)} · sells too` : subOf(p));
const sortKey = (p: CrmPerson) => ROLE_ORDER[p.role] * 2 + (p.role === "rs" && !p.fullTime ? 1 : 0);

export interface PickRow { id: string; label: string; c: string; sub: string; on: boolean; ring: string; dot: string; bg: string; r: string; pick: () => void }
export interface PickGroup { name: string; c: string; n: number; people: PickRow[] }
/**
 * The Send-to / Move / Reassign list (design 1a): HOD first, then each team —
 * Senior TL, TL, TA, RS, full time before part time — leaving out `skip`.
 * Anyone who takes enquiries but sits in no team (a Senior TL above the
 * teams) comes last under "Others", so nobody is unreachable.
 */
export function pickGroups(ctx: PanelCtx, o: { skip?: string | null; sel?: string | null; pick: (id: string) => void; hodLabel?: string }): PickGroup[] {
  const row = (p: CrmPerson, c: string): PickRow => {
    const on = o.sel === p.id;
    return { id: p.id, label: p.name, c, sub: subLine(p), on, ring: on ? "var(--crm-rust)" : "var(--crm-line)", dot: on ? "var(--crm-rust)" : "transparent", bg: on ? "var(--crm-cream)" : "transparent", r: "12px", pick: () => o.pick(p.id) };
  };
  const groups: PickGroup[] = [];
  // The Principal can be given a customer too since 2026-10-13 (their Mine); listed first, only where CRM · Manage sends.
  const boss = ctx.data.can.manage ? ctx.data.people.filter(p => p.role === "boss" && p.id !== o.skip).map(p => row(p, "var(--crm-ink)")) : [];
  if (boss.length) groups.push({ name: "Principal", c: "var(--crm-ink)", n: boss.length, people: boss });
  const dirs = ctx.directors.filter(d => d.id !== o.skip).map(d => row(d, DIRECTOR.c));
  if (dirs.length) groups.push({ name: o.hodLabel ?? "HOD", c: DIRECTOR.c, n: dirs.length, people: dirs });
  for (const t of ctx.teams) {
    const ps = t.people.filter(p => p.id !== o.skip).sort((a, b) => sortKey(a) - sortKey(b)).map(p => row(p, t.c));
    if (ps.length) groups.push({ name: t.name, c: t.c, n: ps.length, people: ps });
  }
  const seated = new Set([...ctx.directors.map(d => d.id), ...ctx.teams.flatMap(t => t.people.map(p => p.id))]);
  const rest = ctx.data.people.filter(p => !seated.has(p.id) && p.id !== o.skip && ["stl", "tl", "ta", "rs"].includes(p.role)).sort((a, b) => sortKey(a) - sortKey(b) || a.name.localeCompare(b.name)).map(p => row(p, "var(--crm-muted)"));
  if (rest.length) groups.push({ name: "Others", c: "var(--crm-muted)", n: rest.length, people: rest });
  return groups;
}

/** The waits on screen: every customer whose reply is due, most urgent first (3 h · 6 h · 9 h). */
export const LEVELS = [["overdue", "Overdue", URGENCY_COLOUR.overdue], ["urgent", "Urgent", URGENCY_COLOUR.urgent], ["soon", "Reply soon", URGENCY_COLOUR.soon]] as const;
export type Level = typeof LEVELS[number][0];
