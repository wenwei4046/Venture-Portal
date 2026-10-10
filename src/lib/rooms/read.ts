import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { bookingFromRow, peopleFromRow, rangeFromRow, roomsFromRow, type Booking, type Room, type RoomsPeople, type RoomsRange } from './model'

/**
 * Meeting rooms' reads (2026-10-11, mig 20261011090000), under the reader's own
 * session — each function asks Meeting rooms · View (a Revenue app member:
 * Revenue app · View, their own). Shared by Admin › Meeting Rooms, the Guest
 * Link page, the HR app and the Revenue app. A refusal comes back as words,
 * never a throw: the page still draws.
 */
export type Read<T> = { ok: true; data: T } | { ok: false; reason: string }

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

const refused = (error: { code?: string; message?: string }, what: string): { ok: false; reason: string } => ({
  ok: false,
  reason: error.code === '42501' ? 'The meeting rooms need Meeting rooms · View.' : `${what} could not be read. Please try again.`,
})

/** The rooms open for booking and the live bookings from `from` to `to` (at most 62 days). */
export async function readRoomsRange(from: string, to: string): Promise<Read<RoomsRange>> {
  const { data, error } = await (await client()).rpc('meeting_rooms_range', { p_from: from, p_to: to })
  if (error) return refused(error, 'The schedule')
  const range = rangeFromRow(data)
  return range ? { ok: true, data: range } : { ok: false, reason: 'The schedule could not be read. Please try again.' }
}

/** Every room kept (bookable or not) with its upcoming bookings — the Rooms tab. */
export async function readRooms(): Promise<Read<Room[]>> {
  const { data, error } = await (await client()).rpc('meeting_rooms_rooms')
  if (error) return refused(error, 'The rooms')
  return { ok: true, data: roomsFromRow(data) }
}

/** Who may be picked (Booked by, Attending), the departments, and who is asking. */
export async function readRoomsPeople(): Promise<Read<RoomsPeople>> {
  const { data, error } = await (await client()).rpc('meeting_rooms_people')
  if (error) return refused(error, 'The people list')
  const people = peopleFromRow(data)
  return people ? { ok: true, data: people } : { ok: false, reason: 'The people list could not be read. Please try again.' }
}

/** One booking with its trail. */
export async function readBooking(id: string): Promise<Read<Booking | null>> {
  const { data, error } = await (await client()).rpc('meeting_rooms_booking', { p_id: id })
  if (error) return refused(error, 'The booking')
  return { ok: true, data: bookingFromRow(data) }
}
