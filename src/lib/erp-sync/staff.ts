/**
 * A staff delivery from the Houzs ERP — `POST /api/erp/v1/staff`, contract §13 (2026-11-10).
 *
 * Lead View's Team reads the ERP's staff beside People (the user: "People + ERP feed"): an ERP job of "Lead Executive"
 * makes a Customer service, an ERP branch pre-ticks an outlet, and somebody the ERP marks inactive has their Lead View
 * stopped at once. A delivery is the WHOLE of one company's staff, sent again whenever somebody changes. This module
 * only checks the envelope and counts, so a delivery the portal could not read answers 422 with a reason; the ingest
 * (`ingest_erp_staff`, mig 20261110220000) owns every write and reads each field again.
 */

import { isRow, type Row } from './contract'

/** One delivery may carry at most this many people. */
export const STAFF_MAX = 5_000

export interface StaffDelivery {
  companyId: number
  snapshotAt: string | null
  staff: Row[]
}

export type StaffParse =
  | { ok: true; delivery: StaffDelivery; counts: { staff: number; inactive: number; unreadable: number } }
  | { ok: false; error: string }

function wholeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d{1,15}$/.test(value.trim())) return Number(value.trim())
  return null
}

export function parseStaffDelivery(body: unknown): StaffParse {
  if (!isRow(body)) return { ok: false, error: 'a staff delivery is one JSON object' }
  const companyId = wholeNumber(body.companyId)
  if (companyId === null || companyId <= 0) return { ok: false, error: 'companyId must be the ERP company id' }
  let snapshotAt: string | null = null
  if (body.snapshotAt !== undefined && body.snapshotAt !== null) {
    if (typeof body.snapshotAt !== 'string' || Number.isNaN(Date.parse(body.snapshotAt))) return { ok: false, error: 'snapshotAt must be a time' }
    snapshotAt = body.snapshotAt
  }
  if (!Array.isArray(body.staff)) return { ok: false, error: 'staff must be a list' }
  if (body.staff.length > STAFF_MAX) return { ok: false, error: `at most ${STAFF_MAX.toLocaleString('en')} staff in one delivery` }

  const staff: Row[] = []
  let inactive = 0
  let unreadable = 0
  for (const person of body.staff) {
    if (!isRow(person) || typeof person.staffId !== 'string' || !person.staffId.trim() || person.staffId.length > 64) {
      unreadable++
      continue
    }
    staff.push(person)
    if (person.active === false) inactive++
  }
  return { ok: true, delivery: { companyId, snapshotAt, staff }, counts: { staff: staff.length, inactive, unreadable } }
}
