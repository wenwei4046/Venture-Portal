'use server'

import { isDay } from '@/lib/rooms/model'
import { guestClient } from './client'
import { bookedFromRow, isGuestCode, takenFromRows, type GuestBooked, type GuestTaken } from './model'

/**
 * The guest page's three calls (2026-10-11, mig 20261011091000). There is no
 * sign-in to ask for: the link's CODE is the key, and the database checks it
 * in each function (on, the current code, the part open) — these only tidy
 * the input. Each answers `{ ok, reason }` in the page's words.
 */
export type GuestDone<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const CLOSED = 'This link is closed.'
const words = (error: { message?: string } | null, fallback: string) => (error?.message?.trim() ? error.message.trim() : fallback)
const text = (v: unknown, max: number) => String(v ?? '').slice(0, max)

/** One day's meetings (the Book step's blocked slots, the schedule). */
export async function guestDay(code: string, day: string): Promise<GuestDone<{ taken: GuestTaken[] }>> {
  if (!isGuestCode(code)) return { ok: false, reason: CLOSED }
  if (!isDay(day)) return { ok: false, reason: 'Pick a day.' }
  const { data, error } = await guestClient().rpc('guest_link_day', { p_code: code, p_day: day })
  if (error) return { ok: false, reason: words(error, 'The schedule could not be read. Please try again.') }
  return { ok: true, taken: takenFromRows(data) }
}

export interface GuestBookInput {
  code: string
  /** A guest-link booking to change; null = a new one. */
  id: string | null
  room: string | null
  day: string
  from: number | null
  to: number | null
  title: string
  subsidiary: string
  department: string
  name: string
  pax: number
  /** Who changes it (a change only). */
  actor: string | null
}

/** Book a room, or change a booking made through the link. */
export async function guestBook(input: GuestBookInput): Promise<GuestDone<{ booked: GuestBooked }>> {
  if (!isGuestCode(input.code)) return { ok: false, reason: CLOSED }
  if (input.id != null && !isId(input.id)) return { ok: false, reason: 'This booking is no longer there.' }
  const int = (v: unknown) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)))
  const { data, error } = await guestClient().rpc('guest_link_book', {
    p_code: input.code,
    p_id: input.id,
    p_room: isId(input.room) ? input.room : null,
    p_day: isDay(input.day) ? input.day : null,
    p_from: int(input.from),
    p_to: int(input.to),
    p_title: text(input.title, 200),
    p_subsidiary: isId(input.subsidiary) ? input.subsidiary : null,
    p_department: text(input.department, 100),
    p_name: text(input.name, 120),
    p_pax: int(input.pax),
    p_actor: input.actor == null ? null : text(input.actor, 120),
  })
  if (error) return { ok: false, reason: words(error, 'The room could not be booked. Please try again.') }
  const booked = bookedFromRow(data)
  return booked ? { ok: true, booked } : { ok: false, reason: 'The room could not be booked. Please try again.' }
}

export interface GuestHireInput {
  code: string
  subsidiary: string
  name: string
  /** Hiring › Form settings' fields, by id (a range "2500–3000"). */
  answers: Record<string, string>
  /** The job description the browser put under guest/<code>/, if any. */
  attachmentPath: string | null
  attachmentName: string | null
}

/** Send a hiring request to HR (Request manpower). */
export async function guestHire(input: GuestHireInput): Promise<GuestDone<{ id: string; position: string }>> {
  if (!isGuestCode(input.code)) return { ok: false, reason: CLOSED }
  const answers = Object.fromEntries(
    Object.entries(input.answers && typeof input.answers === 'object' ? input.answers : {})
      .filter(([k]) => /^[a-z][a-z0-9_]{0,40}$/.test(k))
      .map(([k, v]) => [k, text(v, 4000)]),
  )
  const { data, error } = await guestClient().rpc('guest_link_hire', {
    p_code: input.code,
    p_subsidiary: isId(input.subsidiary) ? input.subsidiary : null,
    p_name: text(input.name, 120),
    p_answers: answers,
    p_attachment_path: input.attachmentPath ? text(input.attachmentPath, 300) : null,
    p_attachment_name: input.attachmentName ? text(input.attachmentName, 200) : null,
  })
  if (error) return { ok: false, reason: words(error, 'The request could not be sent. Please try again.') }
  const r = (data ?? {}) as { id?: string; position?: string }
  return { ok: true, id: String(r.id ?? ''), position: String(r.position ?? 'the role') }
}

/** Cancel a booking made through the link, saying who. */
export async function guestCancel(code: string, id: string, actor: string): Promise<GuestDone<{ title: string }>> {
  if (!isGuestCode(code)) return { ok: false, reason: CLOSED }
  if (!isId(id)) return { ok: false, reason: 'This booking is no longer there.' }
  const { data, error } = await guestClient().rpc('guest_link_cancel', { p_code: code, p_id: id, p_actor: text(actor, 120) })
  if (error) return { ok: false, reason: words(error, 'The meeting could not be cancelled. Please try again.') }
  return { ok: true, title: String((data as { title?: string } | null)?.title ?? '') }
}
