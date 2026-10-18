/**
 * Calendar (design 1a): every showroom visit, as a list or a month grid,
 * filtered by team, person and date range, with the walnut stats card and
 * each team's share. Statuses are the salesperson CRM's — Booked → Showed up
 * (then its outcome: Follow up / Won / Lost) or No show; a past visit nobody
 * marked is To mark. A visit opens that customer's chat.
 */
import type { CrmVisit } from "@/lib/member/crm-data";
import { DAY, day0, gb, NO_SEAT, pickGroups, seatOf, stop, type PanelCtx } from "./common";

const f = (t: number) => gb(t, { day: "numeric", month: "short" });
const tm = (d: Date) => d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
const SS = { attended: ["Showed up", "var(--crm-tint-follow)", "var(--crm-brown)"], no_show: ["No show", "var(--crm-tint-attention)", "var(--crm-oxblood)"], booked: ["Booked", "var(--crm-tint-attention)", "var(--crm-rust)"], mark: ["To mark", "var(--crm-field)", "var(--crm-muted)"] } as const;
const FIN = { won: ["Won", "var(--crm-tint-follow)", "var(--crm-brown)"], follow_up: ["Follow up", "var(--crm-tint-appt)", "var(--crm-brown)"], lost: ["Lost", "var(--crm-tint-attention)", "var(--crm-oxblood)"] } as const;

export function calendarVM(ctx: PanelCtx) {
  const { ui, patch, set, data, now, nameOf } = ctx;
  const T = day0(now);
  const rgDef = { a: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), b: new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime() };
  const rg = ui.cRange ?? rgDef, ts = ui.cTeam || "all", pp = ui.cPerson;
  const owner = (v: CrmVisit) => data.customers.find(c => c.id === v.customerId)?.assignedTo ?? null;
  const all = data.visits.filter(v => v.state !== "cancelled").map(v => {
    const who = owner(v), seat = seatOf(ctx, who) ?? NO_SEAT, cu = data.customers.find(c => c.id === v.customerId);
    return { v, at: new Date(v.start), who, seat, name: cu?.name ?? "Customer", room: data.rooms.find(r => r.id === v.showroomId)?.name ?? "Showroom" };
  });
  const list = all.filter(a => { const d = day0(a.at); return d >= rg.a && d <= rg.b && (ts === "all" || a.seat.id === ts) && (!pp || a.who === pp); }).sort((x, y) => x.at.getTime() - y.at.getTime());
  const isPast = (a: typeof all[number]) => a.at <= now;
  const came = list.filter(a => a.v.state === "attended").length, no = list.filter(a => a.v.state === "no_show").length, up = list.filter(a => !isPast(a)).length;
  const statusOf = (a: typeof all[number]) => {
    if (a.v.state === "attended" && a.v.outcome && a.v.outcome in FIN) { const o = FIN[a.v.outcome as keyof typeof FIN]; return { status: o[0], sBg: o[1], sFg: o[2] }; }
    const s = SS[a.v.state === "booked" && isPast(a) ? "mark" : (a.v.state as "attended" | "no_show" | "booked")];
    return { status: s[0], sBg: s[1], sFg: s[2] };
  };
  const view = ui.cView, segv = (k: "list" | "grid", label: string) => ({ label, pick: () => patch({ cView: k }), bg: view === k ? "var(--crm-rust)" : "transparent", fg: view === k ? "#fff" : "var(--crm-muted)", w: view === k ? 500 : 400, sh: "none" });
  const sel = ui.cDay, shown = view === "grid" && sel != null ? list.filter(a => day0(a.at) === sel) : list;
  const item = (a: typeof all[number], k: number) => ({ name: a.name, who: nameOf(a.who), room: a.room, time: tm(a.at), tc: a.seat.c, rule: k ? "1px solid var(--crm-rule)" : "0", ...statusOf(a),
    // rev 1011 §5.1: a visit opens Customer info first (Open chat there), as RS rev 1010 §3.
    open: () => patch({ calInfo: a.v.customerId }) });
  const days: { day: string; color: string; items: ReturnType<typeof item>[] }[] = [];
  shown.forEach(a => {
    const lab = (day0(a.at) === T ? "Today · " : "") + gb(a.at, { weekday: "short", day: "numeric", month: "short" });
    let g = days.find(x => x.day === lab); if (!g) days.push(g = { day: lab, color: lab.startsWith("Today") ? "var(--crm-rust)" : "var(--crm-muted)", items: [] });
    g.items.push(item(a, g.items.length));
  });
  const gm = ui.cGM ?? [new Date(rg.a).getFullYear(), new Date(rg.a).getMonth()], g1 = new Date(gm[0], gm[1], 1), lead0 = (g1.getDay() + 6) % 7, rows = Math.ceil((lead0 + new Date(gm[0], gm[1] + 1, 0).getDate()) / 7);
  const teamKeys = [...(ctx.directors.length ? ["hod"] : []), ...ctx.teams.map(t => t.id)];
  const seatName = (id: string) => (id === "hod" ? "Director" : ctx.teams.find(t => t.id === id)?.name ?? "");
  const seatC = (id: string) => (id === "hod" ? "var(--crm-brown)" : ctx.teams.find(t => t.id === id)?.c ?? "var(--crm-muted)");
  // The person sheet: everyone in the chosen team (TAs book no visits).
  const inTeam = (id: string) => ts === "all" || (seatOf(ctx, id)?.id ?? "") === ts;
  const groups = pickGroups(ctx, { sel: pp, pick: id => patch({ cPerson: id, cpSheet: false }), hodLabel: "Revenue Director" })
    .map(g => ({ ...g, people: g.people.filter(p => inTeam(p.id) && ctx.data.people.find(x => x.id === p.id)?.role !== "ta") })).map(g => ({ ...g, n: g.people.length })).filter(g => g.n);
  const persons = groups.reduce((n, g) => n + g.n, 0);
  // Leads in the range (rev 1011: the hero's first figure), by the team / person chips.
  const leadsIn = data.customers.filter(c => {
    const d = day0(new Date(c.createdAt)), who = c.assignedTo ?? null;
    return d >= rg.a && d <= rg.b && (ts === "all" || (seatOf(ctx, who) ?? NO_SEAT).id === ts) && (!pp || who === pp);
  });
  const base = {
    // What the Leads / Upcoming / Showed up lists show (vm/app.ts › calendarListVM).
    cLeadIds: leadsIn.map(c => c.id),
    cUpV: list.filter(a => !isPast(a)).map(a => ({ cid: a.v.customerId, start: a.v.start })),
    cCameV: list.filter(a => a.v.state === "attended").map(a => ({ cid: a.v.customerId, start: a.v.start })),
    onCal: ui.tab === "calendar" && !ui.lead, stop,
    cRangeLabel: `${list.length} visits · ${up} upcoming`, cRangeBtn: `${f(rg.a)} – ${f(rg.b)}`,
    cTeams: [["all", "All teams", ""], ...(ctx.directors.length ? [["hod", "Director", "var(--crm-brown)"]] : []), ...ctx.teams.map(t => [t.id, t.name, t.c])].map(([k, label, dot]) => ({ label, dot,
      pick: () => patch({ cTeam: k, cPerson: "" }), on: ts === k, bg: ts === k ? "var(--crm-rust)" : "var(--crm-field)", fg: ts === k ? "#fff" : "var(--crm-ink)", bd: ts === k ? "var(--crm-rust)" : "var(--crm-field)" })),
    cPersonLabel: pp ? nameOf(pp) : "Everyone",
    cpIsOpen: ui.cpSheet, cpOpen: () => patch({ cpSheet: true }), cpClose: () => patch({ cpSheet: false }), cpGroups: groups,
    cpSub: ts === "all" ? "All teams" : seatName(ts), cpAll: { bg: pp ? "transparent" : "var(--crm-cream)", sub: `${persons} people`, pick: () => patch({ cPerson: "", cpSheet: false }) },
    cViews: [segv("grid", "Month"), segv("list", "List")], cIsGrid: view === "grid",
    // Leads (was Visits) · Upcoming · Showed up open their lists; Show-up % does not (rev 1011).
    cStats: ([["Leads", leadsIn.length, "#fff"], ["Upcoming", up, "var(--crm-peach)"], ["Showed up", came, "#fff"], ["Show-up", came + no ? `${Math.round((came / (came + no)) * 100)}%` : "—", "#fff"]] as const).map(([label, v, fg]) => ({ label, v, fg,
      open: label === "Show-up" ? undefined : () => patch({ cLs: label === "Leads" ? "leads" as const : label === "Upcoming" ? "up" as const : "came" as const }),
      cur: label === "Show-up" ? "default" : "pointer", deco: label === "Show-up" ? "none" : "underline dotted rgba(255,255,255,.5)" })),
    cByTeam: (ts === "all" ? teamKeys : [ts]).map(id => {
      const L = list.filter(a => a.seat.id === id), c = L.filter(a => a.v.state === "attended").length, n = L.filter(a => a.v.state === "no_show").length;
      return { name: seatName(id), n: L.length, rate: c + n ? `${Math.round((c / (c + n)) * 100)}%` : "—", w: `${list.length ? (L.length / list.length) * 100 : 0}%`, c: seatC(id) };
    }),
    cWk: ["M", "T", "W", "T", "F", "S", "S"], cGridTitle: gb(g1, { month: "long", year: "numeric" }),
    cPrevM: () => patch({ cGM: [gm[1] ? gm[0] : gm[0] - 1, (gm[1] + 11) % 12] }), cNextM: () => patch({ cGM: [gm[1] === 11 ? gm[0] + 1 : gm[0], (gm[1] + 1) % 12] }),
    cCells: Array.from({ length: rows * 7 }, (_, k) => {
      const d = new Date(gm[0], gm[1], 1 - lead0 + k), t = d.getTime(), on = t === sel, isT = t === T, inRg = t >= rg.a && t <= rg.b;
      return { n: d.getDate(), dots: list.filter(a => day0(a.at) === t).slice(0, 4).map(a => ({ c: a.seat.c })), edge: k % 7 ? "1px solid var(--crm-rule-soft)" : "0", bg: on ? "var(--crm-tint-attention)" : "transparent", op: inRg ? 1 : 0.4,
        dotBg: isT ? "var(--crm-rust)" : "transparent", fg: isT ? "#fff" : d.getMonth() === gm[1] ? "var(--crm-ink)" : "var(--crm-faint-2)", w: on || isT ? 700 : 500, pick: () => set(u => ({ ...u, cDay: u.cDay === t ? null : t })) };
    }),
    cDayTitle: sel != null ? gb(sel, { weekday: "long", day: "numeric", month: "long" }) : `All visits · ${rg.a === rg.b ? f(rg.a) : `${f(rg.a)} – ${f(rg.b)}`}`,
    cShowAll: sel != null, cAll: () => patch({ cDay: null }),
    cDays: days, cEmpty: !days.length,
    cOpenRange: () => patch({ crSheet: { a: rg.a, b: rg.b, cm: [new Date(rg.a).getFullYear(), new Date(rg.a).getMonth()], step: 0 } }),
    crOpen: !!ui.crSheet, crClose: () => patch({ crSheet: null }),
    crTitle: "", crPrev: () => {}, crNext: () => {}, crPresets: [] as { label: string; bd: string; bg: string; fg: string; pick: () => void }[],
    crCells: [] as { n: number; band: string; bandR: string; bg: string; sh: string; fg: string; w: number; pick: () => void }[],
    crFrom: "", crTo: "", crFromBd: "var(--crm-rule)", crToBd: "var(--crm-rule)", crApplyLabel: "", crApplyBg: "var(--crm-rust)", crApply: () => {},
  };
  const sh = ui.crSheet;
  if (!sh) return base;
  // The range sheet: presets, then tap the first day and the last.
  const cm = sh.cm, c1 = new Date(cm[0], cm[1], 1), l0 = (c1.getDay() + 6) % 7, rr = Math.ceil((l0 + new Date(cm[0], cm[1] + 1, 0).getDate()) / 7), lo = Math.min(sh.a, sh.b), hi = Math.max(sh.a, sh.b);
  const setS = (p: Partial<NonNullable<typeof sh>>) => set(u => (u.crSheet ? { ...u, crSheet: { ...u.crSheet, ...p } } : u));
  const wkS = T - ((now.getDay() + 6) % 7) * DAY;
  const P: [string, number, number][] = [["Today", T, T], ["This week", wkS, wkS + 6 * DAY], ["This month", rgDef.a, rgDef.b], ["Last 7 days", T - 6 * DAY, T], ["Last 30 days", T - 29 * DAY, T],
    ["Last month", new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 0).getTime()]];
  return {
    ...base,
    crTitle: gb(c1, { month: "long", year: "numeric" }),
    crPrev: () => setS({ cm: [cm[1] ? cm[0] : cm[0] - 1, (cm[1] + 11) % 12] }), crNext: () => setS({ cm: [cm[1] === 11 ? cm[0] + 1 : cm[0], (cm[1] + 1) % 12] }),
    crPresets: P.map(([label, a, b]) => { const on = lo === a && hi === b; return { label, bd: on ? "var(--crm-ink)" : "var(--crm-rule)", bg: on ? "var(--crm-ink)" : "#fff", fg: on ? "#fff" : "var(--crm-ink)", pick: () => patch({ cRange: { a, b }, crSheet: null, cGM: null, cDay: null }) }; }),
    crCells: Array.from({ length: rr * 7 }, (_, k) => {
      const d = new Date(cm[0], cm[1], 1 - l0 + k), t = d.getTime(), inn = t >= lo && t <= hi, end = t === lo || t === hi, col = k % 7;
      return { n: d.getDate(), band: inn && lo !== hi ? "var(--crm-tint-attention)" : "transparent",
        bandR: !inn || lo === hi ? "0" : t === lo || col === 0 ? (t === hi || col === 6 ? "20px" : "20px 0 0 20px") : t === hi || col === 6 ? "0 20px 20px 0" : "0",
        bg: end ? "var(--crm-rust)" : t === T ? "#fff" : "transparent", sh: end ? "0 3px 8px rgba(189,74,25,.30)" : t === T ? "inset 0 0 0 1.5px var(--crm-rust)" : "none",
        fg: end ? "#fff" : d.getMonth() === cm[1] ? "var(--crm-ink)" : "var(--crm-faint-2)", w: end || t === T ? 700 : 500,
        pick: () => setS(sh.step === 1 ? { b: t, step: 0 } : { a: t, b: t, step: 1 }) };
    }),
    crFrom: f(lo), crTo: sh.step === 1 ? "Pick end" : f(hi), crToBd: sh.step === 1 ? "var(--crm-rust)" : "var(--crm-rule)",
    crApplyLabel: `Show ${lo === hi ? f(lo) : `${f(lo)} – ${f(hi)}`}`,
    crApply: () => patch({ cRange: { a: lo, b: hi }, crSheet: null, cGM: null, cDay: null }),
  };
}
export type CalendarVM = ReturnType<typeof calendarVM>;
