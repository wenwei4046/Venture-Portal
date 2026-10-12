/**
 * Calendar (CRM Desktop rev 1, E1–E2): Month · Week · Day · Upcoming, Today's appt, teams, people (several at once),
 * showroom and a date range; the dark figures open their customers. Ported from the prototype on the real calendar:
 * its "October 2026", "today = 12" are the office's month and day.
 */
import type { DeskCtx } from "./ctx";
import { initials, visitRows, type VisitRow } from "./data";
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
    return k < 0 ? ["#806B60", "#F5EBE3"] : teamColours(k);
  };
  const all = visitRows(ctx);
  const vs = all.filter(v => team === "all" || v.team === team)
    .filter(v => ui.calShowroom === "all" || v.v.showroomId === ui.calShowroom)
    .filter(v => !ui.calWho.length || (!!v.repId && ui.calWho.includes(v.repId)))
    .filter(v => { const d = day0(v.at); return d >= r[0] && d <= r[1]; });
  const item = (v: VisitRow) => { const st = ST[v.status] ?? ST.Booked, [ink, tint] = teamColour(v.team);
    return { time: timeOf(v.at), short: short(v.at), name: v.name, who: `${v.rep} · ${v.room}`, rep: v.rep, status: v.status, stBg: st[0], stFg: st[1], color: ink, tint,
      open: () => patch({ pane: "overlay", kind: "info", visit: v.id, infoId: null }) }; };

  // The month on screen: the range's month (the prototype: October with 28–30 Sep and 1 Nov around it).
  const mA = new Date(new Date(r[0]).getFullYear(), new Date(r[0]).getMonth(), 1), lead = (mA.getDay() + 6) % 7, days = new Date(mA.getFullYear(), mA.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((lead + days) / 7);
  const monthCells = Array.from({ length: rows * 7 }, (_, k) => {
    const d = new Date(mA.getFullYear(), mA.getMonth(), 1 - lead + k), t = d.getTime(), muted = d.getMonth() !== mA.getMonth();
    return { num: d.getDate(), bg: muted ? "#FAF7F4" : "#fff", numBg: !muted && t === T ? "#BD4A19" : "transparent", numFg: muted ? "#C9B8AC" : t === T ? "#fff" : "#3F2B22",
      visits: muted ? [] : vs.filter(v => day0(v.at) === t).map(item) };
  });
  const weekCols = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((dow, k) => { const t = wkA + k * DAY, n = new Date(t).getDate();
    return { dow, num: n, fg: t === T ? "#BD4A19" : "#3F2B22", bd: t === T ? "#BD4A19" : "#EBDDD2", visits: vs.filter(v => day0(v.at) === t).map(item) }; });
  // Day: the showrooms' own times today (the prototype: 11 am – 7 pm), each free or with its visits.
  const room = ui.calShowroom === "all" ? undefined : data.rooms.find(x => x.id === ui.calShowroom);
  const dow = (now.getDay() + 6) % 7;
  const slotTimes = [...new Set((room ? [room] : data.rooms.filter(x => x.active)).flatMap(x => x.slots.filter(s => !s.includes("@") || s.split("@")[1].includes(String(dow))).map(s => s.split("@")[0])))].sort();
  const today = vs.filter(v => day0(v.at) === T);
  const daySlots = slotTimes.map(hm => { const [h, m] = hm.split(":").map(Number), at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    const list = today.filter(v => v.at.getHours() === h && v.at.getMinutes() === m).map(item);
    return { time: timeOf(at), visits: list, free: !list.length }; });
  const cap = room?.cap ?? Math.max(1, ...data.rooms.filter(x => x.active).map(x => x.cap));
  const upcoming = vs.filter(v => view === "today" ? day0(v.at) === T : day0(v.at) >= T);
  const dayKeys = [...new Set(upcoming.map(v => day0(v.at)))];
  const upDays = dayKeys.map(t => ({ label: (t === T ? "Today · " : "") + new Date(t).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" }),
    fg: t === T ? "#BD4A19" : "#806B60", visits: upcoming.filter(v => day0(v.at) === t).map(item) }));
  const teamsList: [string, string, string | null][] = [["all", "All teams", null], ...(ctx.directors.length ? [[DIRECTOR_TEAM, DIRECTOR_TEAM, DIRECTOR_C[0]] as [string, string, string]] : []),
    ...teams.map((t, k) => [t.name, t.name, teamColours(k)[0]] as [string, string, string])];
  const due = vs.filter(v => v.at <= now), showed = vs.filter(v => v.v.state === "attended").length, noShow = vs.filter(v => v.v.state === "no_show").length;
  const leads = data.customers.filter(c => { const d = day0(new Date(c.createdAt)); return d >= r[0] && d <= r[1]; })
    .filter(c => team === "all" || (c.assignedTo ? visitTeam(ctx, c.assignedTo) === team : false))
    .filter(c => !ui.calWho.length || (!!c.assignedTo && ui.calWho.includes(c.assignedTo)));
  const same = (a: [number, number]) => a[0] === r[0] && a[1] === r[1];
  const P: [string, [number, number], string][] = [["This month", [monthA, monthB], `${fmt(monthA)} – ${fmt(monthB)}`], ["This week", [wkA, wkB], `${fmt(wkA)} – ${fmt(wkB)}`],
    ["Today", [T, T], new Date(T).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })], ["Next 7 days", [T, T + 6 * DAY], `${fmt(T)} – ${fmt(T + 6 * DAY)}`],
    ["Last week", [wkA - 7 * DAY, wkA - DAY], `${fmt(wkA - 7 * DAY)} – ${fmt(wkA - DAY)}`]];
  // People: everyone by team (the Director's own first), several at once.
  const sel = ui.calWho;
  const opt = (label: string, val: string | null, av: [string, string]) => { const on = val ? sel.includes(val) : !sel.length;
    return { head: false, color: "", sel: on, unsel: !on, label, ini: val ? initials(label) : "ALL", avBg: av[0], avFg: av[1],
      pick: () => set(u => ({ ...u, calWho: !val ? [] : u.calWho.includes(val) ? u.calWho.filter(x => x !== val) : [...u.calWho, val] })) }; };
  type O = ReturnType<typeof opt> | { head: true; sel: false; unsel: false; label: string; color: string };
  const calWhoOpts: O[] = [opt("Everyone", null, ["#F5EBE3", "#806B60"])];
  if (ctx.directors.length) { calWhoOpts.push({ head: true, sel: false, unsel: false, label: DIRECTOR_TEAM.toUpperCase(), color: DIRECTOR_C[0] }); ctx.directors.forEach(d => calWhoOpts.push(opt(d.name, d.id, [DIRECTOR_C[1], DIRECTOR_C[0]]))); }
  teams.forEach((t, k) => { const [ink, tint] = teamColours(k); calWhoOpts.push({ head: true, sel: false, unsel: false, label: t.name.toUpperCase(), color: ink });
    t.people.forEach(p => calWhoOpts.push(opt(p.name, p.id, [tint, ink]))); });
  const n0 = sel[0] ? ctx.nameOf(sel[0]) : "";
  const label = (t: number) => new Date(t).toLocaleDateString("en-MY", { day: "numeric", month: "numeric" });
  return {
    kCal: ui.tab === "calendar",
    rangeLabel: r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])} – ${fmt(r[1])}`, rangeOpen: ui.rangeOpen, toggleRange: () => set(u => ({ ...u, rangeOpen: !u.rangeOpen })),
    rangeOpts: P.map(([l, rr, hint]) => ({ label: l, hint, bg: same(rr) ? "#FFF1E6" : "transparent", fg: same(rr) ? "#BD4A19" : "#3F2B22", pick: () => patch({ calRange: rr, rangeOpen: false }) })),
    rangeFrom: iso(r[0]), rangeTo: iso(r[1]),
    setFrom: (e: { target: { value: string } }) => { const t = fromIso(e.target.value); if (t != null) patch({ calRange: [t, Math.max(t, r[1])] }); },
    setTo: (e: { target: { value: string } }) => { const t = fromIso(e.target.value); if (t != null) patch({ calRange: [Math.min(r[0], t), t] }); },
    calWhoOpts, calWhoOpen: ui.calWhoOpen, toggleCalWho: () => set(u => ({ ...u, calWhoOpen: !u.calWhoOpen })), calWhoClear: () => patch({ calWho: [] }),
    calWhoLabel: !sel.length ? "Everyone" : sel.length === 1 ? n0 : `${n0} +${sel.length - 1}`,
    calShowroom: ui.calShowroom, pickShowroom: (e: { target: { value: string } }) => patch({ calShowroom: e.target.value }),
    showroomOpts: [{ v: "all", label: "All showrooms" }, ...data.rooms.filter(x => x.active).map(x => ({ v: x.id, label: x.name }))],
    calTeams: teamsList.map(([k, l, dot]) => ({ label: l, dot, bg: k === team ? "#3F2B22" : "#fff", fg: k === team ? "#fff" : "#3F2B22", bd: k === team ? "#3F2B22" : "#EBDDD2", pick: () => patch({ calTeam: k }) })),
    calViews: ([["month", "Month"], ["week", "Week"], ["day", "Day"], ["upcoming", "Upcoming"]] as const).map(([k, l]) => ({ label: l, on: k === view, off: k !== view,
      pick: () => patch({ calView: k, calRange: k === "month" ? [monthA, monthB] : k === "week" ? [wkA, wkB] : k === "day" ? [T, T] : [T, monthB] }) })),
    goToday: () => patch({ calView: "today", calRange: [T, T] }), todayN: all.filter(v => day0(v.at) === T).length,
    todayBg: view === "today" ? "#FFF1E6" : "#fff", todayBd: view === "today" ? "#BD4A19" : "#E2CFC1",
    calMonth: view === "month", calWeek: view === "week", calDay: view === "day", calUp: view === "upcoming" || view === "today",
    calTitle: view === "month" ? `${MON[mA.getMonth()]} ${mA.getFullYear()}` : view === "week" ? `${label(wkA)} – ${label(wkB)}` : view === "day" ? `Today · ${new Date(T).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}` : view === "today" ? "Today's appt" : "Upcoming",
    calSub: `${vs.length} visits · ${upcoming.length} upcoming`,
    calStats: ([[String(leads.length), "Leads", "#fff", "Leads"], [String(upcoming.length), "Upcoming", "#F6B48A", "Upcoming"], [String(showed), "Showed up", "#fff", "Showed up"],
      [showed + noShow ? `${Math.round((showed / (showed + noShow)) * 100)}%` : "—", "Show-up", "#fff", "Show-up"]] as const)
      .map(([value, l, color, k]) => ({ value, label: l, color, open: () => patch({ pane: "overlay", kind: "clist", clist: k, infoId: null, visit: null }) })),
    calTeamBars: teamsList.slice(1).filter(([k]) => team === "all" || k === team).map(([k, l, color]) => { const n = all.filter(v => v.team === k).length;
      return { name: l.replace(/^Team /, ""), color: color ?? "#806B60", pct: all.length ? Math.round((n / all.length) * 100) : 0, label: `${n} visits` }; }),
    dow: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(l => ({ l })), monthCells, weekCols, daySlots, upDays,
    freeLabel: `Free · ${cap} per slot`, dueN: due.length,
  };
}

/** The team a salesperson's customers count under in the Calendar's team chips. */
function visitTeam(ctx: DeskCtx, staffId: string): string | null {
  if (ctx.directors.some(d => d.id === staffId)) return DIRECTOR_TEAM;
  return ctx.teams.find(t => t.id === staffId || t.people.some(p => p.id === staffId))?.name ?? null;
}
