'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { pushSoon } from '@/lib/push/outbox'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requireAnyActionOn, requirePermission } from '@/lib/auth'
import { DAY_END, DAY_START, SLOT, isDay, rangeFromRow, roomFromRow, type Room, type RoomsRange } from './model'

/**
 * Meeting rooms' writes (2026-10-11, mig 20261011090000) — Server Actions any
 * page may call: Admin › Meeting Rooms, the Guest Link page, the HR app. Each
 * asks its gate here and its cell again in the database, which also decides
 * whose booking it is. A refusal answers `{ ok: false, reason }` in words
 * (production masks a thrown message).
 *
 * The Revenue app (source 'app', a member's own session) books through the
 * same database function; its action is the app's own.
 */
export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** Every page that draws the schedule, refreshed after a write. */
function freshen() {
  revalidatePath('/admin/rooms')
  revalidatePath('/admin/guest-link')
  // The people in a meeting are told (mig 20261011180000): their phones hear it once the answer has gone.
  pushSoon()
}

const words = (error: { message?: string } | null, fallback: string) => (error?.message?.trim() ? error.message.trim() : fallback)

/** One day of the schedule (‹ › Today on the Schedule tab), read when the person asks. */
export async function readRoomsDay(day: string): Promise<Done<{ range: RoomsRange }>> {
  await requirePermission('meeting_rooms', 'meeting_rooms_manage')
  if (!isDay(day)) return { ok: false, reason: 'That is not a day.' }
  const { data, error } = await (await client()).rpc('meeting_rooms_range', { p_from: day, p_to: day })
  if (error) return { ok: false, reason: words(error, 'The schedule could not be read. Please try again.') }
  const range = rangeFromRow(data)
  return range ? { ok: true, range } : { ok: false, reason: 'The schedule could not be read. Please try again.' }
}

export interface BookInput {
  /** A booking to change; absent = a new one. */
  id?: string | null
  room: string
  day: string
  from: number
  to: number
  title: string
  department: string | null
  /** The person it is for; null = the account booking. */
  bookedBy: string | null
  internal: string[]
  guests: Array<{ name: string; company: string }>
  pax: number
  source?: 'portal' | 'hr_app'
}

/** Book a room, or change a booking you may change. */
export async function bookRoom(input: BookInput): Promise<Done<{ id: string; ref: string; room: string; time: string; pax: number }>> {
  await requireActionOn(['/admin/guest-link', '/admin/rooms'], 'rooms', 'create')
  const source = input.source === 'hr_app' ? 'hr_app' : 'portal'
  if (input.id != null && !isId(input.id)) return { ok: false, reason: 'That booking is not there.' }
  if (!isId(input.room)) return { ok: false, reason: 'Pick a room.' }
  if (!isDay(input.day)) return { ok: false, reason: 'Pick a day.' }
  const from = Math.round(Number(input.from))
  const to = Math.round(Number(input.to))
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < DAY_START || to > DAY_END || from % SLOT || to % SLOT) {
    return { ok: false, reason: 'Pick a time between 08:00 and 20:00, in half hours.' }
  }
  if (input.department != null && !isId(input.department)) return { ok: false, reason: 'Pick the department it is booked from.' }
  if (input.bookedBy != null && !isId(input.bookedBy)) return { ok: false, reason: 'Pick who the meeting is booked by.' }
  const internal = (Array.isArray(input.internal) ? input.internal : []).filter(isId)
  const guests = (Array.isArray(input.guests) ? input.guests : [])
    .map(g => ({ name: String(g?.name ?? '').trim(), company: String(g?.company ?? '').trim() }))
    .filter(g => g.name !== '')
  const { data, error } = await (await client()).rpc('meeting_rooms_book', {
    p_id: input.id ?? null,
    p_room: input.room,
    p_day: input.day,
    p_from: from,
    p_to: to,
    p_title: String(input.title ?? ''),
    p_department: input.department,
    p_booked_by: input.bookedBy,
    p_internal: internal,
    p_guests: guests,
    p_pax: Math.max(0, Math.round(Number(input.pax) || 0)),
    p_source: source,
    p_sub_department: null,
  })
  if (error) return { ok: false, reason: words(error, 'The room could not be booked. Please try again.') }
  freshen()
  const r = (data ?? {}) as { id?: string; ref?: string; room?: string; time?: string; pax?: number }
  return { ok: true, id: String(r.id ?? ''), ref: String(r.ref ?? ''), room: String(r.room ?? ''), time: String(r.time ?? ''), pax: Number(r.pax ?? 0) }
}

/** Cancel a booking you may change. */
export async function cancelBooking(id: string): Promise<Done<{ title: string; room: string }>> {
  await requireAnyActionOn(['/admin/guest-link', '/admin/rooms'], ['rooms', 'create'], ['rooms', 'edit'])
  if (!isId(id)) return { ok: false, reason: 'That booking is not there.' }
  const { data, error } = await (await client()).rpc('meeting_rooms_cancel', { p_id: id })
  if (error) return { ok: false, reason: words(error, 'The meeting could not be cancelled. Please try again.') }
  freshen()
  const r = (data ?? {}) as { title?: string; room?: string }
  return { ok: true, title: String(r.title ?? ''), room: String(r.room ?? '') }
}

export interface RoomInput {
  id?: string | null
  name: string
  seats: number
  location: string
  facilities: string
  bookable: boolean
}

/** Add a room, or change one (the Rooms tab). */
export async function saveRoom(input: RoomInput): Promise<Done<{ room: Room }>> {
  await requireActionOn('/admin/rooms', 'rooms', 'edit')
  if (input.id != null && !isId(input.id)) return { ok: false, reason: 'That room is not there.' }
  const seats = Math.round(Number(input.seats))
  const { data, error } = await (await client()).rpc('meeting_rooms_save_room', {
    p_id: input.id ?? null,
    p_name: String(input.name ?? ''),
    p_seats: Number.isFinite(seats) ? seats : -1,
    p_location: String(input.location ?? ''),
    p_facilities: String(input.facilities ?? ''),
    p_bookable: input.bookable !== false,
  })
  if (error) return { ok: false, reason: words(error, 'The room could not be saved. Please try again.') }
  const room = roomFromRow(data)
  if (!room) return { ok: false, reason: 'The room could not be saved. Please try again.' }
  freshen()
  return { ok: true, room }
}

/** Remove a room (never while it has a live booking ahead). */
export async function deleteRoom(id: string): Promise<Done<{ name: string }>> {
  await requireActionOn('/admin/rooms', 'rooms', 'edit')
  if (!isId(id)) return { ok: false, reason: 'That room is not there.' }
  const { data, error } = await (await client()).rpc('meeting_rooms_delete_room', { p_id: id })
  if (error) return { ok: false, reason: words(error, 'The room could not be removed. Please try again.') }
  freshen()
  return { ok: true, name: String((data as { name?: string } | null)?.name ?? '') }
}
