/**
 * Calendar (CRM Desktop rev 1, E1–E2): Month · Week · Day · Upcoming, Today's appt, teams, people (several at once),
 * showroom and a date range; the dark figures open their customers. Ported from the prototype on the real calendar:
 * its "October 2026", "today = 12" are the office's month and day.
 */
import { showRateOnce } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";
import { initials, visitRows, type VisitRow } from "./data";
import { calendarAnalysisVM } from "./analysis";
import { DIRECTOR_C, DIRECTOR_TEAM, ST, teamColours } from "./tokens";
import { MON } from "./insight";

const DAY = 86_400_000;
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const fmt = (t: number) => `${new Date(t).getDate()} ${MON[new Date(t).getMonth()].slice(0, 3)}`;
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fromIso = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; };
const short = (d: Date) => d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "");
const timeOf = (d: Date) => d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });

export function calendarVM(ctx: DeskCtx) {
  const { ui, set, patch, now, teams, data } = ctx;
  const T = day0(now);
  const monthA = new Date(now.getFullYear(), now.getMonth(), 1).getTime(), monthB = new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime();
  const wkA = T - ((now.getDay() + 6) % 7) * DAY, wkB = wkA + 6 * DAY;
  const view = ui.calView, team = ui.calTeam;
  const r: [number, number] = ui.calRange ?? [monthA, monthB];
  const teamColour = (name: string | null): [string, string] => {
    if (name === DIRECTOR_TEAM) return DIRECTOR_C;
    const k = teams.findIndex(t => t.name === name);
    return k < 0 ? ["var(--crm-muted)", "var(--crm-field)"] : teamColours(k);
  };
  const all = visitRows(ctx);
  const vs = all.filter(v => team === "all" || v.team === team)
    .filter(v => ui.calShowroom === "all" || v.v.showroomId === ui.calShowroom)
    .filter(v => !ui.calWho.length || (!!v.repId && ui.calWho.includes(v.repId)))
    .filter(v => { const d = day0(v.at); return d >= r[0] && d <= r[1]; });
  // 4a's visit blocks (change list 14): Came filled ink, Booked amber on its tint, No-show a dashed outline — told apart in greyscale.
  const lookOf = (s: VisitRow["status"]) => s === "No show" ? { bg: "transparent", fg: "var(--crm-faint)", bd: "var(--crm-faint)", bs: "dashed" }
    : s === "Booked" || s === "To mark" ? { bg: "var(--crm-tint-appt)", fg: "var(--crm-ink)", bd: "var(--crm-amber-line)", bs: "solid" }
      : { bg: "var(--crm-ink)", fg: "#fff", bd: "var(--crm-ink)", bs: "solid" };
  const item = (v: VisitRow) => { const st = ST[v.status] ?? ST.Booked, [ink, tint] = teamColour(v.team);
    return { time: timeOf(v.at), short: short(v.at), name: v.name, who: `${v.rep} · ${v.room}`, rep: v.rep, room: v.room, status: v.status, stBg: st[0], stFg: st[1], color: ink, tint, look: lookOf(v.status),
      hour: v.at.getHours() + v.at.getMinutes() / 60, mins: v.v.minutes || 60,
      open: () => patch({ pane: "docked", kind: "info", visit: v.id, infoId: null }) }; };
  // A partner's bookings through its link (mig 20261029190000): on the calendar beside the visits, in their own colour —
  // no CRM customer behind them, so they follow the showroom filter and leave when a team or people are picked.
  const partnerNames = new Map((data.partnerLinks ?? []).map(l => [l.id, l.name]));
  const partners = (data.partnerBookings ?? []).filter(b => b.state === "booked" && team === "all" && !ui.calWho.length && (ui.calShowroom === "all" || b.showroomId === ui.calShowroom))
    .map(b => ({ b, at: new Date(b.start) })).sort((x, y) => x.at.getTime() - y.at.getTime());
  const pItem = ({ b, at }: (typeof partners)[number]) => { const room = data.rooms.find(x => x.id === b.showroomId)?.name ?? "Showroom", who = partnerNames.get(b.partner) ?? (b.partner === "the_conts" ? "The Conts" : "Partner");
    return { time: timeOf(at), short: short(at), name: `${b.customer || b.ref} · ${who}`, who: `${b.booker} · ${room}`, rep: b.booker, room, status: "Booked" as VisitRow["status"], stBg: "var(--crm-peach-soft)", stFg: "var(--crm-brown)",
      color: "var(--crm-brown)", tint: "var(--crm-peach-soft)", look: { bg: "var(--crm-peach-soft)", fg: "var(--crm-brown)", bd: "var(--crm-brown)", bs: "dotted" },
      hour: at.getHours() + at.getMinutes() / 60, mins: b.minutes || 60, open: () => patch({ pane: "docked", kind: "partner", partner: b.id, visit: null, infoId: null }) }; };
  const pOn = (t: number) => partners.filter(p => day0(p.at) === t && t >= r[0] && t <= r[1]).map(pItem);
  const byTime = <X extends { hour: number }>(xs: X[]) => xs.sort((a, b) => a.hour - b.hour);

  // The month on screen: the range's month (the prototype: October with 28–30 Sep and 1 Nov around it).
  const mA = new Date(new Date(r[0]).getFullYear(), new Date(r[0]).getMonth(), 1), lead = (mA.getDay() + 6) % 7, days = new Date(mA.getFullYear(), mA.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((lead + days) / 7);
  const monthCells = Array.from({ length: rows * 7 }, (_, k) => {
    const d = new Date(mA.getFullYear(), mA.getMonth(), 1 - lead + k), t = d.getTime(), muted = d.getMonth() !== mA.getMonth();
    return { num: d.getDate(), bg: muted ? "var(--crm-page)" : "#fff", numBg: !muted && t === T ? "var(--crm-rust)" : "transparent", numFg: muted ? "var(--crm-faint-2)" : t === T ? "#fff" : "var(--crm-ink)",
      visits: muted ? [] : byTime([...vs.filter(v => day0(v.at) === t).map(item), ...pOn(t)]) };
  });
  const weekCols = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((dow, k) => { const t = wkA + k * DAY, n = new Date(t).getDate();
    return { dow, num: n, fg: t === T ? "var(--crm-rust)" : "var(--crm-ink)", bd: t === T ? "var(--crm-rust)" : "var(--crm-rule)", visits: byTime([...vs.filter(v => day0(v.at) === t).map(item), ...pOn(t)]) }; });
  // Day: the showrooms' own times today (the prototype: 11 am – 7 pm), each free or with its visits.
  const room = ui.calShowroom === "all" ? undefined : data.rooms.find(x => x.id === ui.calShowroom);
  const dow = (now.getDay() + 6) % 7;
  const slotTimes = [...new Set((room ? [room] : data.rooms.filter(x => x.active)).flatMap(x => x.slots.filter(s => !s.includes("@") || s.split("@")[1].includes(String(dow))).map(s => s.split("@")[0])))].sort();
  const today = vs.filter(v => day0(v.at) === T);
  const daySlots = slotTimes.map(hm => { const [h, m] = hm.split(":").map(Number), at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    const list = [...today.filter(v => v.at.getHours() === h && v.at.getMinutes() === m).map(item), ...pOn(T).filter(x => x.hour === h + m / 60)];
    return { time: timeOf(at), visits: list, free: !list.length }; });
  const cap = room?.cap ?? Math.max(1, ...data.rooms.filter(x => x.active).map(x => x.cap));
  const upcoming = vs.filter(v => view === "today" ? day0(v.at) === T : day0(v.at) >= T);
  const dayKeys = [...new Set([...upcoming.map(v => v.at), ...partners.filter(p => view === "today" ? day0(p.at) === T : day0(p.at) >= T).map(p => p.at)].map(day0))].sort((a, b) => a - b);
  const upDays = dayKeys.map(t => ({ label: (t === T ? "Today · " : "") + new Date(t).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" }),
    fg: t === T ? "var(--crm-rust)" : "var(--crm-muted)", visits: byTime([...upcoming.filter(v => day0(v.at) === t).map(item), ...partners.filter(p => day0(p.at) === t).map(pItem)]) }));
  const teamsList: [string, string, string | null][] = [["all", "All teams", null], ...(ctx.directors.length ? [[DIRECTOR_TEAM, DIRECTOR_TEAM, DIRECTOR_C[0]] as [string, string, string]] : []),
    ...teams.map((t, k) => [t.name, t.name, teamColours(k)[0]] as [string, string, string])];
  const due = vs.filter(v => v.at <= now), showed = vs.filter(v => v.v.state === "attended").length, noShow = vs.filter(v => v.v.state === "no_show").length;
  const leads = data.customers.filter(c => { const d = day0(new Date(c.createdAt)); return d >= r[0] && d <= r[1]; })
    .filter(c => team === "all" || (c.assignedTo ? visitTeam(ctx, c.assignedTo) === team : false))
    .filter(c => !ui.calWho.length || (!!c.assignedTo && ui.calWho.includes(c.assignedTo)));
  const same = (a: [number, number]) => a[0] === r[0] && a[1] === r[1];
  const P: [string, [number, number], string][] = [["This month", [monthA, monthB], `${fmt(monthA)} – ${fmt(monthB)}`], ["This week", [wkA, wkB], `${fmt(wkA)} – ${fmt(wkB)}`],
    ["Today", [T, T], new Date(T).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })], ["Next 7 days", [T, T + 6 * DAY], `${fmt(T)} – ${fmt(T + 6 * DAY)}`],
    ["Last week", [wkA - 7 * DAY, wkA - DAY], `${fmt(wkA - 7 * DAY)} – ${fmt(wkA - DAY)}`],
    // v2: Next month.
    ["Next month", [new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 2, 0).getTime()],
      `${fmt(new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime())} – ${fmt(new Date(now.getFullYear(), now.getMonth() + 2, 0).getTime())}`]];
  // People: everyone by team (the Director's own first), several at once.
  const sel = ui.calWho;
  const opt = (label: string, val: string | null, av: [string, string]) => { const on = val ? sel.includes(val) : !sel.length;
    return { head: false, color: "", sel: on, unsel: !on, label, ini: val ? initials(label) : "ALL", avBg: av[0], avFg: av[1],
      pick: () => set(u => ({ ...u, calWho: !val ? [] : u.calWho.includes(val) ? u.calWho.filter(x => x !== val) : [...u.calWho, val] })) }; };
  type O = ReturnType<typeof opt> | { head: true; sel: false; unsel: false; label: string; color: string };
  const calWhoOpts: O[] = [opt("Everyone", null, ["var(--crm-field)", "var(--crm-muted)"])];
  if (ctx.directors.length) { calWhoOpts.push({ head: true, sel: false, unsel: false, label: DIRECTOR_TEAM.toUpperCase(), color: DIRECTOR_C[0] }); ctx.directors.forEach(d => calWhoOpts.push(opt(d.name, d.id, [DIRECTOR_C[1], DIRECTOR_C[0]]))); }
  teams.forEach((t, k) => { const [ink, tint] = teamColours(k); calWhoOpts.push({ head: true, sel: false, unsel: false, label: t.name.toUpperCase(), color: ink });
    t.people.forEach(p => calWhoOpts.push(opt(p.name, p.id, [tint, ink]))); });
  const n0 = sel[0] ? ctx.nameOf(sel[0]) : "";
  const label = (t: number) => new Date(t).toLocaleDateString("en-MY", { day: "numeric", month: "numeric" });
  return {
    kCal: ui.tab === "calendar",
    rangeLabel: r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])} – ${fmt(r[1])}`, rangeOpen: ui.rangeOpen, toggleRange: () => set(u => ({ ...u, rangeOpen: !u.rangeOpen })),
    rangeOpts: P.map(([l, rr, hint]) => ({ label: l, hint, bg: same(rr) ? "var(--crm-tint-attention)" : "transparent", fg: same(rr) ? "var(--crm-rust)" : "var(--crm-ink)", pick: () => patch({ calRange: rr, rangeOpen: false }) })),
    rangeFrom: iso(r[0]), rangeTo: iso(r[1]),
    setFrom: (e: { target: { value: string } }) => { const t = fromIso(e.target.value); if (t != null) patch({ calRange: [t, Math.max(t, r[1])] }); },
    setTo: (e: { target: { value: string } }) => { const t = fromIso(e.target.value); if (t != null) patch({ calRange: [Math.min(r[0], t), t] }); },
    calWhoOpts, calWhoOpen: ui.calWhoOpen, toggleCalWho: () => set(u => ({ ...u, calWhoOpen: !u.calWhoOpen })), calWhoClear: () => patch({ calWho: [] }),
    calWhoLabel: !sel.length ? "Everyone" : sel.length === 1 ? n0 : `${n0} +${sel.length - 1}`,
    calShowroom: ui.calShowroom, pickShowroom: (e: { target: { value: string } }) => patch({ calShowroom: e.target.value }),
    showroomOpts: [{ v: "all", label: "All showrooms" }, ...data.rooms.filter(x => x.active).map(x => ({ v: x.id, label: x.name }))],
    calTeams: teamsList.map(([k, l, dot]) => ({ label: l, dot, bg: k === team ? "var(--crm-ink)" : "#fff", fg: k === team ? "#fff" : "var(--crm-ink)", bd: k === team ? "var(--crm-ink)" : "var(--crm-rule)", pick: () => patch({ calTeam: k }) })),
    calViews: ([["month", "Month"], ["week", "Week"], ["day", "Day"], ["upcoming", "Upcoming"]] as const).map(([k, l]) => ({ label: l, on: k === view, off: k !== view,
      pick: () => patch({ calView: k, calRange: k === "month" ? [monthA, monthB] : k === "week" ? [wkA, wkB] : k === "day" ? [T, T] : [T, monthB] }) })),
    goToday: () => patch({ calView: "today", calRange: [T, T] }), todayN: all.filter(v => day0(v.at) === T).length,
    todayBg: view === "today" ? "var(--crm-tint-attention)" : "#fff", todayBd: view === "today" ? "var(--crm-rust)" : "var(--crm-line)",
    calMonth: view === "month", calWeek: view === "week", calDay: view === "day", calUp: view === "upcoming" || view === "today",
    calTitle: view === "month" ? `${MON[mA.getMonth()]} ${mA.getFullYear()}` : view === "week" ? `${label(wkA)} – ${label(wkB)}` : view === "day" ? `Today · ${new Date(T).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}` : view === "today" ? "Today's appt" : "Upcoming",
    calSub: `${vs.length} visits · ${upcoming.length} upcoming`,
    // The analysis card over the calendar (the owner, 2026-10-15), folded until opened.
    calAn: calendarAnalysisVM(ctx, vs),
    calStats: ([[String(leads.length), "Leads", "#fff", "Leads"], [String(upcoming.length), "Upcoming", "var(--crm-peach)", "Upcoming"], [String(showed), "Showed up", "#fff", "Showed up"],
      [showRateOnce(vs.map(v => v.v), now), "Show-up", "#fff", "Show-up"],
      // v2: No show (past visits not showed up) and Not reminded (tomorrow's visits with no reminder sent).
      [String(vs.filter(v => day0(v.at) < T && v.v.state !== "attended").length), "No show", "var(--crm-rust-meta)", "No show"],
      [String(all.filter(v => v.v.state === "booked" && !v.v.remindedAt && day0(v.at) === T + DAY).length), "Not reminded", "var(--crm-amber-line)", "Not reminded"]] as const)
      .map(([value, l, color, k]) => ({ value, label: l, color, open: () => patch({ pane: "overlay", kind: "clist", clist: k, infoId: null, visit: null }) })),
    // v2: the bars By team or By showroom.
    calBarBy: ([["team", "By team"], ["room", "By showroom"]] as const).map(([k, l]) => ({ l, bg: ui.calBy === k ? "rgba(255,255,255,.2)" : "transparent", op: ui.calBy === k ? 1 : 0.7, pick: () => patch({ calBy: k }) })),
    calTeamBars: ui.calBy === "room"
      ? data.rooms.filter(x => x.active).map((x, k) => { const n = all.filter(v => v.v.showroomId === x.id).length;
        return { name: x.name.replace(/ showroom$/i, ""), color: ["var(--crm-peach)", "var(--crm-faint-2)", "var(--crm-faint-2)", "var(--crm-st-won)", "var(--crm-amber-line)"][k % 5], pct: all.length ? Math.round((n / all.length) * 100) : 0, label: `${n} visits` }; })
      : teamsList.slice(1).filter(([k]) => team === "all" || k === team).map(([k, l, color]) => { const n = all.filter(v => v.team === k).length;
        return { name: l.replace(/^Team /, ""), color: color ?? "var(--crm-muted)", pct: all.length ? Math.round((n / all.length) * 100) : 0, label: `${n} visits` }; }),
    dow: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(l => ({ l })), monthCells, weekCols, daySlots, upDays,
    freeLabel: `Free · ${cap} per slot`, dueN: due.length,
    // 4a's rail (frame 04): the visits on screen — Visits, Came, No-show (oxblood), Still to come, then Show-up and Not
    // reminded (production's) — By showroom (or By team) bars, and today's visits with Send reminder (the customer's
    // Reminder card, the phone's own — "Reminder sent · Send again" once it went).
    // 4a's toolbar and week (frame 04): ‹ › step the period, Today goes to the one with today; the week a time grid.
    calStep: (dir: 1 | -1) => () => {
      if (view === "month") { const m = new Date(new Date(r[0]).getFullYear(), new Date(r[0]).getMonth() + dir, 1); patch({ calRange: [m.getTime(), new Date(m.getFullYear(), m.getMonth() + 1, 0).getTime()] }); }
      else { const n = view === "week" ? 7 : 1; patch({ calRange: [r[0] + dir * n * DAY, r[1] + dir * n * DAY] }); }
    },
    calToday: () => patch({ calRange: view === "month" ? [monthA, monthB] : view === "week" ? [wkA, wkB] : view === "day" ? [T, T] : [T, monthB] }),
    week4: (() => {
      const a = view === "week" ? r[0] : wkA;
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dow, k) => { const t = a + k * DAY; return { dow, num: new Date(t).getDate(), today: t === T, visits: byTime([...vs.filter(v => day0(v.at) === t).map(item), ...pOn(t)]) }; });
      const hs = days.flatMap(d => d.visits.map(x => x.hour));
      const h0 = Math.min(10, ...hs.map(Math.floor)), h1 = Math.max(20, ...hs.map(h => Math.ceil(h + 1)));
      return { days, h0, hours: Array.from({ length: h1 - h0 + 1 }, (_, i) => { const h = h0 + i; return `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`; }) };
    })(),
    cal4: (() => {
      const past = vs.filter(v => v.at < now), came = vs.filter(v => v.v.state === "attended").length;
      const noShowN = past.filter(v => v.v.state !== "attended").length, toCome = vs.filter(v => v.at >= now && v.v.state === "booked").length;
      const open = (k: string) => () => patch({ pane: "overlay", kind: "clist", clist: k, infoId: null, visit: null });
      const byRoom = ui.calBy === "room" || !ui.calBy;
      const groups = byRoom ? data.rooms.filter(x => x.active).map(x => ({ name: x.name.replace(/ showroom$/i, ""), n: vs.filter(v => v.v.showroomId === x.id).length }))
        : teamsList.slice(1).map(([k, l]) => ({ name: l.replace(/^Team /, ""), n: vs.filter(v => v.team === k).length }));
      const max = Math.max(1, ...groups.map(g => g.n));
      return {
        stats: [["Visits", String(vs.length), "var(--crm-ink)", "Leads"], ["Came", String(came), "var(--crm-ink)", "Showed up"], ["No-show", String(noShowN), "var(--crm-oxblood)", "No show"],
          ["Still to come", String(toCome), "var(--crm-ink)", "Upcoming"], ["Show-up", showRateOnce(vs.map(v => v.v), now, true), "var(--crm-ink)", "Show-up"],
          ["Not reminded", String(all.filter(v => v.v.state === "booked" && !v.v.remindedAt && day0(v.at) === T + DAY).length), "var(--crm-ink)", "Not reminded"]]
          .map(([k, val, c, list]) => ({ k, v: val, c, open: open(list) })),
        byLabel: byRoom ? "By showroom" : "By team", flip: () => patch({ calBy: byRoom ? "team" : "room" }), flipTo: byRoom ? "By team" : "By showroom",
        groups: groups.map(g => ({ ...g, w: `${Math.round((g.n / max) * 100)}%` })),
        today: all.filter(v => day0(v.at) === T && v.at >= now && v.v.state === "booked").sort((a, b) => a.at.getTime() - b.at.getTime()).map(v => ({
          id: v.id, name: v.name, time: timeOf(v.at), room: v.room, owner: v.rep, sent: !!v.v.remindedAt,
          remind: () => { void ctx.act.remind(v.id).then(ok => { if (ok) patch({ toast: `Reminder sent to ${v.name}` }); }); } })),
      };
    })(),
  };
}

/** The team a salesperson's customers count under in the Calendar's team chips. */
function visitTeam(ctx: DeskCtx, staffId: string): string | null {
  if (ctx.directors.some(d => d.id === staffId)) return DIRECTOR_TEAM;
  return ctx.teams.find(t => t.id === staffId || t.people.some(p => p.id === staffId))?.name ?? null;
}
