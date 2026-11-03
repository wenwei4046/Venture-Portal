'use server'

import { guestClient } from '@/lib/guest/client'
import { bookedFromRow, isPartnerCode, isPartnerRef, isYmd, partnerRefusal, takenFromRows, type PartnerBooked, type PartnerInfo, type PartnerTaken } from './model'

/**
 * The partner booking page's calls (2026-10-29, mig 20261029190000). No sign-in: the link's CODE is the key and the
 * database checks it in each function (the partner's, its link on) — these only tidy the input, with the publishable key
 * and no session (`guestClient`, as the guest link's). Each answers `{ ok, reason }` in the page's words.
 */
export type PartnerDone<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

const CLOSED = 'This link is closed.'
const text = (v: unknown, max: number) => String(v ?? '').slice(0, max)

/** How many are booked at each start of a showroom over some days. */
export async function partnerDay(code: string, room: string, from: string, days: number): Promise<PartnerDone<{ taken: PartnerTaken }>> {
  if (!isPartnerCode(code)) return { ok: false, reason: CLOSED }
  if (!isYmd(from)) return { ok: false, reason: 'Pick a day.' }
  const { data, error } = await guestClient().rpc('crm_partner_day', { p_code: code, p_showroom: text(room, 60), p_from: from, p_days: Math.max(1, Math.min(62, Math.round(days) || 1)) })
  if (error) return { ok: false, reason: partnerRefusal(error, 'The times could not be read. Please try again.') }
  return { ok: true, taken: takenFromRows(data) }
}

export interface PartnerBookInput {
  code: string
  /** A booking to change (its reference); null = a new one. */
  ref: string | null
  room: string
  start: string
  booker: string
  bookerPhone: string
  customer: string
  customerPhone: string
  info: PartnerInfo
  remarks: string
  note: string
}

export async function partnerBook(input: PartnerBookInput): Promise<PartnerDone<{ booked: PartnerBooked }>> {
  if (!isPartnerCode(input.code)) return { ok: false, reason: CLOSED }
  if (input.ref != null && !isPartnerRef(input.ref)) return { ok: false, reason: 'This booking is no longer there.' }
  const start = new Date(input.start)
  if (Number.isNaN(start.getTime())) return { ok: false, reason: 'Pick a date and a time.' }
  const info: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.info ?? {})) if (v) info[k] = text(v, 120)
  const { data, error } = await guestClient().rpc('crm_partner_book', {
    p_code: input.code, p_ref: input.ref, p_showroom: text(input.room, 60), p_start: start.toISOString(),
    p_booker: text(input.booker, 80), p_booker_phone: text(input.bookerPhone, 30), p_customer: text(input.customer, 80),
    p_customer_phone: text(input.customerPhone, 30), p_info: info, p_remarks: text(input.remarks, 1000), p_note: text(input.note, 1000),
  })
  if (error) return { ok: false, reason: partnerRefusal(error, 'The slot could not be booked. Please try again.') }
  const booked = bookedFromRow(data)
  return booked ? { ok: true, booked } : { ok: false, reason: 'The slot could not be booked. Please try again.' }
}

/** The bookings made through the link still to come (the owner, 2026-10-29: with the customer's phone and the reference). */
export async function partnerList(code: string): Promise<PartnerDone<{ list: PartnerBooked[] }>> {
  if (!isPartnerCode(code)) return { ok: false, reason: CLOSED }
  const { data, error } = await guestClient().rpc('crm_partner_list', { p_code: code })
  if (error) return { ok: false, reason: partnerRefusal(error, 'The bookings could not be read. Please try again.') }
  return { ok: true, list: (Array.isArray(data) ? data : []).map(bookedFromRow).filter((b): b is PartnerBooked => !!b) }
}

/** A booking by its reference. */
export async function partnerGet(code: string, ref: string): Promise<PartnerDone<{ booked: PartnerBooked }>> {
  if (!isPartnerCode(code)) return { ok: false, reason: CLOSED }
  if (!isPartnerRef(ref)) return { ok: false, reason: 'Type the reference, e.g. TC-7KQ3X9.' }
  const { data, error } = await guestClient().rpc('crm_partner_get', { p_code: code, p_ref: ref.trim() })
  if (error) return { ok: false, reason: partnerRefusal(error, 'The booking could not be read. Please try again.') }
  const booked = bookedFromRow(data)
  return booked ? { ok: true, booked } : { ok: false, reason: 'No booking has that reference.' }
}

export async function partnerCancel(code: string, ref: string): Promise<PartnerDone<{ booked: PartnerBooked }>> {
  if (!isPartnerCode(code)) return { ok: false, reason: CLOSED }
  if (!isPartnerRef(ref)) return { ok: false, reason: 'This booking is no longer there.' }
  const { data, error } = await guestClient().rpc('crm_partner_cancel', { p_code: code, p_ref: ref.trim() })
  if (error) return { ok: false, reason: partnerRefusal(error, 'The booking could not be cancelled. Please try again.') }
  const booked = bookedFromRow(data)
  return booked ? { ok: true, booked } : { ok: false, reason: 'The booking could not be cancelled. Please try again.' }
}
