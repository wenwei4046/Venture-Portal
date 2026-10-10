import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { adminMemberAction, type AdminMemberData } from '@/lib/member/server'
import { requestFactsFromRow, type RequestFacts } from '@/lib/member/member-services'
import type { MemberRequest } from '@/lib/member/types'
import { readRoomsPeople, readRoomsRange } from '@/lib/rooms/read'
import type { Booking } from '@/lib/rooms/model'
import { officeToday } from '@/lib/office-time'
import { canDo } from '@/lib/permission-actions'
import { can } from '@/lib/permissions'
import type { User } from '@/types'
import { shiftDay, type HrAppData, type HrBooking, type HrMemberRequest, type MemberKind } from './model'

/**
 * The HR phone app's data (2026-10-11, HR revamp round 2): read from the
 * portal's own modules under the viewer's session — each asks its own cell,
 * and a module the viewer may not read comes back empty rather than failing
 * the app. Meeting rooms (lib/rooms) and Member services (the member back
 * office) today; Hiring and Documentation join when their modules land.
 */

const CATEGORY: Readonly<Record<string, string>> = {
  'Outstation 住宿': 'Outstation accommodation',
  'Airbnb 住宿': 'Airbnb accommodation',
}
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** Who may open the HR app at all: a holder of one of HR's own areas. */
export function opensHrApp(user: User): boolean {
  return can(user, 'hiring', 'documentation', 'member_requests_manage')
}

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** A member request as the app's Review draws it — names from the back office's facts. */
export function memberRequestOf(r: MemberRequest, facts: RequestFacts | undefined, subs: AdminMemberData['departments']): HrMemberRequest | null {
  if (r.kind !== 'waiting' && r.kind !== 'replacement' && r.kind !== 'claim') return null
  const d = r.detail ?? {}
  const amount = d.amount !== null && d.amount !== undefined && d.amount !== '' && Number.isFinite(Number(d.amount)) ? Number(d.amount).toLocaleString('en-US', { maximumFractionDigits: 2 }) : null
  return {
    id: r.id,
    kind: r.kind as MemberKind,
    status: r.status,
    sub: subs.find(x => x.id === str(d.subDepartmentId))?.name ?? '',
    byName: facts?.submittedBy ?? '—',
    newPerson: str(d.newPerson) || null,
    contact: str(d.contact) || null,
    start: str(d.start) || null,
    originalName: facts?.original ?? null,
    pickName: facts?.successor ?? null,
    effective: str(d.effective) || null,
    reason: str(d.reason) || null,
    category: CATEGORY[str(d.category)] ?? (str(d.category) || null),
    location: str(d.location) || null,
    amount,
  }
}

/** A booking as the app draws it: `mine` = the viewer may cancel it. */
export function bookingOf(b: Booking): HrBooking {
  return {
    id: b.id,
    roomId: b.room,
    date: b.day,
    from: b.from,
    to: b.to,
    title: b.title,
    dept: b.department ?? b.subDepartment ?? '',
    byName: b.bookedBy,
    mine: b.canChange,
    guest: b.source === 'guest',
    company: b.guestCompany,
    pax: b.pax,
  }
}

export async function loadHrAppData(user: User): Promise<HrAppData> {
  const today = officeToday()
  const readsRequests = can(user, 'member_requests_manage')
  const readsRooms = canDo(user, 'rooms', 'view')
  const [members, factsRead, range, people] = await Promise.all([
    readsRequests ? adminMemberAction({ action: 'list' }) : Promise.resolve(null),
    readsRequests ? (async () => (await client()).rpc('member_admin_request_facts'))() : Promise.resolve(null),
    readsRooms ? readRoomsRange(today, shiftDay(today, 6)) : Promise.resolve(null),
    readsRooms ? readRoomsPeople() : Promise.resolve(null),
  ])

  const snapshot = members && members.ok ? (members.data as AdminMemberData) : null
  const facts = factsRead && !factsRead.error ? requestFactsFromRow(factsRead.data) : {}
  const requests = (snapshot?.requests ?? [])
    .map(r => memberRequestOf(r, facts[r.id], snapshot?.departments ?? []))
    .filter((r): r is HrMemberRequest => r !== null)

  const rooms = range?.ok ? range.data.rooms.filter(r => r.bookable).map(r => ({ id: r.id, name: r.name, seats: r.seats })) : []
  const bookings = range?.ok ? range.data.bookings.filter(b => !b.cancelled).map(bookingOf) : []
  const who = people?.ok ? people.data : null
  const staff = (who?.people ?? []).map(p => ({ id: p.id, name: p.name, title: p.title ?? '', dept: p.department ?? '' }))
  const meName = who?.me?.name ?? who?.account ?? user.name ?? ''

  return {
    greetName: meName.split(' ')[0] || meName,
    meId: who?.me?.staffId ?? null,
    today,
    staff,
    owners: staff.filter(p => p.dept === 'HR'),
    hires: [],
    requests,
    rooms,
    bookings,
    sources: [],
    talents: [],
    docTypes: [],
    letters: [],
    bookDepts: (who?.departments ?? []).map(d => ({ id: d.id, name: d.name })),
  }
}
