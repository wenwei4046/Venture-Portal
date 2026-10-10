import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { bookingFromRow, roomFromRow, type Booking, type Room } from '@/lib/rooms/model'
import { guestClient } from './client'
import { guestDataFromRow, isGuestCode, subsFromRows, takenFromRows, type GuestData, type GuestSub, type GuestTaken } from './model'

/**
 * The guest link's reads (2026-10-11, mig 20261011091000). The public page
 * reads as a stranger (guestClient); Admin › Guest Link and the schedule's
 * legend read under the reader's own session, each function asking its cell.
 * A refusal comes back as words, never a throw: the page still draws.
 */
export type Read<T> = { ok: true; data: T } | { ok: false; reason: string }

/** What /g/<code> draws — closed for a code that is not the link's. */
export async function readGuestPage(code: string): Promise<GuestData> {
  if (!isGuestCode(code)) return { on: false }
  const { data, error } = await guestClient().rpc('guest_link_page', { p_code: code })
  return error ? { on: false } : guestDataFromRow(data)
}

/** One day's meetings for the guest page. */
export async function readGuestDay(code: string, day: string): Promise<GuestTaken[]> {
  const { data, error } = await guestClient().rpc('guest_link_day', { p_code: code, p_day: day })
  return error ? [] : takenFromRows(data)
}

export interface GuestLinkAdmin {
  on: boolean
  code: string
  booking: boolean
  hiring: boolean
  days: number
  today: string
  canEdit: boolean
  /** The rooms open for booking, each with whether guests may book it. */
  rooms: Room[]
  subs: GuestSub[]
  /** The live bookings ahead made through the link, as the Meeting Rooms drawer reads them. */
  bookings: Booking[]
  /** Hiring requests that came in through the link. */
  hires: number
}

async function session(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export function adminFromRow(v: unknown): GuestLinkAdmin | null {
  const d = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  if (!d || typeof d.code !== 'string') return null
  const list = (x: unknown) => (Array.isArray(x) ? x : [])
  return {
    on: d.on === true,
    code: d.code,
    booking: d.booking !== false,
    hiring: d.hiring !== false,
    days: typeof d.days === 'number' ? d.days : 14,
    today: typeof d.today === 'string' ? d.today : '',
    canEdit: d.canEdit === true,
    rooms: list(d.rooms).map(roomFromRow).filter((r): r is Room => r !== null),
    subs: subsFromRows(d.subs),
    bookings: list(d.bookings).map(bookingFromRow).filter((b): b is Booking => b !== null),
    hires: typeof d.hires === 'number' ? d.hires : 0,
  }
}

/** Admin › Guest Link: the link, its rooms and subsidiaries, the bookings made through it. */
export async function readGuestLinkAdmin(): Promise<Read<GuestLinkAdmin>> {
  const { data, error } = await (await session()).rpc('guest_link_admin')
  if (error) {
    return { ok: false, reason: error.code === '42501' ? 'The guest link needs Guest link · View.' : 'The guest link could not be read. Please try again.' }
  }
  const admin = adminFromRow(data)
  return admin ? { ok: true, data: admin } : { ok: false, reason: 'The guest link could not be read. Please try again.' }
}

/** The schedule's legend: each subsidiary with a code. */
export async function readGuestLegend(): Promise<Array<{ code: string; name: string }>> {
  const { data, error } = await (await session()).rpc('guest_link_legend')
  if (error || !Array.isArray(data)) return []
  return data
    .map(x => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {}))
    .filter(x => typeof x.code === 'string' && x.code !== '' && typeof x.name === 'string')
    .map(x => ({ code: x.code as string, name: x.name as string }))
}
