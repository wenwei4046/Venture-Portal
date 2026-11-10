/**
 * Calendar (appointments + leave) and Assignment › People (leave only) — one view model for both, the prototypes'
 * renderVals() and phone() ported with the same names (docs/design_handoff_crm/designs/CRM Calendar.dc.html, CRM
 * Assignment People.dc.html). Real data in place of the samples: people and teams from the CRM, leave from
 * crm_staff_leave, Full time days from the team rows the dealer reads, appointments from crm_appointments, the clock the
 * office's. Every write goes through the CRM's own actions (one leave record, one Pause flag, one Lock), so the dealer,
 * Up next, this Calendar and People read the same facts.
 */
import type { CrmLeave } from "@/lib/member/crm-data";
import { C } from "./palette";
import { CAL, calDay, calLeave } from "./cal-look";
import {
  DOW, MONF, REASONS, addDays, dd, dowOf, leaveOnDay, leaveRange, leaveWord, shiftMonth,
  type PeopleBook, type Reason,
} from "./people-book";

export interface LeaveModal { editId: string | null; who: string; from: string; to: string; reason: Reason; note: string; whoOpen?: boolean; phone?: boolean; /** Change's search (13e). */ whoQ?: string }
export interface LeaveCalUi {
  view: "month" | "week"; month: string; week: string; panel: string | null; pp: boolean; modal: LeaveModal | null;
  showAppt: boolean; showLeave: boolean; pDay: string; toast: string | null;
}
export interface CalAppt { who: string; day: string; t: string; cust: string; customerId: string; visitId: string }
export interface LeaveCalActs {
  saveLeave(l: { id: string | null; staffId: string; fromAt: string; toAt: string; reason: Reason; note: string }): Promise<boolean>;
  removeLeave(id: string): Promise<boolean>;
  setPaused(id: string, on: boolean): Promise<boolean>;
  setDays(id: string, days: number[]): Promise<boolean>;
  setLocked(id: string, on: boolean): Promise<boolean>;
  /** A tapped appointment opens its Customer info, whose Open chat goes to the chat (the owner, 2026-11-08). */
  openAppt?(a: CalAppt): void;
}
export interface LeaveCalIn {
  mode: "calendar" | "people";
  book: PeopleBook;
  leaves: CrmLeave[];
  appts: CalAppt[];
  /** The office's now, "2026-11-06T18:00". */
  now: string;
  /** May this viewer change this person's leave, days and Pause (CRM · Manage, or a ticked leader on their line). */
  canEdit(id: string): boolean;
  /** CRM · Manage: the Lock switch. */
  canLock: boolean;
  ui: LeaveCalUi;
  set(p: Partial<LeaveCalUi> | ((u: LeaveCalUi) => Partial<LeaveCalUi>)): void;
  flash(t: string): void;
  acts: LeaveCalActs;
}

export function leaveCalStart(now: string, mode: "calendar" | "people"): LeaveCalUi {
  const today = now.slice(0, 10);
  return { view: "month", month: today.slice(0, 7), week: addDays(today, -dowOf(today)), panel: null, pp: false, modal: null,
    showAppt: mode === "calendar", showLeave: true, pDay: today, toast: null };
}

const TIMES = Array.from({ length: 48 }, (_, i) => ({ v: `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}` }));
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Mon, 10 Nov 2026" (13e's date field). */
export const longDay = (day: string) => { const [y, mo, d] = day.split("-").map(Number); const w = new Date(Date.UTC(y, mo - 1, d)).getUTCDay(); return `${WD[w]}, ${d} ${MON3[mo - 1]} ${y}`; };
const ini = (n: string) => n.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const first = (n: string) => n.split(" ")[0];
const label = leaveWord;
const rng = leaveRange;

export function leaveCalVM(x: LeaveCalIn) {
  const { book, ui: st, set, now } = x;
  const TODAY = now.slice(0, 10), THIS_MON = addDays(TODAY, -dowOf(TODAY)), THIS_MONTH = TODAY.slice(0, 7);
  const isCal = x.mode === "calendar";
  const SA = isCal && st.showAppt, SL = !isCal || st.showLeave;
  const leaves = x.leaves;
  const name = (id: string) => book.person(id)?.name ?? "";
  const days = Array.from({ length: 7 }, (_, i) => addDays(st.week, i));
  const leaveOn = (who: string, day: string) => leaves.find(l => l.staffId === who && leaveOnDay(l, day));
  const apptsOn = (who: string | null, day: string) => SA ? x.appts.filter(a => (!who || a.who === who) && a.day === day).sort((a, b) => (a.t < b.t ? -1 : 1)) : [];
  const editable = book.groups.flatMap(g => g.people).filter(p => x.canEdit(p.id));
  const firstWho = editable[0]?.id ?? null;

  const openModal = (o: Partial<LeaveModal> & { who: string; from: string; to: string }) => {
    if (!x.canEdit(o.who)) return;
    set({ modal: { editId: null, reason: "Annual", note: "", ...o } });
  };
  const edit = (l: CrmLeave, phone?: boolean) => openModal({ editId: l.id, who: l.staffId, from: l.fromAt, to: l.toAt, reason: l.reason, note: l.note, phone });
  const save = async () => {
    const m = st.modal;
    if (!m || m.to < m.from) { x.flash("To can't be before From."); return; }
    if (m.reason === "Other" && !m.note.trim()) { x.flash("Write the reason"); return; }
    const ok = await x.acts.saveLeave({ id: m.editId, staffId: m.who, fromAt: m.from, toAt: m.to, reason: m.reason, note: m.reason === "Other" ? m.note.trim() : "" });
    if (!ok) return;
    set({ modal: null });
    x.flash(`${name(m.who)} · ${label({ reason: m.reason, note: m.note.trim() })} · ${rng({ fromAt: m.from, toAt: m.to })}`);
  };
  const statusOf = (id: string) => book.status(id, now);
  const offOf = (id: string) => { const s = statusOf(id).code; return s === "login" || s === "locked" || s === "paused"; };
  const dimmed = (id: string) => { const s = statusOf(id).code; return s === "login" || s === "locked"; };
  const daysLine = (id: string) => {
    const on = book.days(id).map((v, i) => (v ? i : -1)).filter(i => i >= 0);
    if (!on.length) return "No lead days";
    const run = on.every((v, k) => !k || v === on[k - 1] + 1);
    return run && on.length > 2 ? `Leads ${DOW[on[0]]}–${DOW[on[on.length - 1]]}` : "Leads " + on.map(i => DOW[i]).join(" ");
  };

  const groups = book.groups.map(t => ({ name: t.name, dot: t.dot, rows: t.people.map(p => {
    const id = p.id, s = statusOf(id), cur = s.leave, dim = dimmed(id);
    return {
      id, name: p.name, status: s.label, nameFg: dim ? C.faint : C.ink, rowBg: "transparent",
      open: () => set({ panel: id, pp: false }), popen: () => set({ panel: id, pp: true }),
      stFg: cur ? calLeave(cur.reason)[1] : s.code === "paused" ? C.rust : C.listSub,
      pLine: s.code === "login" || s.code === "locked" ? s.label : s.code === "paused" ? "Paused"
        : cur ? `${label(cur)} · back ${(() => { const b = dd(addDays(cur.toAt.slice(0, 10), 1)); return `${b.d} ${b.m}`; })()}` : daysLine(id),
      cells: days.map((day, i) => {
        const l = SL ? leaveOn(id, day) : undefined, ft = book.days(id)[i], isToday = day === TODAY, ap = apptsOn(id, day);
        const appt = ap.length > 1 ? `${ap.length} appts` : ap.length ? `${ap[0].t} ${ap[0].cust}` : "";
        const colBg = isToday ? C.hover : "transparent";
        if (l) {
          const prev = leaveOn(id, addDays(day, -1)) === l && i > 0, next = leaveOn(id, addDays(day, 1)) === l && i < 6;
          const [bg, fg] = calLeave(l.reason);
          const part = l.fromAt.slice(0, 10) === l.toAt.slice(0, 10) ? ` · ${l.fromAt.slice(11)}` : "";
          return { appt: "", bg, fg, label: prev ? "" : label(l) + part, rad: `${prev ? 0 : 6}px ${next ? 0 : 6}px ${next ? 0 : 6}px ${prev ? 0 : 6}px`,
            ml: prev ? "0" : "3px", mr: next ? "0" : "3px", colBg, title: `${label(l)} · ${rng(l)}`, click: () => edit(l) };
        }
        const off = offOf(id);
        return { appt, bg: SL && ft && !off ? C.fullTime : "transparent", fg: C.faint, label: SL && off && ft && !appt ? "—" : "", rad: "6px", ml: "3px", mr: "3px", colBg,
          title: ap.length ? ap.map(a => `${a.t} ${a.cust}`).join(" · ") : s.code === "login" || s.code === "locked" ? s.label : s.code === "paused" ? "Paused" : ft ? "Full time · click to add leave" : "Off · click to add leave",
          click: () => { if (ap.length && x.acts.openAppt) x.acts.openAppt(ap[0]); else if (SL) openModal({ who: id, from: `${day}T09:00`, to: `${day}T18:00` }); } };
      }),
    };
  }) }));

  const w0 = dd(days[0]), w6 = dd(days[6]);
  const isMonth = st.view === "month";
  const firstDay = `${st.month}-01`, fdow = dowOf(firstDay), gridStart = addDays(firstDay, -fdow);
  const nDays = new Date(Date.UTC(+st.month.slice(0, 4), +st.month.slice(5), 0)).getUTCDate(), nCells = Math.ceil((fdow + nDays) / 7) * 7;
  const lane: Record<string, number> = {}, laneEnd: string[] = [];
  (SL ? leaves.slice().sort((a, b) => (a.fromAt < b.fromAt ? -1 : 1)) : []).forEach(l => {
    const s = l.fromAt.slice(0, 10), e = l.toAt.slice(0, 10);
    let k = laneEnd.findIndex(end => end < s);
    if (k < 0) { k = laneEnd.length; laneEnd.push(e); } else laneEnd[k] = e;
    lane[l.id] = k;
  });
  const monthCells = Array.from({ length: nCells }, (_, i) => {
    const day = addDays(gridStart, i), inM = day.slice(0, 7) === st.month, t = day === TODAY;
    const ls = SL ? leaves.filter(l => leaveOnDay(l, day)) : [], aps = apptsOn(null, day);
    const lanes = ls.length ? Math.max(...ls.map(l => lane[l.id])) + 1 : 0, dow = i % 7;
    const room0 = Math.max(0, 3 - Math.min(lanes, 3)), over = ls.filter(l => lane[l.id] >= 3).length + Math.max(0, aps.length - room0) > 0, room = over && room0 > 0 && lanes > 0 ? room0 - 1 : room0;
    const appts = aps.slice(0, room).map(a => ({ key: a.visitId, t: a.t, who: first(name(a.who)), dot: CAL.apptDot, title: `${a.t} · ${a.cust} · ${name(a.who)}`,
      open: (e: { stopPropagation(): void }) => { e.stopPropagation(); x.acts.openAppt?.(a); } }));
    // Both pages draw a leave of several days as ONE bar across them, in its own lane (the owner, 2026-11-09, on People:
    // "连续假期就连起来" — People drew each day its own chip, as its prototype did).
    const chips = Array.from({ length: Math.min(lanes, 3) }, (_, k) => {
        const l = ls.find(y => lane[y.id] === k);
        if (!l) return { key: `e${k}`, label: "", title: "", bg: "transparent", fg: "transparent", ml: "0", mr: "0", rad: "4px", edit: (e: { stopPropagation(): void }) => { e.stopPropagation(); } };
        const prev = dow > 0 && l.fromAt.slice(0, 10) < day, next = dow < 6 && day < l.toAt.slice(0, 10);
        return { key: l.id, label: prev ? "" : `${first(name(l.staffId))} · ${label(l)}`, title: `${name(l.staffId)} · ${label(l)} · ${rng(l)}`, bg: calLeave(l.reason)[0], fg: calLeave(l.reason)[1],
          ml: prev ? "-6px" : "0", mr: next ? "-7px" : "0", rad: `${prev ? 0 : 4}px ${next ? 0 : 4}px ${next ? 0 : 4}px ${prev ? 0 : 4}px`,
          edit: (e: { stopPropagation(): void }) => { e.stopPropagation(); edit(l); } };
      });
    const extra = ls.filter(l => lane[l.id] >= 3).length + Math.max(0, aps.length - room);
    const nd = calDay({ today: t, picked: false, inMonth: inM });
    return { day, num: dd(day).d, chips, appts, more: extra ? `+${extra} more` : "", bg: inM ? "#fff" : CAL.outBg, numBg: nd.bg, numFg: nd.fg,
      add: () => { if (SL && firstWho) openModal({ who: firstWho, from: `${day}T09:00`, to: `${day}T18:00` }); } };
  });
  /*
   * The month by week rows (v4 notes/19 §3, every calendar since): each leave is ONE bar per week row, laid across the
   * days it covers in its own lane (left = its first day's column, width = its days), so its words have the whole bar and
   * end in an ellipsis only at the bar's own end — never a 55 px cell, never over the next bar. A one-day leave is a tall
   * bar of two lines (name / reason). Lanes are the week's own (max 3, then "+N" on the days a hidden one covers).
   * Appointments go under the lanes, one a line, as many as the cell's room; the rest are "+N" (notes/19 §7).
   */
  const LANES = 3;
  const weeks = Array.from({ length: nCells / 7 }, (_, w) => {
    const cells = monthCells.slice(w * 7, w * 7 + 7), d0 = cells[0].day, d6 = cells[6].day;
    const col = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${d0}T00:00:00Z`)) / 86_400_000);
    const inWeek = SL ? leaves.filter(l => l.fromAt.slice(0, 10) <= d6 && l.toAt.slice(0, 10) >= d0)
      .sort((a, b) => (a.fromAt < b.fromAt ? -1 : a.fromAt > b.fromAt ? 1 : a.toAt > b.toAt ? -1 : a.toAt < b.toAt ? 1 : a.id < b.id ? -1 : 1)) : [];
    const ends: number[] = [];
    const segs = inWeek.map(l => {
      const s = l.fromAt.slice(0, 10), e = l.toAt.slice(0, 10), c0 = s < d0 ? 0 : col(s), c1 = e > d6 ? 6 : col(e);
      let k = ends.findIndex(x => x < c0);
      if (k < 0) { k = ends.length; ends.push(c1); } else ends[k] = c1;
      return { l, k, c0, c1, single: s === e, startsHere: s >= d0, endsHere: e <= d6 };
    });
    const shown = segs.filter(g => g.k < LANES);
    const lanes = Array.from({ length: Math.min(ends.length, LANES) }, (_, k) => shown.some(g => g.k === k && g.single));
    const bars = shown.map(g => {
      const [bg, fg] = calLeave(g.l.reason);
      return { key: `${g.l.id}@${w}`, lane: g.k, c0: g.c0, c1: g.c1, span: g.c1 - g.c0 + 1, single: g.single,
        who: first(name(g.l.staffId)), word: label(g.l), label: `${first(name(g.l.staffId))} · ${label(g.l)}`,
        title: `${name(g.l.staffId)} · ${label(g.l)} · ${rng(g.l)}`, bg, fg, roundL: g.startsHere, roundR: g.endsHere,
        edit: (e: { stopPropagation(): void }) => { e.stopPropagation(); edit(g.l, true); },
        editD: (e: { stopPropagation(): void }) => { e.stopPropagation(); edit(g.l); } };
    });
    // The phone's room (notes/19 §4: 72 px cells): 3 px top, the 20 px number, 2 px; each lane 16 px (a tall one 26) + 2.
    const used = lanes.reduce((a, tall) => a + (tall ? 26 : 16) + 2, 0);
    const room = Math.max(0, Math.floor((72 - 3 - 20 - 2 - 4 - used) / 14));
    const days = cells.map((c, i) => {
      const aps = apptsOn(null, c.day), hidden = segs.filter(g => g.k >= LANES && g.c0 <= i && i <= g.c1).length;
      const over = hidden + aps.length > room;
      const fit = over ? Math.max(0, room - 1) : aps.length;
      const extra = hidden + aps.length - fit;
      const sel = c.day === st.pDay, today = c.day === TODAY, inM = c.day.slice(0, 7) === st.month;
      const nd = calDay({ today, picked: false, inMonth: inM });
      return { day: c.day, num: c.num, inM, sel, bg: sel ? CAL.selBg : inM ? "#fff" : CAL.outBg, numBg: nd.bg, numFg: nd.fg, numW: nd.w,
        appts: aps.slice(0, fit).map(a => ({ key: a.visitId, t: a.t, who: first(name(a.who)), title: `${a.t} · ${a.cust} · ${name(a.who)}`,
          open: (e: { stopPropagation(): void }) => { e.stopPropagation(); x.acts.openAppt?.(a); } })),
        more: extra > 0 ? `+${extra}` : "", pick: () => set({ pDay: c.day, month: c.day.slice(0, 7) }) };
    });
    // The desktop keeps its own room (≈100 px rows: 22 px number, 20 px lanes, 18 px appointment lines).
    const dRoom = Math.max(0, Math.floor((96 - 10 - 22 - 3 - lanes.length * 23) / 21));
    const dDays = cells.map((c, i) => {
      const aps = apptsOn(null, c.day), hidden = segs.filter(g => g.k >= LANES && g.c0 <= i && i <= g.c1).length;
      const fit = hidden + aps.length > dRoom ? Math.max(0, dRoom - 1) : aps.length, extra = hidden + aps.length - fit;
      return { ...c, appts: aps.slice(0, fit).map(a => ({ key: a.visitId, t: a.t, who: first(name(a.who)), dot: CAL.apptDot, title: `${a.t} · ${a.cust} · ${name(a.who)}`,
        open: (e: { stopPropagation(): void }) => { e.stopPropagation(); x.acts.openAppt?.(a); } })), more: extra > 0 ? `+${extra} more` : "" };
    });
    return { key: d0, lanes, bars, days, dDays };
  });

  const pid = st.panel, m = st.modal;
  const pn = pid ? (() => {
    const p = book.person(pid), t = book.teamOf(pid), s = statusOf(pid), may = x.canEdit(pid), paused = s.code === "paused" || !!p?.paused;
    const ls = leaves.filter(l => l.staffId === pid).sort((a, b) => (a.fromAt < b.fromAt ? 1 : -1));
    const ft = book.days(pid);
    const locked = s.code === "locked";
    return {
      name: p?.name ?? "", ini: ini(p?.name ?? ""), team: t.name, dot: t.dot,
      status: s.code === "login" || s.code === "locked" ? s.label : paused ? "Paused" : "Active",
      may,
      ft: DOW.map((dow, i) => {
        const on = ft[i];
        return { dow: dow.slice(0, 2), bg: on ? C.ink : "#fff", fg: on ? "#fff" : C.muted, bd: on ? C.ink : C.line, cursor: may ? "pointer" : "default",
          toggle: () => { if (!may) return; const next = ft.map((v, j) => (j === i ? !v : v)); void x.acts.setDays(pid, next.map((v, j) => (v ? j : -1)).filter(j => j >= 0)); } };
      }),
      leaves: ls.map(l => {
        const past = l.toAt < now, cur = l.fromAt <= now && now <= l.toAt;
        return { id: l.id, label: label(l), when: past ? "past" : cur ? "now" : "upcoming", range: rng(l), bg: calLeave(l.reason)[0], op: past ? 0.5 : 1, editable: !past && may,
          edit: () => { if (!past) edit(l, st.pp); },
          del: async () => { if (await x.acts.removeLeave(l.id)) x.flash("Leave removed"); } };
      }),
      noLeave: !ls.length,
      add: () => openModal({ who: pid, from: `${TODAY}T09:00`, to: `${TODAY}T18:00`, phone: st.pp }),
      pauseTxt: isCal ? (paused ? "Paused · gets no ad leads" : "Gets ad leads on Full time days") : (paused ? "Paused · no ad leads" : "Gets ad leads on their days"),
      pauseBtn: paused ? "Resume" : "Pause", pauseFg: paused ? C.rust : C.ink,
      togglePause: async () => { if (!may) return; await x.acts.setPaused(pid, !paused); },
      // The owner, 2026-11-08: Locked is its own state, beside Pause (CRM · Manage only — crm_set_locked).
      lockOn: x.canLock && s.code !== "login",
      lockTxt: locked ? "Locked · out of every ad turn" : "In Assignment's lists",
      lockBtn: locked ? "Unlock" : "Lock", lockFg: locked ? C.rust : C.ink,
      toggleLock: async () => { await x.acts.setLocked(pid, !locked); },
    };
  })() : null;

  const setEnd = (k: "from" | "to", part: "d" | "t") => (e: { target: { value: string } }) => {
    const v = e.target.value;
    set(u => {
      if (!u.modal) return {};
      const [d, t] = u.modal[k].split("T"), nv = part === "d" ? `${v}T${t}` : `${d}T${v}`;
      const mm = { ...u.modal, [k]: nv };
      if (k === "from" && mm.to < nv) mm.to = `${nv.slice(0, 10)}T${mm.to.split("T")[1]}`;
      return { modal: mm };
    });
  };
  const patchModal = (p: Partial<LeaveModal>) => set(u => (u.modal ? { modal: { ...u.modal, ...p } } : {}));
  const openFor = (id: string, phone = true) => {
    if (!x.canEdit(id)) return;
    const mine = leaves.filter(l => l.staffId === id && l.toAt >= now).sort((a, b) => (a.fromAt < b.fromAt ? -1 : 1));
    if (mine[0]) edit(mine[0], phone);
    else openModal({ who: id, from: `${TODAY}T09:00`, to: `${TODAY}T18:00`, phone });
  };

  // ── Phone ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const leavesOn = (day: string) => (SL ? leaves.filter(l => leaveOnDay(l, day)) : []);
  const pCells = Array.from({ length: nCells }, (_, i) => {
    const day = addDays(gridStart, i), inM = day.slice(0, 7) === st.month, sel = day === st.pDay, t = day === TODAY;
    const dots = [...new Set(leavesOn(day).map(l => calLeave(l.reason)[1]))].slice(0, 2);
    if (apptsOn(null, day).length) dots.push(CAL.apptDot);
    return { day, num: dd(day).d, dots, w: sel || t ? 600 : 400, bg: sel ? C.ink : "transparent", fg: sel ? "#fff" : t ? C.rust : inM ? C.ink : C.disabled,
      ring: t && !sel ? `inset 0 0 0 1.5px ${C.rust}` : "none", pick: () => set({ pDay: day, month: day.slice(0, 7) }) };
  });
  const pd = st.pDay, px = dd(pd), pdow = DOW[dowOf(pd)];
  const pItems = [
    ...leavesOn(pd).map(l => {
      const s = l.fromAt.slice(0, 10), e = l.toAt.slice(0, 10), allDay = s < pd && pd < e;
      return { key: l.id, t: allDay ? "All day" : s === pd ? l.fromAt.slice(11) : "until", tFg: C.listSub, bar: calLeave(l.reason)[0], title: `${name(l.staffId)} · ${label(l)}`, sub: rng(l), go: () => edit(l, true) };
    }),
    ...apptsOn(null, pd).map(a => ({ key: a.visitId, t: a.t, tFg: C.ink, bar: CAL.apptDot, title: a.cust, sub: `Appointment · ${name(a.who)}`, go: () => x.acts.openAppt?.(a) })),
  ];
  const peopleIds = book.groups.flatMap(g => g.people.map(p => p.id)).filter((id, i, a) => a.indexOf(id) === i && x.canEdit(id));

  const layerCount = {
    showAppt: x.appts.filter(a => a.day.slice(0, 7) === st.month).length,
    showLeave: leaves.filter(l => l.fromAt.slice(0, 7) <= st.month && st.month <= l.toAt.slice(0, 7)).length,
  };
  return {
    isCal, showAppt: SA, showLeave: SL, canAdd: !!firstWho,
    layers: ([["showAppt", "Appointments"], ["showLeave", "Leave"]] as const).map(([k, lbl]) => {
      const on = st[k];
      return { key: k, label: lbl, n: layerCount[k], bg: on ? "#fff" : C.field, fg: on ? C.ink : C.muted, bd: on ? C.line : "transparent", boxBg: on ? C.ink : "#fff", boxBd: on ? C.ink : C.disabled,
        go: () => set(s => { const other = k === "showAppt" ? "showLeave" : "showAppt"; return s[k] && !s[other] ? { [other]: true, [k]: false } : { [k]: !s[k] }; }) };
    }),
    weekLabel: isMonth ? `${MONF[+st.month.slice(5) - 1]} ${st.month.slice(0, 4)}` : w0.m === w6.m ? `${w0.d}–${w6.d} ${w0.m} ${w0.y}` : `${w0.d} ${w0.m} – ${w6.d} ${w6.m} ${w6.y}`,
    notThisWeek: isMonth ? st.month !== THIS_MONTH : st.week !== THIS_MON, todayLabel: isMonth ? "This month" : "This week",
    thisWeek: () => set({ week: THIS_MON, month: THIS_MONTH, pDay: TODAY }),
    prevWeek: () => set(s => (s.view === "month" ? { month: shiftMonth(s.month, -1) } : { week: addDays(s.week, -7) })),
    nextWeek: () => set(s => (s.view === "month" ? { month: shiftMonth(s.month, 1) } : { week: addDays(s.week, 7) })),
    isMonth, isWeek: !isMonth, dowHead: DOW, monthCells, weeks,
    views: ([["month", "Month"], ["week", "Week"]] as const).map(([k, lbl]) => {
      const on = st.view === k;
      return { key: k, label: lbl, bg: on ? "#fff" : "transparent", fg: on ? C.ink : C.muted, sh: on ? "0 1px 2px rgba(42,22,12,.12)" : "none", go: () => set({ view: k }) };
    }),
    days: days.map((day, i) => { const t = day === TODAY; return { day, dow: DOW[i], num: dd(day).d, fg: t ? C.ink : C.muted, w: t ? 600 : 500, numBg: t ? C.rust : "transparent", numFg: t ? "#fff" : "inherit" }; }),
    legend: (SL ? REASONS : []).map(k => ({ label: k, bg: calLeave(k)[0] })),
    groups,
    addLeave: () => { if (firstWho) openModal({ who: firstWho, from: `${TODAY}T09:00`, to: `${TODAY}T18:00` }); },
    // v4 notes/18-A: + Leave opens Add leave on the first person they may edit, with Change to pick another.
    pAddLeave: () => { if (firstWho) openModal({ who: firstWho, from: `${TODAY}T09:00`, to: `${TODAY}T18:00`, phone: true }); },
    /** A name tapped (or Up next's "the Add leave sheet with the person set"): their leave now or next opens as Edit leave
     *  (with Remove), else Add leave with them set. Nothing for a person this viewer may not edit. */
    pOpenFor: (id: string, phone = true) => openFor(id, phone),
    pAdd: () => { if (firstWho) openModal({ who: firstWho, from: `${pd}T09:00`, to: `${pd}T18:00`, phone: true }); },
    panelOn: !!pid && !st.pp, pPanelOn: !!pid && st.pp, pn, closePanel: () => set({ panel: null, pp: false }),
    modalOn: !!m && !m.phone, pModalOn: !!m && !!m.phone, cancelLeave: () => set({ modal: null }), saveLeave: () => { void save(); },
    times: TIMES,
    lv: m ? {
      title: m.editId ? "Edit leave" : "Add leave", who: m.who,
      setWho: (e: { target: { value: string } }) => patchModal({ who: e.target.value }),
      people: peopleIds.map(id => ({ id, name: name(id), team: book.teamOf(id).name, dot: book.teamOf(id).dot, w: id === m.who ? 600 : 400, bg: id === m.who ? C.field : "transparent", sel: id === m.who,
        pick: () => patchModal({ who: id, whoOpen: false }) })),
      whoOpen: !!m.whoOpen, toggleWho: () => patchModal({ whoOpen: !m.whoOpen }),
      whoName: name(m.who), whoTeam: book.teamOf(m.who).name, whoDot: book.teamOf(m.who).dot, whoIni: ini(name(m.who)),
      // Change (13e): every person they may edit, by team, with a search.
      whoQ: m.whoQ ?? "", setWhoQ: (e: { target: { value: string } }) => patchModal({ whoQ: e.target.value }),
      whoGroups: book.groups.map(g => ({ name: g.name, dot: g.dot, rows: g.people.filter(p => x.canEdit(p.id) && (!m.whoQ || p.name.toLowerCase().includes(m.whoQ.trim().toLowerCase())))
        .map(p => ({ id: p.id, name: p.name, ini: ini(p.name), sel: p.id === m.who, pick: () => patchModal({ who: p.id, whoOpen: false, whoQ: "" }) })) })).filter(g => g.rows.length),
      canRemove: !!m.editId,
      remove: async () => { if (!m.editId) return; if (await x.acts.removeLeave(m.editId)) { set({ modal: null }); x.flash("Leave removed"); } },
      dayWords: (k: "from" | "to") => longDay(m[k].slice(0, 10)),
      reasons: REASONS.map(r => ({ label: r, bg: m.reason === r ? C.ink : "#fff", fg: m.reason === r ? "#fff" : C.ink, bd: m.reason === r ? C.ink : C.line, pick: () => patchModal({ reason: r }) })),
      isOther: m.reason === "Other", note: m.note, setNote: (e: { target: { value: string } }) => patchModal({ note: e.target.value }),
      ends: ([["From", "from"], ["To", "to"]] as const).map(([lb, k]) => ({ key: k, label: lb, date: m[k].split("T")[0], time: m[k].split("T")[1], setDate: setEnd(k, "d"), setTime: setEnd(k, "t") })),
    } : null,
    toastOn: !!st.toast, toast: st.toast ?? "",
    // Phone
    pCells, pDow: DOW.map(d => d[0]), pItems, pEmpty: !pItems.length, pDayLabel: `${pdow}, ${px.d} ${px.m}`, pMonthLabel: `${MONF[+st.month.slice(5) - 1]} ${st.month.slice(0, 4)}`,
    pPrev: () => set(s => ({ month: shiftMonth(s.month, -1) })), pNext: () => set(s => ({ month: shiftMonth(s.month, 1) })),
    pPeople: peopleIds.map(id => ({ id, name: name(id), sel: m ? m.who === id : false })),
  };
}
export type LeaveCalVM = ReturnType<typeof leaveCalVM>;
