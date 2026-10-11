import { DAY_END, DAY_START, SLOT, bookerName, departmentBadge, departmentRank, hm, shiftDay, type Booking, type RoomsPeople, type RoomsRange } from "@/lib/rooms/model";

/**
 * Book a room in the Revenue app (2026-10-11, HR revamp round 2 — README
 * 18.4, `Revenue Member App.dc.html` lines 103–131, 189–211, 368–404): the
 * prototype's `roomVals()`, worked out from what the database answers. Pure —
 * RoomsPage draws it, the app holds the state.
 *
 * The phone's timeline is 64px an hour (the portal's grid is 52); a day runs
 * 08:00–20:00 in half hours. Own meetings are orange, the rest of HQ slate,
 * the guest link's subsidiaries light orange; only the booker may cancel.
 */

export type RoomsMode = "cards" | "timeline";
/** The phone timeline's height of one hour. */
export const HOUR = 64;

export interface MemberRoomsData {
  range: RoomsRange;
  people: RoomsPeople;
}

/** The book sheet's fields, as the prototype keeps them (`rf`). */
export interface RoomsForm {
  title: string;
  /** `sub:<id>` (a Revenue sub-department) or `dept:<id>`; '' = not picked. */
  dept: string;
  room: string;
  /** Minutes from midnight as text; '' = not picked. */
  from: string;
  to: string;
  /** Colleagues attending, by staff id — the member first. */
  att: string[];
  /** The headcount set with − / + (never under the named). */
  pax: number;
  q: string;
}

/** Which sheet is up: the book form, or one booking. */
export type RoomsSheet = { k: "book" } | { k: "view"; id: string } | null;

/** A meeting's bar and fill: the guest link's subsidiaries, the reader's own, the rest of HQ. */
export const ROOM_TONE = {
  guest: { bar: "var(--rv-accent-soft)", tint: "var(--rv-guest-bg)" },
  mine: { bar: "var(--rv-accent)", tint: "var(--rv-peach-bg)" },
  other: { bar: "var(--rv-slate)", tint: "var(--rv-slate-bg)" },
} as const;
export type RoomTone = keyof typeof ROOM_TONE;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const partsOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return { m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** "Sat 10 Oct" — en-GB's weekday, day, month, with the portal's three-letter month. */
export function sheetDay(day: string): string {
  const { m, d, dow } = partsOf(day);
  return `${WEEKDAYS[dow]} ${d} ${MONTHS[m - 1]}`;
}

/** The seven day chips from today: "Today", then the weekday. */
export function dayChips(today: string, picked: string): Array<{ day: string; wd: string; n: string; on: boolean }> {
  return Array.from({ length: 7 }, (_, i) => shiftDay(today, i)).map(day => {
    const { d, dow } = partsOf(day);
    return { day, wd: day === today ? "Today" : WEEKDAYS[dow], n: String(d), on: day === picked };
  });
}

export const toneOf = (b: Pick<Booking, "source" | "mine">): RoomTone => (b.source === "guest" ? "guest" : b.mine ? "mine" : "other");

/** "Meeting Room 1" → "Room 1" — the timeline's column heads. */
export const shortRoom = (name: string): string => name.replace("Meeting Room", "Room");

/** A booking's line under its title: who it is for (the subsidiary, for a guest booking) and the headcount. */
export const whoLine = (b: Pick<Booking, "source" | "guestCompany" | "bookedBy" | "onBehalfBy" | "pax">): string =>
  `${b.source === "guest" ? b.guestCompany ?? "Guest" : bookerName(b)} · ${b.pax} pax`;

/** The lines a timeline block shows its title on: one for half an hour, three for an hour, five beyond. */
export const clampOf = (from: number, to: number): number => (to - from <= 30 ? 1 : to - from <= 60 ? 3 : 5);

/** A block on the phone's timeline: 1px in from the line above, 2px short of the next. */
export const blockAt = (from: number, to: number): { top: number; height: number } =>
  ({ top: ((from - DAY_START) / 60) * HOUR + 1, height: ((to - from) / 60) * HOUR - 2 });

/** The half hour a press on a room's column lands on (never later than 19:30). */
export function slotOfPress(offsetY: number, height: number): number {
  const m = DAY_START + Math.floor(((offsetY / Math.max(1, height)) * (DAY_END - DAY_START)) / SLOT) * SLOT;
  return Math.max(DAY_START, Math.min(m, DAY_END - SLOT));
}

/** The From / To lists: every half hour, 08:00 to 20:00. */
export const TIMES: ReadonlyArray<{ v: string; l: string }> = Array.from({ length: (DAY_END - DAY_START) / SLOT + 1 }, (_, i) => {
  const m = DAY_START + i * SLOT;
  return { v: String(m), l: hm(m) };
});

/**
 * The Department list: the Revenue Department's sub-departments ("Revenue ·
 * Fair", "Revenue · IR"), then HQ's other departments in the legend's order.
 */
export function deptOptions(people: Pick<RoomsPeople, "departments" | "subDepartments">): Array<{ v: string; l: string }> {
  const revenue = people.departments.find(d => departmentRank(d.name) === 0);
  const subs = people.subDepartments
    .filter(s => !revenue || s.departmentId === revenue.id)
    .map(s => ({ v: `sub:${s.id}`, l: `Revenue · ${s.name}` }));
  const rest = [...people.departments]
    .filter(d => !(subs.length && revenue && d.id === revenue.id))
    .sort((a, b) => departmentRank(a.name) - departmentRank(b.name))
    .map(d => ({ v: `dept:${d.id}`, l: departmentBadge(d.name).label }));
  return [...subs, ...rest];
}

/** A new booking: the member attending, their own sub-department, the room and half hour pressed (an hour long). */
export function newForm(people: Pick<RoomsPeople, "me" | "departments" | "subDepartments">, room?: string | null, from?: number | null): RoomsForm {
  const me = people.me;
  const options = deptOptions(people);
  const own = me?.subDepartmentId ? `sub:${me.subDepartmentId}` : me?.departmentId ? `dept:${me.departmentId}` : "";
  const dept = options.some(o => o.v === own) ? own : options[0]?.v ?? "";
  return {
    title: "",
    dept,
    room: room ?? "",
    from: from != null ? String(from) : "",
    to: from != null ? String(Math.min(from + 60, DAY_END)) : "",
    att: me ? [me.staffId] : [],
    pax: 1,
    q: "",
  };
}

/** The From change: the end stays when it is still after the start, else moves an hour on (never past 20:00). */
export function withFromTime(form: RoomsForm, from: string): RoomsForm {
  const to = form.to && Number(form.to) > Number(from) ? form.to : from === "" ? form.to : String(Math.min(Number(from) + 60, DAY_END));
  return { ...form, from, to };
}

/** The headcount: never under the named. */
export const totalOf = (form: Pick<RoomsForm, "att" | "pax">): number => Math.max(form.att.length, form.pax || 1);

/** "2 named + 3 more". */
export function paxNote(form: Pick<RoomsForm, "att" | "pax">): string {
  const total = totalOf(form);
  return `${form.att.length} named${total > form.att.length ? ` + ${total - form.att.length} more` : ""}`;
}

/** Colleagues matching what is typed, not already attending — six at most. */
export function suggestions(form: Pick<RoomsForm, "att" | "q">, people: Pick<RoomsPeople, "people">): Array<{ id: string; name: string }> {
  const q = form.q.trim().toLowerCase();
  if (!q) return [];
  return people.people.filter(p => !form.att.includes(p.id) && p.name.toLowerCase().includes(q)).slice(0, 6).map(p => ({ id: p.id, name: p.name }));
}

/** What the sheet checks before asking the database (the prototype's `book()`), or null. */
export function formProblem(form: RoomsForm, day: string, bookings: readonly Booking[]): string | null {
  const from = Number(form.from);
  const to = Number(form.to);
  if (!form.title.trim() || !form.dept || !form.room || !from || !to) return "Add a title, department, room and time.";
  if (to <= from) return "End must be after start.";
  const clash = bookings.find(b => !b.cancelled && b.room === form.room && b.day === day && b.from < to && from < b.to);
  return clash ? `Taken ${hm(clash.from)}–${hm(clash.to)} · ${clash.title}` : null;
}

/** What the form books: a sub-department or a department, the time in minutes, the headcount. */
export function bookingOfForm(form: RoomsForm, day: string): {
  room: string; day: string; from: number; to: number; title: string; department: string | null; subDepartment: string | null; internal: string[]; pax: number;
} {
  return {
    room: form.room,
    day,
    from: Number(form.from),
    to: Number(form.to),
    title: form.title.trim(),
    department: form.dept.startsWith("dept:") ? form.dept.slice(5) : null,
    subDepartment: form.dept.startsWith("sub:") ? form.dept.slice(4) : null,
    internal: form.att,
    pax: totalOf(form),
  };
}

/** The bookings of one day in one room, earliest first (cancelled ones gone). */
export function dayBookings(bookings: readonly Booking[], room: string, day: string): Booking[] {
  return bookings.filter(b => !b.cancelled && b.room === room && b.day === day).sort((a, b) => a.from - b.from);
}

/** A booking opened: when, its four facts, and whether the reader may cancel it. */
export function bookingFacts(b: Booking, roomName: string): { when: string; facts: Array<{ l: string; v: string }> } {
  return {
    when: `${sheetDay(b.day)} · ${hm(b.from)}–${hm(b.to)}`,
    facts: [
      { l: "Room", v: roomName },
      { l: "Booked by", v: bookerName(b) },
      { l: "From", v: b.source === "guest" ? b.guestCompany ?? "Guest" : departmentBadge(b.department).label },
      { l: "People", v: `${b.pax} pax` },
    ],
  };
}
