/**
 * A Sales Attending delivery from the Houzs ERP — `POST /api/erp/v1/sales-attending`,
 * contract §10 (2026-10-12).
 *
 * The ERP lists, on every project (a brand's booth at a fair), the
 * salespeople attending it. That is a seller's brand week now (user
 * 2026-10-12: "1 layer is use track by erp houzs, if fail, then go with auto
 * detect, same engine with previous one") — the booth whose Fair result earns
 * them points that weekend, and the fair a claim is for.
 *
 * A delivery is the WHOLE of one company's booths from `since` on, sent again
 * whenever one of them or its list changes. The rows are the ERP's own; this
 * module only checks the envelope, drops what cannot be a booth, and counts,
 * so a delivery the portal could not read answers 422 with a reason instead
 * of vanishing into a 200. `ingest_erp_sales_attending` (mig 20261012140000)
 * owns every write and reads each field again.
 */

import { isRow, type Row } from './contract'

/** One delivery may carry at most this many booths (~32 a month today). */
export const ATTENDANCE_MAX_BOOTHS = 5_000

export interface AttendanceDelivery {
  companyId: number
  since: string
  snapshotAt: string | null
  booths: Row[]
}

export type AttendanceParse =
  | { ok: true; delivery: AttendanceDelivery; counts: { booths: number; attendees: number; unreadable: number } }
  | { ok: false; error: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A whole number (never below 0) the ERP sends as a number or as digits. */
function wholeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d{1,15}$/.test(value.trim())) return Number(value.trim())
  return null
}

export function parseAttendanceDelivery(body: unknown): AttendanceParse {
  if (!isRow(body)) return { ok: false, error: 'a Sales Attending delivery is one JSON object' }
  const companyId = wholeNumber(body.companyId)
  if (companyId === null || companyId <= 0) return { ok: false, error: 'companyId must be the ERP company id' }
  const since = typeof body.since === 'string' ? body.since.trim().slice(0, 10) : ''
  if (!DAY.test(since) || Number.isNaN(Date.parse(`${since}T00:00:00Z`))) {
    return { ok: false, error: 'since must be the first day the delivery covers (YYYY-MM-DD)' }
  }
  let snapshotAt: string | null = null
  if (body.snapshotAt !== undefined && body.snapshotAt !== null) {
    if (typeof body.snapshotAt !== 'string' || Number.isNaN(Date.parse(body.snapshotAt))) {
      return { ok: false, error: 'snapshotAt must be a time' }
    }
    snapshotAt = body.snapshotAt
  }
  if (!Array.isArray(body.booths)) return { ok: false, error: 'booths must be a list' }
  if (body.booths.length > ATTENDANCE_MAX_BOOTHS) {
    return { ok: false, error: `at most ${ATTENDANCE_MAX_BOOTHS.toLocaleString('en')} booths in one delivery` }
  }

  const booths: Row[] = []
  let attendees = 0
  let unreadable = 0
  for (const booth of body.booths) {
    if (!isRow(booth) || wholeNumber(booth.projectId) === null) {
      unreadable++
      continue
    }
    booths.push(booth)
    if (Array.isArray(booth.attendees)) attendees += booth.attendees.filter(isRow).length
  }
  return { ok: true, delivery: { companyId, since, snapshotAt, booths }, counts: { booths: booths.length, attendees, unreadable } }
}
