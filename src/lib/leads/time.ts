// Lead View (2026-10-16): when a message or a lead happened, in the office's time (UTC+8).

import { formatIntlDate } from '@/lib/utils'

const TZ = 'Asia/Kuala_Lumpur'

/** The office's day of an instant, YYYY-MM-DD. */
export function officeDayOf(iso: string): string {
  return formatIntlDate(new Date(iso), { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA')
}

/** 14:05 on the office's today, else 16 Oct. */
export function whenShort(iso: string, today: string): string {
  const d = new Date(iso)
  if (officeDayOf(iso) === today) return formatIntlDate(d, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }, 'en-GB')
  return formatIntlDate(d, { timeZone: TZ, day: 'numeric', month: 'short' }, 'en-GB')
}

/** 16 Oct 14:05. */
export function whenFull(iso: string): string {
  return formatIntlDate(new Date(iso), { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }, 'en-GB')
}

/** 14:05, in the office's time. */
export function timeOf(iso: string): string {
  return formatIntlDate(new Date(iso), { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }, 'en-GB')
}

/** 16 Oct — a day's rule in the chat (Inbox v2, 2026-10-22). */
export function dayLabel(iso: string): string {
  return formatIntlDate(new Date(iso), { timeZone: TZ, day: 'numeric', month: 'short' }, 'en-GB')
}
