import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { adminMemberAction, type AdminMemberData } from '@/lib/member/server'
import { requestFactsFromRow, type RequestFacts } from '@/lib/member/member-services'
import type { MemberRequest } from '@/lib/member/types'
import { readRoomsPeople, readRoomsRange } from '@/lib/rooms/read'
import { loadDocumentation } from '@/lib/documentation/server'
import { deptLabel, type Documentation } from '@/lib/documentation/model'
import { loadHiringBoard } from '@/lib/hiring/board'
import { dayLabel as hiringDay, hrOwners } from '@/lib/hiring/view'
import type { HiringBoard, HiringRequest, HiringTalent } from '@/lib/hiring/types'
import type { Booking } from '@/lib/rooms/model'
import { officeToday } from '@/lib/office-time'
import { canDo } from '@/lib/permission-actions'
import { can } from '@/lib/permissions'
import type { User } from '@/types'
import { shiftDay, type HrAppData, type HrBooking, type HrHire, type HrMemberRequest, type HrTalent, type MemberKind } from './model'

/**
 * The HR phone app's data (2026-10-11, HR revamp round 2): read from the
 * portal's own modules under the viewer's session — each asks its own cell,
 * and a module the viewer may not read comes back empty rather than failing
 * the app. Meeting rooms (lib/rooms) and Member services (the member back
 * office), Hiring (lib/hiring) and Documentation's Data center.
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
  const no = r.requestNo ?? (d as Record<string, unknown>).requestNo
  return {
    id: r.id,
    // The member app's own words for it (requestCode, profile-model.ts).
    code: typeof no === 'string' && no ? no : `RQ-${r.id.slice(0, 8).toUpperCase()}`,
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

/** "3200–3800" → "3,200–3,800": a range answer as the app writes money. */
const grouped = (v: string) => v.split('–').map(x => x.trim()).map(x => (/^\d+(\.\d+)?$/.test(x) ? Number(x).toLocaleString('en-US') : x)).join('–')

/** A hiring request as the app draws it — the requester form's answers by the handoff's own field ids. */
export function hireOf(r: HiringRequest, board: Pick<HiringBoard, 'people'>): HrHire {
  const a = (id: string) => (r.answers[id] ?? '').trim()
  const n = Number(a('headcount'))
  return {
    id: r.id,
    status: r.status,
    position: a('position'),
    headcount: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1,
    dept: a('dept'),
    budget: a('budget') ? grouped(a('budget')) : '',
    start: a('start'),
    employment: a('emp') || undefined,
    reason: a('reason') || undefined,
    age: a('age') || undefined,
    gender: a('gender') || undefined,
    race: a('race') || undefined,
    jd: a('jd') || undefined,
    notes: a('notes') || undefined,
    ownerName: board.people.find(p => p.id === r.ownerId)?.name ?? null,
    requester: r.requesterName,
    company: r.requesterCompany,
    when: hiringDay(r.submittedAt),
    hired: r.hiredNames.length ? r.hiredNames.join(', ') : null,
    source: r.hiredThrough,
    cost: r.hiringCost === null ? null : r.hiringCost.toLocaleString('en-US', { maximumFractionDigits: 2 }),
    candidates: r.candidates.map(c => ({ id: c.id, name: c.name, phone: c.phone || undefined, note: c.note || undefined, source: c.source, stage: c.stage })),
    events: r.events.map(e => ({ what: e.what, when: hiringDay(e.at), who: e.who, note: e.note || undefined })),
  }
}

/** Somebody in the Talent Bank as the app draws them. */
export function talentOf(t: HiringTalent): HrTalent {
  return {
    id: t.id, name: t.name, phone: t.phone || undefined, email: t.email || undefined, position: t.position, dept: t.department,
    from: t.fromRequest, when: hiringDay(t.savedAt), notes: t.notes,
  }
}

/** People › Documentation's Data center as the app draws it: everybody, the letter types, the letters on file. */
export function dataCenterOf(doc: Pick<Documentation, 'people' | 'departments' | 'letterTypes' | 'letters'>): Pick<HrAppData, 'staff' | 'docTypes' | 'letters'> {
  const dept = new Map(doc.departments.map(d => [d.id, deptLabel(d.name)]))
  return {
    staff: doc.people.map(p => ({ id: p.id, name: p.name, title: p.title ?? '', dept: (p.departmentId && dept.get(p.departmentId)) || '' })),
    docTypes: doc.letterTypes.map(t => ({ id: t.id, name: t.name, compulsory: t.compulsory })),
    letters: doc.letters.map(l => ({ id: l.id, staffId: l.staffId, typeId: l.typeId ?? '', typeName: l.typeName, file: l.fileName })),
  }
}

export async function loadHrAppData(user: User): Promise<HrAppData> {
  const today = officeToday()
  const readsRequests = can(user, 'member_requests_manage')
  const readsRooms = canDo(user, 'rooms', 'view')
  const readsDocs = canDo(user, 'documentation', 'view')
  const readsHiring = canDo(user, 'hiring', 'view')
  const [members, factsRead, range, people, docs, hiring] = await Promise.all([
    readsRequests ? adminMemberAction({ action: 'list' }) : Promise.resolve(null),
    readsRequests ? (async () => (await client()).rpc('member_admin_request_facts'))() : Promise.resolve(null),
    readsRooms ? readRoomsRange(today, shiftDay(today, 6)) : Promise.resolve(null),
    readsRooms ? readRoomsPeople() : Promise.resolve(null),
    readsDocs ? loadDocumentation() : Promise.resolve(null),
    readsHiring ? loadHiringBoard() : Promise.resolve(null),
  ])
  const board = hiring?.ok ? hiring.board : null

  const snapshot = members && members.ok ? (members.data as AdminMemberData) : null
  const facts = factsRead && !factsRead.error ? requestFactsFromRow(factsRead.data) : {}
  const requests = (snapshot?.requests ?? [])
    .map(r => memberRequestOf(r, facts[r.id], snapshot?.departments ?? []))
    .filter((r): r is HrMemberRequest => r !== null)

  const rooms = range?.ok ? range.data.rooms.filter(r => r.bookable).map(r => ({ id: r.id, name: r.name, seats: r.seats })) : []
  const bookings = range?.ok ? range.data.bookings.filter(b => !b.cancelled).map(bookingOf) : []
  const who = people?.ok ? people.data : null
  // Everybody working here: the Data center's list when Documentation is theirs, else the rooms' (the same people).
  const center = docs?.ok ? dataCenterOf(docs.data) : null
  const staff = center?.staff ?? (who?.people ?? []).map(p => ({ id: p.id, name: p.name, title: p.title ?? '', dept: p.department ?? '' }))
  const meName = who?.me?.name ?? who?.account ?? user.name ?? ''

  return {
    greetName: meName.split(' ')[0] || meName,
    meId: who?.me?.staffId ?? null,
    today,
    staff,
    // Who may own a request: HR's own people, as the portal's Acknowledge offers them.
    owners: board ? hrOwners(board).map(p => ({ id: p.id, name: p.name, title: p.title, dept: p.department })) : staff.filter(p => p.dept === 'HR'),
    hires: board ? board.requests.map(r => hireOf(r, board)) : [],
    requests,
    rooms,
    bookings,
    sources: board ? board.sources.filter(x => x.active).map(x => x.name) : [],
    talents: board ? board.talents.map(talentOf) : [],
    docTypes: center?.docTypes ?? [],
    letters: center?.letters ?? [],
    bookDepts: (who?.departments ?? []).map(d => ({ id: d.id, name: d.name })),
  }
}
