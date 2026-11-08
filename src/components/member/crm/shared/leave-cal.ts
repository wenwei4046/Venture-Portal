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
import {
  DOW, MONF, REASONS, addDays, dd, dowOf, leaveOnDay, leaveRange, leaveTint, leaveWord, shiftMonth,
  type PeopleBook, type Reason,
} from "./people-book";

export interface LeaveModal { editId: string | null; who: string; from: string; to: string; reason: Reason; note: string; whoOpen?: boolean; phone?: boolean }
export interface LeaveCalUi {
  view: "month" | "week"; month: string; week: string; panel: string | null; pp: boolean; modal: LeaveModal | null;
  showAppt: boolean; showLeave: boolean; pDay: string; toast: string | null;
}
export interface CalAppt { who: string; day: string; t: string; cust: string; customerId: string }
export interface LeaveCalActs {
  saveLeave(l: { id: string | null; staffId: string; fromAt: string; toAt: string; reason: Reason; note: string }): Promise<boolean>;
  removeLeave(id: string): Promise<boolean>;
  setPaused(id: string, on: boolean): Promise<boolean>;
  setDays(id: string, days: number[]): Promise<boolean>;
  setLocked(id: string, on: boolean): Promise<boolean>;
  openAppt?(customerId: string): void;
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
      stFg: cur ? leaveTint(cur.reason)[1] : s.code === "paused" ? C.rust : C.listSub,
      pLine: s.code === "login" || s.code === "locked" ? s.label : s.code === "paused" ? "Paused"
        : cur ? `${label(cur)} · back ${(() => { const b = dd(addDays(cur.toAt.slice(0, 10), 1)); return `${b.d} ${b.m}`; })()}` : daysLine(id),
      cells: days.map((day, i) => {
        const l = SL ? leaveOn(id, day) : undefined, ft = book.days(id)[i], isToday = day === TODAY, ap = apptsOn(id, day);
        const appt = ap.length > 1 ? `${ap.length} appts` : ap.length ? `${ap[0].t} ${ap[0].cust}` : "";
        const colBg = isToday ? C.hover : "transparent";
        if (l) {
          const prev = leaveOn(id, addDays(day, -1)) === l && i > 0, next = leaveOn(id, addDays(day, 1)) === l && i < 6;
          const [bg, fg] = leaveTint(l.reason);
          const part = l.fromAt.slice(0, 10) === l.toAt.slice(0, 10) ? ` · ${l.fromAt.slice(11)}` : "";
          return { appt: "", bg, fg, label: prev ? "" : label(l) + part, rad: `${prev ? 0 : 6}px ${next ? 0 : 6}px ${next ? 0 : 6}px ${prev ? 0 : 6}px`,
            ml: prev ? "0" : "3px", mr: next ? "0" : "3px", colBg, title: `${label(l)} · ${rng(l)}`, click: () => edit(l) };
        }
        const off = offOf(id);
        return { appt, bg: SL && ft && !off ? C.fullTime : "transparent", fg: C.faint, label: SL && off && ft && !appt ? "—" : "", rad: "6px", ml: "3px", mr: "3px", colBg,
          title: ap.length ? ap.map(a => `${a.t} ${a.cust}`).join(" · ") : s.code === "login" || s.code === "locked" ? s.label : s.code === "paused" ? "Paused" : ft ? "Full time · click to add leave" : "Off · click to add leave",
          click: () => { if (SL) openModal({ who: id, from: `${day}T09:00`, to: `${day}T18:00` }); } };
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
    const appts = aps.slice(0, room).map(a => ({ t: a.t, who: first(name(a.who)), dot: C.green, title: `${a.t} · ${a.cust} · ${name(a.who)}` }));
    const chips = isCal
      ? Array.from({ length: Math.min(lanes, 3) }, (_, k) => {
        const l = ls.find(y => lane[y.id] === k);
        if (!l) return { key: `e${k}`, label: "", title: "", bg: "transparent", fg: "transparent", ml: "0", mr: "0", rad: "4px", edit: (e: { stopPropagation(): void }) => { e.stopPropagation(); } };
        const prev = dow > 0 && l.fromAt.slice(0, 10) < day, next = dow < 6 && day < l.toAt.slice(0, 10);
        return { key: l.id, label: prev ? "" : `${first(name(l.staffId))} · ${label(l)}`, title: `${name(l.staffId)} · ${label(l)} · ${rng(l)}`, bg: leaveTint(l.reason)[0], fg: leaveTint(l.reason)[1],
          ml: prev ? "-6px" : "0", mr: next ? "-7px" : "0", rad: `${prev ? 0 : 4}px ${next ? 0 : 4}px ${next ? 0 : 4}px ${prev ? 0 : 4}px`,
          edit: (e: { stopPropagation(): void }) => { e.stopPropagation(); edit(l); } };
      })
      // People: the prototype's chips — first three of the day, each its own (no lanes).
      : ls.slice(0, 3).map(l => ({ key: l.id, label: `${first(name(l.staffId))} · ${label(l)}`, title: `${name(l.staffId)} · ${label(l)} · ${rng(l)}`, bg: leaveTint(l.reason)[0], fg: leaveTint(l.reason)[1],
        ml: "0", mr: "0", rad: "4px", edit: (e: { stopPropagation(): void }) => { e.stopPropagation(); edit(l); } }));
    const extra = isCal ? ls.filter(l => lane[l.id] >= 3).length + Math.max(0, aps.length - room) : Math.max(0, ls.length - 3);
    return { day, num: dd(day).d, chips, appts, more: extra ? `+${extra} more` : "", bg: inM ? "#fff" : C.outMonth, numBg: t ? C.rust : "transparent", numFg: t ? "#fff" : inM ? C.ink : C.disabled,
      add: () => { if (SL && firstWho) openModal({ who: firstWho, from: `${day}T09:00`, to: `${day}T18:00` }); } };
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
        return { id: l.id, label: label(l), when: past ? "past" : cur ? "now" : "upcoming", range: rng(l), bg: leaveTint(l.reason)[0], op: past ? 0.5 : 1, editable: !past && may,
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

  // ── Phone ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const leavesOn = (day: string) => (SL ? leaves.filter(l => leaveOnDay(l, day)) : []);
  const pCells = Array.from({ length: nCells }, (_, i) => {
    const day = addDays(gridStart, i), inM = day.slice(0, 7) === st.month, sel = day === st.pDay, t = day === TODAY;
    const dots = [...new Set(leavesOn(day).map(l => leaveTint(l.reason)[1]))].slice(0, 2);
    if (apptsOn(null, day).length) dots.push(C.green);
    return { day, num: dd(day).d, dots, w: sel || t ? 600 : 400, bg: sel ? C.ink : "transparent", fg: sel ? "#fff" : t ? C.rust : inM ? C.ink : C.disabled,
      ring: t && !sel ? `inset 0 0 0 1.5px ${C.rust}` : "none", pick: () => set({ pDay: day, month: day.slice(0, 7) }) };
  });
  const pd = st.pDay, px = dd(pd), pdow = DOW[dowOf(pd)];
  const pItems = [
    ...leavesOn(pd).map(l => {
      const s = l.fromAt.slice(0, 10), e = l.toAt.slice(0, 10), allDay = s < pd && pd < e;
      return { key: l.id, t: allDay ? "All day" : s === pd ? l.fromAt.slice(11) : "until", tFg: C.listSub, bar: leaveTint(l.reason)[0], title: `${name(l.staffId)} · ${label(l)}`, sub: rng(l), go: () => edit(l, true) };
    }),
    ...apptsOn(null, pd).map(a => ({ key: `${a.customerId}-${a.t}`, t: a.t, tFg: C.ink, bar: C.green, title: a.cust, sub: `Appointment · ${name(a.who)}`, go: () => x.acts.openAppt?.(a.customerId) })),
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
    isMonth, isWeek: !isMonth, dowHead: DOW, monthCells,
    views: ([["month", "Month"], ["week", "Week"]] as const).map(([k, lbl]) => {
      const on = st.view === k;
      return { key: k, label: lbl, bg: on ? "#fff" : "transparent", fg: on ? C.ink : C.muted, sh: on ? "0 1px 2px rgba(42,22,12,.12)" : "none", go: () => set({ view: k }) };
    }),
    days: days.map((day, i) => { const t = day === TODAY; return { day, dow: DOW[i], num: dd(day).d, fg: t ? C.ink : C.muted, w: t ? 600 : 500, numBg: t ? C.rust : "transparent", numFg: t ? "#fff" : "inherit" }; }),
    legend: (SL ? REASONS : []).map(k => ({ label: k, bg: leaveTint(k)[0] })),
    groups,
    addLeave: () => { if (firstWho) openModal({ who: firstWho, from: `${TODAY}T09:00`, to: `${TODAY}T18:00` }); },
    pAddLeave: () => { if (firstWho) set({ pp: true, modal: { editId: null, reason: "Annual", note: "", phone: true, who: firstWho, from: `${TODAY}T09:00`, to: `${TODAY}T18:00` } }); },
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
      whoName: name(m.who), whoTeam: book.teamOf(m.who).name, whoDot: book.teamOf(m.who).dot,
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
