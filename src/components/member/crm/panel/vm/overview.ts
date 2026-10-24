/**
 * Insight (design 1a): "Hello, {name}", the Director's Control panel | My
 * CRM, the period, the rust hero (appt rate, leads, show-up, replied within
 * 24 h), the Comparison, Needs your action (Organic Leads, Awaiting reply)
 * and Team performance — the Director first, then each team; a team opens to
 * its people, a person opens their own CRM.
 */
import { urgencyOf } from "../../sales/vm/common";
import { jobTitle } from "../../shared/people";
import { comparisonVM, dateSheetVM, DIRECTOR, first, gb, inRange, ini, numbersOf, pct, periodRange, seatOf, tagOf, type PanelCtx } from "./common";

export function overviewVM(ctx: PanelCtx) {
  const { ui, set, patch, data, me, now, teams, directors } = ctx;
  const cur = periodRange(ui.period, ui.ovRange, now);
  const isC = ui.period === "custom" && !!ui.ovRange;
  const all = numbersOf(data.customers, data.visits, cur, now);
  const ofStaff = (ids: string[]) => numbersOf(data.customers.filter(c => c.assignedTo && ids.includes(c.assignedTo)), data.visits, cur, now);
  const waiting = data.customers.filter(c => urgencyOf(c, now).level !== "none");
  const owners = [...new Set(waiting.map(c => c.assignedTo).filter((x): x is string => !!x))];
  const organic = data.customers.filter(c => !c.assignedTo && !c.teamId).length;
  const cmp = comparisonVM(ctx, r => {
    const n = numbersOf(data.customers, data.visits, r, now);
    return [
      { label: "Leads", a: n.leads, fmt: x => String(x), rate: false },
      { label: "Appt rate", a: n.leads ? n.booked / n.leads : 0, fmt: x => `${Math.round(x * 100)}%`, rate: true },
      { label: "Show-up", a: n.due ? n.came / n.due : 0, fmt: x => `${Math.round(x * 100)}%`, rate: true },
      { label: "Reply 24 h", a: n.waits ? n.replied24 / n.waits : 0, fmt: x => `${Math.round(x * 100)}%`, rate: true },
    ];
  });
  const row = (id: string, name: string, who: string, c: string, ids: string[], people: typeof teams[number]["people"], tints: [string, string], list?: () => void) => {
    const s = ofStaff(ids), canOpen = people.length > 0 || !!list, open = !list && !!ui.openT[id];
    return {
      name, who, c, lead: ini(who.replace(/^(Senior TL|TL|Own customers ·)\s*/, "")), leads: s.leads, appt: pct(s.booked, s.leads), show: pct(s.came, s.due),
      canOpen, open: canOpen && open, rot: open ? "90deg" : "0deg", cur: canOpen ? "pointer" : "default",
      toggle: list ?? (canOpen ? () => set(u => ({ ...u, openT: { ...u.openT, [id]: !open } })) : undefined),
      people: people.map(p => {
        const v = ofStaff([p.id]), w = waiting.filter(x => x.assignedTo === p.id).length, lead = p.role === "tl" || p.role === "stl";
        return { name: p.name, ini: ini(p.name), aBg: lead ? tints[1] : tints[0], aFg: lead ? "#fff" : tints[1], tag: tagOf(p), waiting: w ? ` · ${w} waiting` : "",
          pad: `${p.role === "tl" ? 0 : 12}px`, leads: v.leads, appt: pct(v.booked, v.leads), show: pct(v.came, v.due),
          // The owner, 2026-10-23: a member opens the Team inbox filtered to them, still as oneself — never as them (View as is Profile's).
          open: () => set(u => ({ ...u, tab: "inbox", lead: null, inbTeam: seatOf(ctx, p.id)?.id ?? "", inbWho: p.id, inbCol: 0 })) };
      }),
    };
  };
  const dirRows = directors.length
    ? [row("hod", "Revenue Director", `Own customers · ${directors.map(d => d.name).join(", ")}`, // The Revenue Director opens the Leads list of the directors' customers, as the hero's Leads does (the owner, 2026-10-24:
      // "點rd 之後的lead 可以長這樣，再點看customer info > open chat").
      DIRECTOR.c, directors.map(d => d.id), [], [DIRECTOR.tint, DIRECTOR.c], () => patch({ cLs: "leads", cLsWho: directors.map(d => d.id) }))]
    : [];
  // 4a (T01, change list 19): the hero's four figures with their change on the comparison period — the one picked, else
  // the period before — and "vs Sep" on the period card; the greeting by the time of day.
  const D1 = 86_400_000, prevR = ui.cmp ?? (ui.period === "month" && !isC
    ? { a: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), b: new Date(now.getFullYear(), now.getMonth(), 0).getTime() }
    : { a: cur.a - (cur.b - cur.a + D1), b: cur.a - D1 });
  const P = numbersOf(data.customers, data.visits, prevR, now);
  const r100 = (x: number, y: number) => (y ? (x / y) * 100 : null);
  const pts = (a: number | null, b: number | null) => { if (a == null || b == null) return { delta: "", good: true }; const d = Math.round((a - b) * 10) / 10;
    return { delta: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)} pts vs last`, good: d >= 0 }; };
  const grow = all.leads - P.leads, growP = P.leads ? Math.round((grow / P.leads) * 100) : null;
  const hero4 = [
    { label: "Appt rate", value: pct(all.booked, all.leads), ...pts(r100(all.booked, all.leads), r100(P.booked, P.leads)) },
    { label: "Leads", open: () => patch({ cLs: "leads", cLsWho: null }), value: String(all.leads), delta: growP == null ? "" : `${growP > 0 ? "+" : growP < 0 ? "−" : "±"}${Math.abs(growP)}% vs last`, good: grow >= 0 },
    { label: "Show-up", value: pct(all.came, all.due), ...pts(r100(all.came, all.due), r100(P.came, P.due)) },
    { label: "Reply 24 h", value: pct(all.replied24, all.waits), ...pts(r100(all.replied24, all.waits), r100(P.replied24, P.waits)) },
  ];
  const vsLabel = "vs " + (ui.cmp ? gb(new Date(prevR.a), { day: "numeric", month: "short" }) : ui.period === "month" && !isC ? gb(new Date(prevR.a), { month: "short" }) : "last");
  const h = now.getHours(), greet = `Hello, ${me.role === "boss" ? "Principal" : first(me.name)}`; void h; // the owner, 2026-10-18: "改成 hello"
  return {
    hero4, vsLabel, greet,
    // The period's leads, for the list Leads opens (the owner, 2026-10-24: "點20，可以看到list").
    leadIds: data.customers.filter(c => inRange(c.createdAt, cur)).map(c => c.id),
    ...dateSheetVM(ctx),
    onOverview: ui.tab === "overview",
    exitApp: ctx.exitApp,
    meIni: ini(me.name), meFirst: me.role === "boss" ? "Principal" : first(me.name), meTitle: me.role === "boss" ? "Principal" : jobTitle(me),
    todayLabel: gb(now, { weekday: "short", day: "numeric", month: "short" }),
    rdToggle: !!ctx.toMyCrm, rdPanelBg: "#fff", rdPanelFg: "var(--crm-ink)", rdPanelSh: "0 1px 3px rgba(42,22,12,.14)",
    rdCrmBg: "transparent", rdCrmFg: "var(--crm-muted)", rdCrmSh: "none", toPanel: () => {}, toCrm: () => ctx.toMyCrm?.(),
    heroLabel: isC && ui.ovRange ? `${gb(ui.ovRange.a, { day: "numeric", month: "short" })} – ${gb(ui.ovRange.b, { day: "numeric", month: "short" })}` : { day: "Today", week: "This week", month: gb(now, { month: "long" }), custom: "" }[ui.period],
    all: { leads: all.leads, rate: pct(all.booked, all.leads), booked: all.booked },
    heroStats: ([["Leads", String(all.leads)], ["Show-up", pct(all.came, all.due)], ["Reply 24 h", pct(all.replied24, all.waits)]] as const).map(([label, v], k) => ({ label, v, fg: "#fff", bl: k ? "1px solid rgba(255,255,255,.25)" : "0" })),
    ...cmp, cmpRows: cmp.rows,
    waitingN: organic, goAssign: () => patch({ tab: "assign", lead: null }),
    awaitN: waiting.length, openAtt: () => patch({ att: true }),
    attOwners: owners.map((id, k) => ({ name: ctx.nameOf(id), ini: ini(ctx.nameOf(id)), ml: k ? "-6px" : "0" })),
    attOwnersText: owners.map(id => ctx.nameOf(id)).join(", "),
    teamRows: [...dirRows, ...teams.map(t => row(t.id, t.name, t.who, t.c, t.people.map(p => p.id), t.people, [t.tint, t.c]))],
  };
}
export type OverviewVM = ReturnType<typeof overviewVM>;
