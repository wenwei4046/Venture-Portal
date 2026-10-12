/**
 * The prototype's number and date spellings, one helper each, so every screen
 * writes "RM 57,930", "RM 6,842.50", "4th" and "Sat, 3 Oct" the same way.
 */

const whole = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `RM 57,930` — whole ringgit (the prototype's `rm`). */
export function rm(n: number): string {
  return "RM " + whole.format(Math.round(n));
}

/** `RM 6,842.50` — to the sen (the prototype's `rm2`). */
export function rm2(n: number): string {
  return "RM " + cents.format(n);
}

/** `4th`, `21st`, `112th`. */
export function ordinal(n: number): string {
  return n + ordinalSuffix(n);
}

export function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** `JT` for Jia Hui Tan — the first word's letter and the last's, as the prototype writes them; `PR` for one word. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** `Jia Hui` for Jia Hui Tan — the first two words (the prototype's `first`). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).join(" ");
}

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Today in Kuala Lumpur as `YYYY-MM-DD`. */
export function klToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** `Sat, 3 Oct` */
export function dayLabel(date: string): string {
  const d = utc(date);
  return `${WEEKDAYS_SHORT[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** `Sun 4 Oct 2026` */
export function longDayLabel(date: string): string {
  const d = utc(date);
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** `Q4 2026` */
export function quarterLabel(date: string): string {
  const d = utc(date);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

/** `September` for `2026-09` */
export function monthName(period: string): string {
  return MONTHS_LONG[Number(period.slice(5, 7)) - 1] ?? period;
}

/** `Sep 2026` for `2026-09` */
export function monthShort(period: string): string {
  return `${MONTHS_SHORT[Number(period.slice(5, 7)) - 1] ?? ""} ${period.slice(0, 4)}`;
}

/** `5 Oct` */
export function shortDay(date: string): string {
  const d = utc(date);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** `Fri` — a day's weekday. */
export function weekdayShort(date: string): string {
  return WEEKDAYS_SHORT[utc(date).getUTCDay()];
}

/** `9, 10, 11 Oct`, or `30, 31 Oct, 1 Nov` across a month end — a food claim's days (2026-10-13). */
export function dayList(days: readonly string[]): string {
  const parts: string[] = [];
  let run: number[] = [];
  let month = -1;
  for (const day of [...days].sort()) {
    const d = utc(day);
    if (d.getUTCMonth() !== month && run.length) {
      parts.push(`${run.join(", ")} ${MONTHS_SHORT[month]}`);
      run = [];
    }
    month = d.getUTCMonth();
    run.push(d.getUTCDate());
  }
  if (run.length) parts.push(`${run.join(", ")} ${MONTHS_SHORT[month]}`);
  return parts.join(", ");
}

/** `9–11 Oct`, or `30 Oct – 1 Nov` across a month end. */
export function dayRange(start: string, end: string): string {
  const a = utc(start), b = utc(end);
  if (start === end) return shortDay(start);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS_SHORT[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS_SHORT[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS_SHORT[b.getUTCMonth()]}`;
}

/** An instant's wall clock in Kuala Lumpur: date, hour and minute. */
function klParts(iso: string): { date: string; hour: number; minute: number } | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** The day an instant falls on in Kuala Lumpur, `YYYY-MM-DD`. */
export function klDate(iso: string): string {
  return klParts(iso)?.date ?? "";
}

/** `28 Sep, 10:42` — an audit entry's time in Kuala Lumpur. */
export function klDayTime(iso: string): string {
  const p = klParts(iso);
  if (!p) return "";
  return `${shortDay(p.date)}, ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** `2 Oct 2026, 9:00 am` — a memo's full time in Kuala Lumpur. */
export function klLongTime(iso: string): string {
  const p = klParts(iso);
  if (!p) return "";
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${shortDay(p.date)} ${p.date.slice(0, 4)}, ${h12}:${String(p.minute).padStart(2, "0")} ${p.hour < 12 ? "am" : "pm"}`;
}

/** `Good morning` / `Good afternoon` / `Good evening`, by the hour in Kuala Lumpur. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hour12: false }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
