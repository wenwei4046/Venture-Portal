/**
 * A partner's booking link (2026-10-29, mig 20261029190000; the owner: The Conts' own salespeople book a showroom slot
 * from a link, no sign-in, straight onto the CRM's calendar — "2 个 slot 满了之后，crm 也无法再预约"). The page's shapes and
 * the showroom's rules as the database keeps them (crm_slot_check), worked on the office's day as text, never a Date in
 * the browser's own time zone.
 */

export interface PartnerBlock { a: string; b?: string | null; t1?: string | null; t2?: string | null; ranges?: { f: string; t: string }[] | null }
export interface PartnerRoom { id: string; name: string; address: string; slots: string[]; cap: number; weekly: number[]; blocks: PartnerBlock[] }
export type PartnerPage = { on: false } | { on: true; name: string; today: string; rooms: PartnerRoom[]; form: PartnerForm };
/** The answers to the booking form's own questions, by question id (the six below until 2026-10-29). */
export type PartnerInfo = Record<string, string>;
/**
 * The booking form the CRM puts in use (2026-10-29, mig 20261030040000; the owner: "我从这边调整，使用者的画面也会更新"):
 * its sections and questions. booker / bookerPhone / customer / customerPhone / remarks / note are the booking's own columns;
 * every other id is a question of the form's own, answered into info.
 */
export interface PartnerFormField { id: string; label: string; type: "Text" | "Long text" | "Choice" | "Number" | "Phone" | "Date" | "Range"; req: boolean; opts: string[] }
export interface PartnerFormSection { title: string; fields: PartnerFormField[] }
export type PartnerForm = PartnerFormSection[];
export const COLUMN_FIELDS = ["booker", "bookerPhone", "customer", "customerPhone", "remarks", "note"] as const;
export interface PartnerBooked {
  ref: string; showroom: string; showroomName: string; start: string; minutes: number; state: "booked" | "cancelled";
  booker: string; bookerPhone: string; customer: string; customerPhone: string; info: PartnerInfo; remarks: string; note: string;
}
/** Starts already booked at a showroom (ISO → how many), the CRM's and the partner's together. */
export type PartnerTaken = Record<string, number>;

export const isPartnerCode = (v: unknown): v is string => typeof v === "string" && /^pc-[A-HJ-NP-Z2-9]{8}$/.test(v);
export const isPartnerRef = (v: unknown): v is string => typeof v === "string" && /^TC-[A-HJ-NP-Z2-9]{6}$/i.test(v.trim());
export const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const INFO_KEYS = ["project", "unit", "type", "size", "pax", "budget"] as const;
export const INFO_LABELS: Record<(typeof INFO_KEYS)[number], string> = {
  project: "Project / unit location", unit: "Unit no.", type: "Property type", size: "Unit size", pax: "No. of people coming", budget: "Budget",
};

const F = (id: string, label: string, type: PartnerFormField["type"] = "Text", req = false): PartnerFormField => ({ id, label, type, req, opts: [] });
/** The page's questions as they were before the CRM could set them — and what it asks while no booking form is saved. */
export const DEFAULT_PARTNER_FORM: PartnerForm = [
  { title: "You", fields: [F("booker", "Your name", "Text", true), F("bookerPhone", "Your phone", "Phone")] },
  { title: "Customer", fields: [F("customer", "Customer name", "Text", true), F("customerPhone", "Customer phone", "Phone", true),
    F("project", "Project / unit location"), F("unit", "Unit no."), F("type", "Property type"), F("size", "Unit size"), F("pax", "No. of people coming", "Number"), F("budget", "Budget")] },
  { title: "Notes", fields: [F("remarks", "Remarks for the showroom", "Long text"), F("note", "Your own note", "Long text")] },
];
/** crm_forms' sections as the page asks them; nothing usable — the default. The three a booking cannot do without are always asked. */
export function formFromRow(v: unknown): PartnerForm {
  if (!Array.isArray(v)) return DEFAULT_PARTNER_FORM;
  const out: PartnerForm = (v as Record<string, unknown>[]).map(s => ({ title: str(s.title),
    fields: (Array.isArray(s.fields) ? (s.fields as Record<string, unknown>[]) : []).filter(f => str(f.id) && str(f.label)).map(f => ({
      id: str(f.id), label: str(f.label), type: (str(f.type) || "Text") as PartnerFormField["type"],
      req: ["booker", "customer", "customerPhone"].includes(str(f.id)) || Number(f.req) === 1, opts: Array.isArray(f.opts) ? (f.opts as unknown[]).map(str).filter(Boolean) : [] })) }))
    .filter(s => s.fields.length);
  if (!out.length) return DEFAULT_PARTNER_FORM;
  const has = new Set(out.flatMap(s => s.fields.map(f => f.id)));
  for (const f of DEFAULT_PARTNER_FORM.flatMap(s => s.fields).filter(f => f.req)) if (!has.has(f.id)) out[0].fields.unshift({ ...f });
  return out;
}
/** The label a booking's answer is shown under: the form's own, else the old six's, else the id. */
export function infoLabel(form: PartnerForm | null | undefined, id: string): string {
  return form?.flatMap(s => s.fields).find(f => f.id === id)?.label ?? (INFO_LABELS as Record<string, string>)[id] ?? id;
}
/** The first required question of the form left empty, as the database would say it ("Fill in Budget."), or null. */
export function missingAnswer(form: PartnerForm, values: Record<string, string>): string | null {
  const f = form.flatMap(s => s.fields).find(x => x.req && !COLUMN_REQUIRED.has(x.id) && !(values[x.id] ?? "").trim());
  return f ? `Fill in ${f.label}.` : null;
}
const COLUMN_REQUIRED = new Set(["booker", "customer", "customerPhone"]);

export function pageFromRow(row: unknown): PartnerPage {
  const r = row as Record<string, unknown> | null;
  if (!r || r.on !== true) return { on: false };
  const rooms = Array.isArray(r.rooms) ? (r.rooms as Record<string, unknown>[]).map(x => ({
    id: str(x.id), name: str(x.name), address: str(x.address),
    slots: Array.isArray(x.slots) ? (x.slots as unknown[]).map(str) : [], cap: Number(x.cap) || 1,
    weekly: Array.isArray(x.weekly) ? (x.weekly as unknown[]).map(Number) : [], blocks: Array.isArray(x.blocks) ? (x.blocks as PartnerBlock[]) : [],
  })) : [];
  return { on: true, name: str(r.name), today: str(r.today), rooms, form: formFromRow(r.form) };
}

export function bookedFromRow(row: unknown): PartnerBooked | null {
  const r = row as Record<string, unknown> | null;
  if (!r || !r.ref) return null;
  const info: PartnerInfo = {};
  const raw = (r.info ?? {}) as Record<string, unknown>;
  for (const k of INFO_KEYS) if (raw[k]) info[k] = str(raw[k]);
  return { ref: str(r.ref), showroom: str(r.showroom), showroomName: str(r.showroomName), start: str(r.start), minutes: Number(r.minutes) || 60,
    state: r.state === "cancelled" ? "cancelled" : "booked", booker: str(r.booker), bookerPhone: str(r.bookerPhone), customer: str(r.customer),
    customerPhone: str(r.customerPhone), info, remarks: str(r.remarks), note: str(r.note) };
}

export function takenFromRows(rows: unknown): PartnerTaken {
  const out: PartnerTaken = {};
  for (const x of Array.isArray(rows) ? (rows as { start?: unknown; booked?: unknown }[]) : []) out[new Date(str(x.start)).toISOString()] = Number(x.booked) || 0;
  return out;
}

// ── The office's calendar, as text ─────────────────────────────────────────────────────────────────────────────────────

/** The day `n` days after a YYYY-MM-DD. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** 0 = Sunday … 6 = Saturday, as Postgres's dow. */
export const dowOf = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
/** The instant a slot starts: the office's (UTC+8) wall time. */
export const startOf = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00+08:00`).toISOString();
/** 14:00 → 2:00 pm. */
export function t12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const inBlock = (b: PartnerBlock, ymd: string) => ymd >= b.a && ymd <= (b.b || b.a);
const hoursOf = (b: PartnerBlock) => [...(Array.isArray(b.ranges) ? b.ranges : []), ...(b.t1 && b.t2 ? [{ f: b.t1, t: b.t2 }] : [])];

/** Whether the showroom is closed the whole day (a weekly day off or a closure with no hours). */
export function dayClosed(r: PartnerRoom, ymd: string): boolean {
  return r.weekly.includes(dowOf(ymd)) || r.blocks.some(b => inBlock(b, ymd) && !hoursOf(b).length);
}
/** The times the showroom takes bookings that day (HH:MM, sorted), less the hours a closure takes. */
export function timesOf(r: PartnerRoom, ymd: string): string[] {
  if (dayClosed(r, ymd)) return [];
  const mon0 = String((dowOf(ymd) + 6) % 7);
  const offered = r.slots.filter(s => !s.includes("@") || s.split("@")[1].includes(mon0)).map(s => s.split("@")[0]);
  const shut = r.blocks.filter(b => inBlock(b, ymd)).flatMap(hoursOf);
  return [...new Set(offered)].filter(t => !shut.some(w => t >= w.f && t < w.t)).sort();
}

export interface SlotView { time: string; label: string; start: string; left: number; full: boolean; past: boolean }
/** Each time that day with what is left of the showroom's limit; `except` = the booking being moved (it does not take its own place). */
export function slotsOf(r: PartnerRoom, ymd: string, taken: PartnerTaken, now: Date, except?: { showroom: string; start: string } | null): SlotView[] {
  return timesOf(r, ymd).map(time => {
    const start = startOf(ymd, time);
    // The booking being moved holds one of this slot's places — only when the count read has it (a count read before it was
    // booked does not), and never more places than the showroom has.
    const n = taken[start] ?? 0, own = except && except.showroom === r.id && new Date(except.start).toISOString() === start && n > 0 ? 1 : 0;
    const left = Math.min(r.cap, Math.max(0, r.cap - (n - own)));
    const past = new Date(start) <= now;
    return { time, label: t12(time), start, left, full: left <= 0, past };
  });
}

/** What the form still needs before it can be sent, else null (the database asks the same). */
export function bookingProblem(f: { room: string; start: string; booker: string; customer: string; customerPhone: string }): string | null {
  if (!f.room) return "Pick a showroom.";
  if (!f.start) return "Pick a date and a time.";
  if (!f.booker.trim()) return "Type your name.";
  if (!f.customer.trim()) return "Type the customer's name.";
  const p = f.customerPhone.trim();
  if (p.length < 6 || p.length > 30 || !/^[0-9 +()-]+$/.test(p)) return "Type the customer's phone number: at least 6 digits.";
  return null;
}

/** What a stranger may read of a refusal: the functions' own words (P0001 / 42501 / 22023), else the fallback. */
const REFUSALS = new Set(["P0001", "42501", "22023"]);
export function partnerRefusal(error: { code?: string | null; message?: string | null } | null | undefined, fallback: string): string {
  if (!error) return fallback;
  const m = typeof error.message === "string" ? error.message.trim() : "";
  if (!m || typeof error.code !== "string" || !REFUSALS.has(error.code) || /^permission denied\b/i.test(m)) return fallback;
  return m;
}
