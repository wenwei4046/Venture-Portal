'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { roomFromRow, type Room } from '@/lib/rooms/model'
import { subsFromRows, type GuestSub } from './model'

/**
 * Admin › Guest Link's writes (2026-10-11, mig 20261011091000): Guest link ·
 * Edit here, and again in each database function. Each answers `{ ok, reason }`
 * (production masks a thrown message).
 */
export type Done<T = object> = ({ ok: true } & T) | { ok: false; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const words = (error: { message?: string } | null, fallback: string) => (error?.message?.trim() ? error.message.trim() : fallback)

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** The Guest Link page, and the schedule its subsidiaries' codes show on. */
function freshen() {
  revalidatePath('/admin/guest-link')
  revalidatePath('/admin/rooms')
}

export interface LinkSettings {
  on: boolean
  code: string
  booking: boolean
  hiring: boolean
  days: number
}

const settingsOf = (v: unknown): LinkSettings => {
  const d = (v ?? {}) as Record<string, unknown>
  return { on: d.on === true, code: String(d.code ?? ''), booking: d.booking !== false, hiring: d.hiring !== false, days: Number(d.days) || 14 }
}

/** Link on / off, a part on / off, the days ahead — what is not given is kept. */
export async function setGuestLink(patch: { on?: boolean; booking?: boolean; hiring?: boolean; days?: number }): Promise<Done<{ link: LinkSettings }>> {
  await requireAction('guest_link', 'edit')
  const days = patch.days == null ? null : Math.round(Number(patch.days))
  if (days != null && (!Number.isFinite(days) || days < 1 || days > 21)) return { ok: false, reason: 'Guests can book 1 to 21 days ahead.' }
  const { data, error } = await (await client()).rpc('guest_link_set', {
    p_on: typeof patch.on === 'boolean' ? patch.on : null,
    p_booking: typeof patch.booking === 'boolean' ? patch.booking : null,
    p_hiring: typeof patch.hiring === 'boolean' ? patch.hiring : null,
    p_days: days,
  })
  if (error) return { ok: false, reason: words(error, 'The guest link could not be saved. Please try again.') }
  freshen()
  return { ok: true, link: settingsOf(data) }
}

/** New link: a new code — the old one stops working at once. */
export async function newGuestCode(): Promise<Done<{ code: string }>> {
  await requireAction('guest_link', 'edit')
  const { data, error } = await (await client()).rpc('guest_link_new_code')
  if (error) return { ok: false, reason: words(error, 'A new link could not be made. Please try again.') }
  freshen()
  return { ok: true, code: String((data as { code?: string } | null)?.code ?? '') }
}

/** Rooms guests can book: one switch. */
export async function setGuestRoom(room: string, on: boolean): Promise<Done<{ room: Room }>> {
  await requireAction('guest_link', 'edit')
  if (!isId(room)) return { ok: false, reason: 'That room is no longer open for booking.' }
  const { data, error } = await (await client()).rpc('guest_link_room', { p_room: room, p_on: on === true })
  if (error) return { ok: false, reason: words(error, 'The room could not be saved. Please try again.') }
  const r = roomFromRow(data)
  if (!r) return { ok: false, reason: 'The room could not be saved. Please try again.' }
  freshen()
  return { ok: true, room: r }
}

/** Add a subsidiary (id null) or change one — its code, name and departments. */
export async function saveGuestSubsidiary(input: { id: string | null; code: string; name: string | null; departments: string[] }): Promise<Done<{ sub: GuestSub }>> {
  await requireAction('guest_link', 'edit')
  if (input.id != null && !isId(input.id)) return { ok: false, reason: 'That subsidiary is no longer there.' }
  const { data, error } = await (await client()).rpc('guest_link_save_subsidiary', {
    p_id: input.id,
    p_code: String(input.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3),
    p_name: input.name == null ? null : String(input.name).slice(0, 200),
    p_departments: (Array.isArray(input.departments) ? input.departments : []).map(d => String(d ?? '').slice(0, 100)),
  })
  if (error) return { ok: false, reason: words(error, 'The subsidiary could not be saved. Please try again.') }
  const [sub] = subsFromRows([data])
  if (!sub) return { ok: false, reason: 'The subsidiary could not be saved. Please try again.' }
  freshen()
  return { ok: true, sub }
}

/** Take a subsidiary off the list (its bookings keep their company). */
export async function removeGuestSubsidiary(id: string): Promise<Done<{ name: string }>> {
  await requireAction('guest_link', 'edit')
  if (!isId(id)) return { ok: false, reason: 'That subsidiary is no longer there.' }
  const { data, error } = await (await client()).rpc('guest_link_remove_subsidiary', { p_id: id })
  if (error) return { ok: false, reason: words(error, 'The subsidiary could not be removed. Please try again.') }
  freshen()
  return { ok: true, name: String((data as { name?: string } | null)?.name ?? '') }
}
