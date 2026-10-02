/**
 * The member CRM: leads from Meta ads, the conversation with each, the status
 * a salesperson labels them with, and the appointment that books them into a
 * showroom's calendar and their own.
 *
 * Prototype (2026-09-30): the screen runs on demo data (`crm-demo.ts`) until
 * the Meta Lead Ads feed and the tables behind it exist. The rules here are
 * the ones that feed will keep.
 */

/**
 * The status moves by itself: New when the lead arrives → Follow up once the
 * salesperson replies → Appointment when one is booked. Won and Lost are the
 * salesperson's own call, from the chat's ⋯ menu (Lost with a reason).
 */
export type CrmStatus = "new" | "follow_up" | "appointment" | "won" | "lost";

export const CRM_STATUSES: { value: CrmStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "follow_up", label: "Follow up" },
  { value: "appointment", label: "Appointment" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

/** After the salesperson replies: a New lead becomes Follow up; every other status stays. */
export const statusAfterReply = (status: CrmStatus): CrmStatus => (status === "new" ? "follow_up" : status);

/** Won and Lost close a lead — until the customer writes again. */
export const isClosedStatus = (status: CrmStatus) => status === "won" || status === "lost";

export const crmStatusLabel = (status: CrmStatus) =>
  CRM_STATUSES.find(s => s.value === status)?.label ?? status;

/**
 * Why a lead was lost. Collected every time a salesperson marks Lost, so the
 * team can see why customers walk away; Won asks nothing.
 */
export type CrmLostReason = "too_expensive" | "bought_elsewhere" | "no_response" | "not_suitable" | "not_ready" | "other";

export const CRM_LOST_REASONS: { value: CrmLostReason; label: string }[] = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "bought_elsewhere", label: "Bought elsewhere" },
  { value: "no_response", label: "No response" },
  { value: "not_suitable", label: "Product not suitable" },
  { value: "not_ready", label: "Not ready to buy" },
  { value: "other", label: "Other" },
];

export interface CrmLost {
  reason: CrmLostReason;
  note?: string; // required for Other
}

export const lostReasonLabel = (lost: CrmLost) =>
  lost.reason === "other" && lost.note ? lost.note : CRM_LOST_REASONS.find(r => r.value === lost.reason)?.label ?? lost.reason;

/** A Lost reason is complete when it names a reason — and, for Other, says what. */
export const lostReasonComplete = (reason: CrmLostReason | null, note: string) =>
  reason !== null && (reason !== "other" || note.trim().length > 0);

/**
 * Change a lead's status. Lost needs its reason and records it; moving the
 * lead anywhere else clears a reason it no longer has.
 */
export function setLeadStatus(lead: CrmLead, status: CrmStatus, lost?: CrmLost): CrmLead {
  if (status === "lost") {
    if (!lost || !lostReasonComplete(lost.reason, lost.note ?? "")) throw new Error("A Lost lead needs a reason.");
    return { ...lead, status, previous: undefined, lost: { reason: lost.reason, note: lost.reason === "other" ? lost.note?.trim() : undefined } };
  }
  return { ...lead, status, previous: status === lead.status ? lead.previous : undefined, lost: undefined };
}

/**
 * A message from the customer. A Won or Lost customer who writes again comes
 * back to Follow up by themselves — there is no Reopen button — and the lead
 * remembers what it was ("was Lost · Too expensive") so the salesperson knows
 * the history before replying.
 */
export function receiveCustomerMessage(lead: CrmLead, message: CrmMessage): CrmLead {
  const withMessage = { ...lead, unread: lead.unread + 1, messages: [...lead.messages, message] };
  if (!isClosedStatus(lead.status)) return withMessage;
  return { ...withMessage, status: "follow_up", lost: undefined, previous: { status: lead.status, lost: lead.lost } };
}

/** "was Won", "was Lost · Too expensive" — the small grey note beside a reopened lead's status. */
export const previousLabel = (previous: NonNullable<CrmLead["previous"]>) =>
  `was ${crmStatusLabel(previous.status)}${previous.lost ? ` · ${lostReasonLabel(previous.lost)}` : ""}`;

export interface CrmMessage {
  id: string;
  from: "lead" | "me" | "system";
  /** A system note the salesperson caused. A booking answers the customer, so it stops the reply clock. */
  kind?: "booking";
  /** Sent by an auto-reply rule, not typed by the salesperson — it does not stop the reply clock. */
  auto?: boolean;
  /** The appointment card the customer receives when one is booked or moved. */
  card?: { start: string; showroom: string };
  text: string;
  at: string; // ISO timestamp
  /** A photo, video or voice message sent with (or instead of) text. */
  attachment?: CrmAttachment;
  /** A team leader or the Boss who replied in a downline's chat (their member id) — shown as "Replied by …". */
  by?: string;
}

export interface CrmAttachment {
  kind: "image" | "video" | "audio";
  url: string;
  name?: string;
  /** Voice messages: length in seconds. */
  seconds?: number;
}

/** "0:07", "1:23" — a voice message's length. */
export const clipLength = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

/** One line for a lead list or notification: the text, or what was sent when there is none. */
export function messagePreview(message: CrmMessage): string {
  const a = message.attachment;
  if (!a) return message.text;
  const label = a.kind === "image" ? "📷 Photo" : a.kind === "video" ? "🎥 Video" : `🎤 Voice message${a.seconds ? ` (${clipLength(a.seconds)})` : ""}`;
  return message.text ? `${label} · ${message.text}` : label;
}

export interface CrmAppointment {
  id: string;
  leadId: string;
  showroomId: string;
  start: string; // ISO timestamp
  minutes: number;
  /** booked → attended (showed up) or cancelled. Only a booked one holds a calendar slot. */
  state: "booked" | "cancelled" | "attended";
}

/*
 * Only the salesperson books, moves or cancels an appointment. A customer who
 * wants another time says so in the chat; the salesperson confirms it, and the
 * customer is told the new time.
 */

export function rescheduleAppointment(appt: CrmAppointment, start: string, showroomId = appt.showroomId): CrmAppointment {
  if (appt.state !== "booked") throw new Error("Only a booked appointment can be changed.");
  return { ...appt, start, showroomId };
}

export function cancelAppointment(appt: CrmAppointment): CrmAppointment {
  if (appt.state !== "booked") throw new Error("Only a booked appointment can be cancelled.");
  return { ...appt, state: "cancelled" };
}

export function markAttended(appt: CrmAppointment): CrmAppointment {
  if (appt.state !== "booked") throw new Error("Only a booked appointment can be marked as attended.");
  return { ...appt, state: "attended" };
}

/**
 * The lead's status after an appointment is cancelled: back to Follow up —
 * unless another booked appointment still stands, or the lead is already Won or Lost.
 */
export function statusAfterCancel(lead: CrmLead, appointments: CrmAppointment[]): CrmStatus {
  if (lead.status !== "appointment") return lead.status;
  return appointments.some(a => a.leadId === lead.id && a.state === "booked") ? "appointment" : "follow_up";
}

/**
 * The calendar slots booked appointments hold. A cancelled one frees its slot;
 * `exceptId` leaves out the appointment being moved so its own time stays offered.
 */
export function appointmentSlots(appointments: CrmAppointment[], label: string, exceptId?: string): CrmBusySlot[] {
  return appointments
    .filter(a => a.state === "booked" && a.id !== exceptId)
    .map(a => ({ start: a.start, minutes: a.minutes, label }));
}

export interface CrmLead {
  id: string;
  name: string;
  phone: string;
  adName: string; // the Meta ad the lead form came from
  /** The Facebook Page the customer wrote to. */
  pageName?: string;
  /** The person the enquiry was handed to (`crm-team.ts` decides who). Unset while it waits for its TL. */
  assignedTo?: string;
  /** The TL whose team took the enquiry. */
  teamId?: string;
  campaign: string;
  status: CrmStatus;
  lost?: CrmLost; // set exactly while status is Lost
  /** What a Won or Lost lead was before the customer wrote again and it came back to Follow up. */
  previous?: { status: CrmStatus; lost?: CrmLost };
  createdAt: string;
  unread: number;
  messages: CrmMessage[];
}

export interface CrmShowroom {
  id: string;
  name: string;
}

/** A calendar slot someone already holds: a showroom booking or the salesperson's own. */
export interface CrmBusySlot {
  start: string;
  minutes: number;
  label: string;
}

/**
 * Appointment rate = leads that reached an appointment ÷ all leads.
 * A lead counts once however many times it was booked, and still counts after
 * it moves on to Won or Lost — the appointment happened. A cancelled
 * appointment does not count.
 */
export function appointmentRate(leads: CrmLead[], appointments: CrmAppointment[]): {
  leads: number;
  booked: number;
  rate: number | null;
} {
  const booked = new Set(appointments.filter(a => a.state !== "cancelled").map(a => a.leadId).filter(id => leads.some(l => l.id === id)));
  return {
    leads: leads.length,
    booked: booked.size,
    rate: leads.length ? booked.size / leads.length : null,
  };
}

/**
 * How long a customer has been waiting for a reply, and how urgent that is.
 * The clock runs from the customer's latest message while nothing has
 * answered it — a reply, or booking them an appointment. A lead that is Won
 * or Lost never waits.
 *
 * Only OPENING HOURS count (8am–8pm, every day): a message at 11pm starts the
 * clock at 8am, and the night is never held against the salesperson. So
 * "24 hours" is 24 opening hours — two working days.
 */
export type CrmUrgency = "none" | "soon" | "urgent" | "overdue";

export const URGENCY_THRESHOLDS = { soonMinutes: 3 * 60, urgentMinutes: 6 * 60, overdueMinutes: 24 * 60 };

export const OPENING_HOURS = { open: 8, close: 20 };

/** Minutes between two moments that fall inside opening hours (local time). */
export function openMinutesBetween(from: Date, to: Date, hours = OPENING_HOURS): number {
  if (to <= from) return 0;
  let total = 0;
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  while (day <= to) {
    const open = new Date(day); open.setHours(hours.open, 0, 0, 0);
    const close = new Date(day); close.setHours(hours.close, 0, 0, 0);
    const start = Math.max(open.getTime(), from.getTime());
    const end = Math.min(close.getTime(), to.getTime());
    if (end > start) total += end - start;
    day.setDate(day.getDate() + 1);
  }
  return Math.floor(total / 60_000);
}

export const URGENCY_LABELS: Record<Exclude<CrmUrgency, "none">, string> = {
  soon: "Reply soon",
  urgent: "Urgent",
  overdue: "Overdue",
};

export function replyUrgency(lead: CrmLead, now: Date = new Date()): { level: CrmUrgency; waitingMinutes: number } {
  if (lead.status === "won" || lead.status === "lost") return { level: "none", waitingMinutes: 0 };
  const last = [...lead.messages].reverse().find(m => (m.from !== "system" || m.kind === "booking") && !m.auto);
  if (!last || last.from !== "lead") return { level: "none", waitingMinutes: 0 };
  const waitingMinutes = openMinutesBetween(new Date(last.at), now);
  const t = URGENCY_THRESHOLDS;
  const level: CrmUrgency =
    waitingMinutes >= t.overdueMinutes ? "overdue"
      : waitingMinutes >= t.urgentMinutes ? "urgent"
        : waitingMinutes >= t.soonMinutes ? "soon"
          : "none";
  return { level, waitingMinutes };
}

/** "45 min", "6 h", "30 h" — opening hours the customer has waited. */
export function waitingLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`;
}

/**
 * The automatic rule: a customer left unanswered past the overdue line is
 * moved to Follow up. Only New moves — a lead already Follow up, booked, Won
 * or Lost keeps its status.
 */
export function applyAutoFollowUp(leads: CrmLead[], now: Date = new Date()): CrmLead[] {
  return leads.map(lead =>
    lead.status === "new" && replyUrgency(lead, now).level === "overdue"
      ? { ...lead, status: "follow_up" }
      : lead,
  );
}

const URGENCY_RANK: Record<CrmUrgency, number> = { overdue: 0, urgent: 1, soon: 2, none: 3 };

/** Most urgent first; inside one level, whoever has waited longest; then newest activity. */
export function sortByUrgency(leads: CrmLead[], now: Date = new Date()): CrmLead[] {
  const lastAt = (l: CrmLead) => l.messages[l.messages.length - 1]?.at ?? l.createdAt;
  return [...leads].sort((a, b) => {
    const ua = replyUrgency(a, now), ub = replyUrgency(b, now);
    return URGENCY_RANK[ua.level] - URGENCY_RANK[ub.level]
      || ub.waitingMinutes - ua.waitingMinutes
      || lastAt(b).localeCompare(lastAt(a));
  });
}

const overlaps = (aStart: number, aMin: number, bStart: number, bMin: number) =>
  aStart < bStart + bMin * 60_000 && bStart < aStart + aMin * 60_000;

/** Whether a slot collides with anything already on a calendar. */
export function slotClash(start: string, minutes: number, busy: CrmBusySlot[]): CrmBusySlot | null {
  const t = new Date(start).getTime();
  return busy.find(b => overlaps(t, minutes, new Date(b.start).getTime(), b.minutes)) ?? null;
}

/** The bookable slots of one day, on the hour, within opening hours (8am–8pm; the last starts at 7pm). */
export function daySlots(day: Date, openHour = OPENING_HOURS.open, closeHour = OPENING_HOURS.close, minutes = 60): string[] {
  const slots: string[] = [];
  for (let h = openHour; h + minutes / 60 <= closeHour; h++) {
    const d = new Date(day);
    d.setHours(h, 0, 0, 0);
    slots.push(d.toISOString());
  }
  return slots;
}

/** "Now", "in 45 min", "in 3 h", "Tomorrow", "in 3 days" — how soon an appointment is. */
export function relativeWhen(start: string, now: Date = new Date()): string {
  const t = new Date(start);
  const minutes = Math.round((t.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `in ${minutes} min`;
  const dayDiff = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  if (dayDiff === 0) return `in ${Math.floor(minutes / 60)} h`;
  if (dayDiff === 1) return "Tomorrow";
  return `in ${dayDiff} days`;
}

/** Booked appointments from now on, soonest first, grouped by local day (key = yyyy-mm-dd). */
export function upcomingByDay(appointments: CrmAppointment[], now: Date = new Date()): { day: string; items: CrmAppointment[] }[] {
  const key = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const groups = new Map<string, CrmAppointment[]>();
  for (const a of [...appointments].filter(a => a.state === "booked" && new Date(a.start) > now).sort((a, b) => a.start.localeCompare(b.start))) {
    const k = key(a.start);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return [...groups].map(([day, items]) => ({ day, items }));
}

/**
 * Show-up rate = appointments the customer came to ÷ appointments that were due.
 * Due = its time has passed and it was not cancelled. A past appointment
 * nobody marked "Showed up" counts as a no-show; a cancelled one is left out
 * — it was never due.
 */
export function showUpRate(appointments: CrmAppointment[], now: Date = new Date()): { due: number; showed: number; rate: number | null } {
  const due = appointments.filter(a => a.state === "attended" || (a.state === "booked" && new Date(a.start) <= now));
  const showed = due.filter(a => a.state === "attended").length;
  return { due: due.length, showed, rate: due.length ? showed / due.length : null };
}

/**
 * The contact list: every customer, searchable by name or phone (digits only,
 * and the Malaysian 012… and +60 12… are the same number), optionally one Page, A–Z.
 */
const localDigits = (phone: string) => phone.replace(/\D/g, "").replace(/^60/, "0");

export function searchContacts(leads: CrmLead[], query: string, pageName?: string): CrmLead[] {
  const q = query.trim().toLowerCase();
  const digits = localDigits(q);
  return leads
    .filter(l => !pageName || l.pageName === pageName)
    .filter(l => !q || l.name.toLowerCase().includes(q) || (digits.length >= 3 && localDigits(l.phone).includes(digits)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Auto-replies ───────────────────────────────────────────────────────── */

export interface CrmAutoReplySettings {
  /** The first message from a new customer. */
  welcome: { on: boolean; text: string };
  /** A message outside opening hours (8am–8pm). */
  afterHours: { on: boolean; text: string };
  /** A word in the customer's message → a canned answer. Case-insensitive. */
  keywords: { id: string; on: boolean; words: string; text: string }[];
}

export const DEFAULT_AUTO_REPLIES: CrmAutoReplySettings = {
  welcome: { on: true, text: "Hi! Thanks for contacting us 😊 A salesperson will reply shortly. May we have your name and phone number?" },
  afterHours: { on: true, text: "Thanks for your message! We're open 8am–8pm daily and will reply first thing tomorrow." },
  keywords: [
    { id: "price", on: true, words: "price, harga, 价钱, 價錢, how much", text: "Our prices depend on size and design. Share your measurements and we'll send a quote." },
    { id: "location", on: true, words: "address, location, alamat, 地址, where", text: "You can visit our showroom — ask your salesperson for the nearest one and the opening hours." },
  ],
};

const isOpen = (at: Date, hours = OPENING_HOURS) => at.getHours() >= hours.open && at.getHours() < hours.close;

/**
 * The auto-replies a customer's message triggers, in the order they are sent:
 * the welcome (first message only), the after-hours note, then every keyword
 * rule whose word appears. Each rule fires once per message.
 */
export function autoRepliesFor(lead: CrmLead, message: CrmMessage, settings: CrmAutoReplySettings): string[] {
  if (message.from !== "lead") return [];
  const out: string[] = [];
  const earlier = lead.messages.filter(m => m.from === "lead" && m.id !== message.id);
  if (settings.welcome.on && earlier.length === 0 && settings.welcome.text.trim()) out.push(settings.welcome.text.trim());
  if (settings.afterHours.on && !isOpen(new Date(message.at)) && settings.afterHours.text.trim()) out.push(settings.afterHours.text.trim());
  const text = message.text.toLowerCase();
  for (const rule of settings.keywords) {
    if (!rule.on || !rule.text.trim()) continue;
    const words = rule.words.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
    if (words.some(w => text.includes(w))) out.push(rule.text.trim());
  }
  return out;
}

