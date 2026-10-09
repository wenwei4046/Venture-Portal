/**
 * Insight (design 1a): "Hello, {name}", the Director's Control panel | My
 * CRM, the period, the rust hero (appt rate, leads, show-up, replied within
 * 24 h), the Comparison, Needs your action (Organic Leads, Awaiting reply)
 * and Team performance — the Director first, then each team; a team opens to
 * its people, a person opens their own CRM.
 */
import { urgencyOf } from "../../sales/vm/common";
import { jobTitle } from "../../shared/people";
import { comparisonVM, dateSheetVM, DIRECTOR, first, gb, ini, numbersOf, pct, periodRange, tagOf, type PanelCtx } from "./common";

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
  const row = (id: string, name: string, who: string, c: string, ids: string[], people: typeof teams[number]["people"], tints: [string, string]) => {
    const s = ofStaff(ids), canOpen = people.length > 0, open = !!ui.openT[id];
    return {
      name, who, c, lead: ini(who.replace(/^(Senior TL|TL|Own customers ·)\s*/, "")), leads: s.leads, appt: pct(s.booked, s.leads), show: pct(s.came, s.due),
      canOpen, open: canOpen && open, rot: open ? "90deg" : "0deg", cur: canOpen ? "pointer" : "default",
      toggle: canOpen ? () => set(u => ({ ...u, openT: { ...u.openT, [id]: !open } })) : undefined,
      people: people.map(p => {
        const v = ofStaff([p.id]), w = waiting.filter(x => x.assignedTo === p.id).length, lead = p.role === "tl" || p.role === "stl";
        return { name: p.name, ini: ini(p.name), aBg: lead ? tints[1] : tints[0], aFg: lead ? "#fff" : tints[1], tag: tagOf(p), waiting: w ? ` · ${w} waiting` : "",
          pad: `${p.role === "tl" ? 0 : 12}px`, leads: v.leads, appt: pct(v.booked, v.leads), show: pct(v.came, v.due), open: () => ctx.openCrmOf(p.id) };
      }),
    };
  };
  const dirRows = directors.length
    ? [row("hod", "HOD", `Own customers · ${directors.map(d => d.name).join(", ")}`, DIRECTOR.c, directors.map(d => d.id), [], [DIRECTOR.tint, DIRECTOR.c])]
    : [];
  return {
    ...dateSheetVM(ctx),
    onOverview: ui.tab === "overview",
    exitApp: ctx.exitApp,
    meIni: ini(me.name), meFirst: me.role === "boss" ? "Principal" : first(me.name), meTitle: me.role === "boss" ? "Principal" : jobTitle(me),
    todayLabel: gb(now, { weekday: "short", day: "numeric", month: "short" }),
    rdToggle: me.role === "hod", rdPanelBg: "#fff", rdPanelFg: "#3F2B22", rdPanelSh: "0 1px 3px rgba(63,43,34,.14)",
    rdCrmBg: "transparent", rdCrmFg: "#806B60", rdCrmSh: "none", toPanel: () => {}, toCrm: () => ctx.toMyCrm?.(),
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
