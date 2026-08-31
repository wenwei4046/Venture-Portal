/**
 * The header clock runs on OFFICE time, not the viewer's.
 *
 * This started as a hydration bug: greeting, date and quarter came from
 * `new Date()` during render, Vercel runs in UTC and the office is UTC+8, so
 * for eight hours of every day the server and the browser disagreed and React
 * threw a mismatch on every page in the portal. Reading them after mount fixed
 * the error but left the header a frame behind.
 *
 * Pinning the zone fixes it properly, and is the more honest answer anyway:
 * "Q3 2026" on an internal ledger is a fact about the COMPANY's quarter, not
 * about where the person reading it happens to be standing. A director opening
 * the portal from London should see the period the accounts are kept in.
 * Server and client compute the same string, so it renders during SSR again —
 * no hydration error, and no delay.
 *
 * Pure, and takes its `Date`, so the boundaries can actually be tested: the
 * ones that bite are midnight (hour 0, not 24), the date rolling a day ahead of
 * UTC, and a quarter or year turning over eight hours early.
 */

export const OFFICE_TZ = 'Asia/Kuala_Lumpur'

export interface Clock {
  greeting: string
  date: string
  quarter: string
}

export function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find(p => p.type === type)?.value ?? ''
}

export function officeClock(at: Date = new Date()): Clock {
  // en-US, not en-GB: en-GB abbreviates September as "Sept", and this label
  // has always read "Sep" (it was dayjs `MMM`). The order is assembled below
  // rather than taken from the locale, so only the NAMES come from it.
  // hourCycle h23 because `hour12: false` reports midnight as 24 on some
  // engines.
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at)

  // Separate pass: the label wants "Aug", the quarter wants 8.
  const monthNo = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TZ,
    month: 'numeric',
  }).formatToParts(at)

  const year = part(label, 'year')

  return {
    greeting: getGreeting(Number(part(label, 'hour'))),
    date: `${part(label, 'weekday')} ${part(label, 'day')} ${part(label, 'month')} ${year}`,
    quarter: `Q${Math.floor((Number(part(monthNo, 'month')) - 1) / 3) + 1} ${year}`,
  }
}
