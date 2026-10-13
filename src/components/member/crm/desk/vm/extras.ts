/**
 * The desktop's screens the design does not draw (BUILD-NOTES.md), built in its style: Appointment (book / change /
 * cancel a visit — the phone's own rules: the showroom's slots per weekday, its closures, its booking limit), Add note
 * (B6), Edit customer (the form the Principal / Director set, H3) and History (who changed which setting).
 */
import { blockHours, type CrmCustomer, type CrmRoom } from "@/lib/member/crm-data";
import { roomSlots, slotAt } from "../../sales/vm/chat";
import { dayLabel, timeLabel } from "../../sales/vm/common";
import type { DeskCtx, FormSection } from "./ctx";
import { initials } from "./data";
import { BASE_FORM } from "./settings";

const DAY = 86_400_000;
const isoOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const hmOf = (label: string) => { const m = label.match(/(\d+):(\d+) (am|pm)/); return m ? `${String((Number(m[1]) % 12) + (m[3] === "pm" ? 12 : 0)).padStart(2, "0")}:${m[2]}` : label; };

/** Closed: a weekly closure, a whole-day block, or a timed block covering this slot (B9). */
export function slotClosed(r: CrmRoom, day: number, label: string): boolean {
  if (r.weekly.includes(new Date(day).getDay())) return true;
  const d = isoOf(day), hm = hmOf(label);
  return r.blocks.some(b => { const w = blockHours(b); return d >= b.a && d <= (b.b || b.a) && (!w.length || w.some(x => hm >= x.f && hm < x.t)); });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Book = NonNullable<DeskCtx["ui"]["book"]>;

/**
 * Appointment's Week | Month and its month chooser, as the salesperson's sheet (the owner, 2026-10-13: 跟 RS 一樣):
 * the chip names the shown month and opens a year of months (this month to twelve ahead); Month shows that month's
 * days, a past or closed one struck out. Picking a day keeps the 7-day page in step with it.
 */
function monthOf(b: Book, T: number, room: CrmRoom | undefined, put: (p: Partial<Book>) => void) {
  const now = new Date(T), d = new Date(b.day), y = d.getFullYear(), m = d.getMonth();
  const weekOf = (t: number) => Math.max(0, Math.floor((t - T) / (7 * DAY)));
  const shut = (t: number) => t < T || !room || roomSlots(room, t).every(l => slotClosed(room, t, l));
  const firstOpen = (yy: number, mm: number) => { for (let t = Math.max(T, new Date(yy, mm, 1).getTime()); new Date(t).getMonth() === mm; t += DAY) if (!shut(t)) return t; return Math.max(T, new Date(yy, mm, 1).getTime()); };
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, len = new Date(y, m + 1, 0).getDate();
  const py = b.pickYear ?? y, lastYM = now.getFullYear() * 12 + now.getMonth() + 12;
  const mon = b.view === "month";
  return {
    monthLabel: `${MONTHS[m]} ${y}`, monthOpen: !!b.monthOpen, toggleMonth: () => put({ monthOpen: !b.monthOpen, pickYear: undefined }),
    pickYear: py,
    yPrev: () => { if (py > now.getFullYear()) put({ pickYear: py - 1 }); }, yPrevFg: py > now.getFullYear() ? "#3F2B22" : "#D9C7BA",
    yNext: () => { if (py < now.getFullYear() + 1) put({ pickYear: py + 1 }); }, yNextFg: py < now.getFullYear() + 1 ? "#3F2B22" : "#D9C7BA",
    ymonths: MONTHS.map((label, i) => { const ym = py * 12 + i, ok = ym >= now.getFullYear() * 12 + now.getMonth() && ym <= lastYM, on = py === y && i === m;
      return { label, bg: on ? "#BD4A19" : "transparent", fg: on ? "#fff" : ok ? "#3F2B22" : "#D9C7BA", weight: on ? 700 : 550, cur: ok ? "pointer" : "default",
        pick: () => { if (!ok) return; const t = firstOpen(py, i); put({ day: t, week: weekOf(t), slot: null, monthOpen: false, pickYear: undefined }); } }; }),
    isMonth: mon, isWeek: !mon,
    viewWeek: () => put({ view: "week", week: weekOf(b.day) }), viewMonth: () => put({ view: "month" }),
    viewWeekBg: mon ? "transparent" : "#fff", viewMonthBg: mon ? "#fff" : "transparent", viewWeekSh: mon ? "none" : "0 1px 3px rgba(63,43,34,.14)", viewMonthSh: mon ? "0 1px 3px rgba(63,43,34,.14)" : "none",
    mCells: [...Array.from({ length: lead }, () => null), ...Array.from({ length: len }, (_, k) => new Date(y, m, k + 1).getTime())].map(t => {
      if (t == null) return { n: "", bg: "transparent", fg: "transparent", deco: "none", cur: "default", pick: () => {} };
      const off = shut(t), on = t === b.day;
      return { n: String(new Date(t).getDate()), bg: on ? "#BD4A19" : "transparent", fg: on ? "#fff" : off ? "#C9B8AC" : "#3F2B22", deco: off ? "line-through" : "none", cur: off ? "not-allowed" : "pointer",
        pick: () => { if (!off) put({ day: t, week: weekOf(t), slot: null }); } };
    }),
  };
}

export function bookVM(ctx: DeskCtx, c: CrmCustomer | undefined) {
  const { ui, set, patch, data, now, act } = ctx;
  const rooms = data.rooms.filter(r => r.active);
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const visit = c ? data.visits.filter(v => v.customerId === c.id && v.state === "booked" && new Date(v.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0] : undefined;
  // As the salesperson's sheet (rev 1010 apptChange): a booked visit opens on its own showroom, day and time.
  const vd = visit ? new Date(visit.start) : null, vDay = vd ? new Date(vd.getFullYear(), vd.getMonth(), vd.getDate()).getTime() : 0;
  const b = ui.book ?? (vd
    ? { room: Math.max(0, rooms.findIndex(r => r.id === visit!.showroomId)), day: vDay, slot: timeLabel(vd), week: Math.max(0, Math.floor((vDay - T) / (7 * DAY))) }
    : { room: 0, day: T + DAY, slot: null, week: 0 });
  const room = rooms[b.room] ?? rooms[0];
  const put = (p: Partial<typeof b>) => patch({ book: { ...b, ...p } });
  const counts = ctx.slotCounts;
  const days = Array.from({ length: 7 }, (_, k) => T + (b.week * 7 + k) * DAY).map(t => { const closed = !room || roomSlots(room, t).every(l => slotClosed(room, t, l)), on = t === b.day;
    return { wk: new Date(t).toLocaleDateString("en-MY", { weekday: "short" }), dn: String(new Date(t).getDate()), on, closed,
      bg: on ? "#BD4A19" : "#fff", fg: on ? "#fff" : closed ? "#C9B8AC" : "#3F2B22", bd: on ? "#BD4A19" : "#EBDDD2", deco: closed ? "line-through" : "none",
      pick: () => { if (!closed) put({ day: t, slot: null }); } }; });
  const slots = room ? roomSlots(room, b.day).map(label => { const at = slotAt(b.day, label), n = counts[at.toISOString()] ?? 0;
    const mine = !!visit && new Date(visit.start).getTime() === at.getTime() && visit.showroomId === room.id;
    const off = at <= now || slotClosed(room, b.day, label) || (n >= room.cap && !mine), on = b.slot === label;
    return { label, sub: off ? (slotClosed(room, b.day, label) ? "Closed" : at <= now ? "Past" : "Full") : `${Math.max(0, room.cap - n)} of ${room.cap} free`,
      bg: on ? "#BD4A19" : "#fff", fg: on ? "#fff" : off ? "#C9B8AC" : "#3F2B22", bd: on ? "#BD4A19" : "#EBDDD2", deco: off ? "line-through" : "none", cur: off ? "not-allowed" : "pointer",
      pick: () => { if (!off) put({ slot: label }); } }; }) : [];
  const ok = !!room && !!b.slot && !!c;
  return {
    name: c?.name ?? "", ini: initials(c?.name ?? "?"), has: !!visit,
    current: visit ? `${new Date(visit.start).toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · ${data.rooms.find(r => r.id === visit.showroomId)?.name ?? ""}` : "",
    rooms: rooms.map((r, i) => ({ label: r.name, on: i === b.room, bg: i === b.room ? "#fff" : "transparent", fg: i === b.room ? "#3F2B22" : "#806B60", sh: i === b.room ? "0 1px 3px rgba(63,43,34,.14)" : "none", pick: () => put({ room: i, slot: null }) })),
    weekLabel: `${new Date(days[0] ? T + b.week * 7 * DAY : T).toLocaleDateString("en-MY", { day: "numeric", month: "short" })} – ${new Date(T + (b.week * 7 + 6) * DAY).toLocaleDateString("en-MY", { day: "numeric", month: "short" })}`,
    prev: () => put({ week: Math.max(0, b.week - 1) }), next: () => put({ week: Math.min(12, b.week + 1) }), days, slots, noSlots: !slots.length,
    ...monthOf(b, T, room, put),
    // The salesperson's words: "Change to Tue 13 Oct, 5:00 pm" / "Book …", "Pick a time" until there is one.
    saveLabel: ok ? `${visit ? "Change to" : "Book"} ${dayLabel(new Date(b.day))}, ${b.slot}` : "Pick a time", saveBg: ok ? "#BD4A19" : "#D9C6B8", saveCur: ok ? "pointer" : "not-allowed",
    save: () => { if (!ok || !c || !room || !b.slot) return; const at = slotAt(b.day, b.slot).toISOString();
      void (visit ? act.moveVisit(visit.id, room.id, at) : act.book(c.id, room.id, at)).then(r => { if (r) patch({ kind: "chat", book: null, toast: `${visit ? "Visit changed" : "Visit booked"} for ${c.name}` }); }); },
    cancel: () => { if (visit) void act.cancelVisit(visit.id).then(r => { if (r) patch({ kind: "chat", book: null, toast: `Visit cancelled for ${c?.name ?? ""}` }); }); },
    back: () => patch({ kind: "chat", book: null }),
    week: b.week, room: room?.id ?? "", setCountsFor: room ? { room: room.id, from: T + b.week * 7 * DAY, to: T + (b.week * 7 + 7) * DAY } : null, _set: set,
  };
}

export function noteVM(ctx: DeskCtx, c: CrmCustomer | undefined) {
  const { ui, patch, data, nameOf } = ctx;
  const text = c ? ui.draft[`note:${c.id}`] ?? "" : "";
  const notes = c ? (data.notes ?? []).filter(n => n.customerId === c.id) : [];
  return {
    name: c?.name ?? "", text, setText: (e: { target: { value: string } }) => { if (c) patch({ draft: { ...ui.draft, [`note:${c.id}`]: e.target.value } }); },
    saveBg: text.trim() ? "#BD4A19" : "#D9C6B8", saveCur: text.trim() ? "pointer" : "not-allowed",
    save: () => { if (!c || !text.trim()) return; void ctx.deskAct.addNote(c.id, text.trim()).then(ok => { if (ok) patch({ draft: { ...ui.draft, [`note:${c.id}`]: "" }, toast: "Note added" }); }); },
    notes: notes.map(n => ({ text: n.text, by: n.by ? nameOf(n.by) : "—", at: new Date(n.at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) })),
    none: !notes.length, back: () => patch({ kind: "chat" }),
  };
}

/** Edit customer: the Customer info form the Principal / Director set (Settings › Forms), its fields in its order. */
export function customerFormVM(ctx: DeskCtx, c: CrmCustomer | undefined) {
  const { ui, set, patch, data, act } = ctx;
  const form: FormSection[] = data.forms?.[0]?.sections ?? BASE_FORM;
  const base: Record<string, string> = c ? { name: c.name, phone: c.phone ?? "", type: c.details.type, size: c.details.size, loc: c.details.loc, req: c.details.req, budget: c.details.budget, ...(c.extra ?? {}) } : {};
  const vals = { ...base, ...(ui.cform ?? {}) };
  const put = (id: string, v: string) => set(u => ({ ...u, cform: { ...(u.cform ?? {}), [id]: v } }));
  const missing = form.flatMap(s => s.fields).filter(f => f.req && !String(vals[f.id] ?? "").trim());
  return {
    name: c?.name ?? "",
    sections: form.map(s => ({ title: s.title, fields: s.fields.map(f => ({ id: f.id, label: f.label + (f.req ? " *" : ""), type: f.type, ph: f.ph ?? "", value: vals[f.id] ?? "",
      isText: f.type === "Text" || f.type === "Phone" || f.type === "Number", isLong: f.type === "Long text", isDate: f.type === "Date", isChoice: f.type === "Choice",
      input: f.type === "Number" ? "decimal" : f.type === "Phone" ? "tel" : "text",
      set: (e: { target: { value: string } }) => put(f.id, e.target.value),
      opts: (f.opts ?? []).map(o => { const on = vals[f.id] === o; return { label: o, bg: on ? "#3F2B22" : "#fff", fg: on ? "#fff" : "#3F2B22", bd: on ? "#3F2B22" : "#E2CFC1", pick: () => put(f.id, on ? "" : o) }; }) })) })),
    hint: missing.length ? `Fill in ${missing.map(f => f.label.toLowerCase()).join(", ")}` : "", saveBg: missing.length ? "#D9C6B8" : "#BD4A19", saveCur: missing.length ? "not-allowed" : "pointer",
    save: () => { if (!c || missing.length) return; const builtIn = ["name", "phone", "type", "size", "loc", "req", "budget"], extra: Record<string, string> = {};
      for (const [k, v] of Object.entries(vals)) if (!builtIn.includes(k)) extra[k] = v;
      void act.saveDetails(c.id, { name: vals.name ?? c.name, phone: vals.phone ?? "", type: vals.type ?? "", size: vals.size ?? "", loc: vals.loc ?? "", req: vals.req ?? "", budget: vals.budget ?? "", ...(Object.keys(extra).length ? { extra } : {}) })
        .then(ok => { if (ok) patch({ kind: "info", cform: null, toast: `Saved · ${vals.name ?? c.name}` }); }); },
    back: () => patch({ kind: "info", cform: null }),
  };
}

/** History (the owner, 2026-10-13): who changed which CRM setting, when, before → after (audit_changes). */
export function historyVM(ctx: DeskCtx) {
  const { ui, patch } = ctx;
  const rows = ui.history ?? [];
  const AREA: Record<string, string> = { crm_showrooms: "Showrooms", crm_ad_assign: "Ads to teams", crm_fulltime_rules: "Full time lead allocation", crm_staff: "Member work type", crm_templates: "Cold lead templates", crm_forms: "Forms", crm_access: "Permissions" };
  const f = ui.histF;
  const shown = rows.filter(r => f === "all" || r.table === f);
  return {
    loading: ui.history === null, empty: ui.history !== null && !shown.length,
    chips: [["all", "All"], ...Object.entries(AREA)].map(([k, label]) => { const on = f === k, n = rows.filter(r => k === "all" || r.table === k).length;
      return { label, n: String(n), bg: on ? "#3F2B22" : "#fff", fg: on ? "#fff" : "#3F2B22", bd: on ? "#3F2B22" : "#E2CFC1", nfg: on ? "#E9DCD2" : "#806B60", pick: () => patch({ histF: k }) }; }),
    rows: shown.map(r => ({ area: AREA[r.table] ?? r.table, who: r.who, ini: initials(r.who), at: new Date(r.at).toLocaleString("en-MY", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
      what: r.what, op: r.op === "INSERT" ? "Added" : r.op === "DELETE" ? "Removed" : "Changed", changes: r.changes })),
  };
}
