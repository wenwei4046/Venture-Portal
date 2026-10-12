import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { adminMemberAction, type AdminMemberData } from '@/lib/member/server'
import { requestFactsFromRow, type RequestFacts } from '@/lib/member/member-services'
import type { MemberRequest } from '@/lib/member/types'
import { readRoomsPeople, readRoomsRange } from '@/lib/rooms/read'
import { loadDocumentation } from '@/lib/documentation/server'
import { deptLabel, liveLetters, type Documentation } from '@/lib/documentation/model'
import { loadHiringBoard } from '@/lib/hiring/board'
import { dayLabel as hiringDay, hrOwners } from '@/lib/hiring/view'
import type { HiringBoard, HiringRequest, HiringTalent } from '@/lib/hiring/types'
import { noticesFromRow } from '@/lib/push/notices'
import { bookerName, type Booking } from '@/lib/rooms/model'
import { officeToday } from '@/lib/office-time'
import { canDo } from '@/lib/permission-actions'
import { actionsOnPage, opensPage, type PageRoute } from '@/lib/page-tabs'
import { can } from '@/lib/permissions'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { loadMyMemos } from '@/lib/memos/server'
import { NO_MEMOS } from '@/lib/memos/model'
import type { User } from '@/types'
import { hrAppViewOf, shiftDay, type HrAppData, type HrBooking, type HrHire, type HrMemberRequest, type HrTalent, type MemberKind } from './model'

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

/** Who may open the HR app at all: a holder of one of HR's own areas (lib/one-app.ts — the portal asks it too). */
export { opensHrApp } from '@/lib/one-app'

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
    byName: bookerName(b),
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

/** People › Documentation's Data center as the app draws it: everybody, the letter types, the letters on file (a withdrawn one is not). */
export function dataCenterOf(doc: Pick<Documentation, 'people' | 'departments' | 'letterTypes' | 'letters'>): Pick<HrAppData, 'staff' | 'docTypes' | 'letters'> {
  const dept = new Map(doc.departments.map(d => [d.id, deptLabel(d.name)]))
  return {
    staff: doc.people.map(p => ({ id: p.id, name: p.name, title: p.title ?? '', dept: (p.departmentId && dept.get(p.departmentId)) || '' })),
    docTypes: doc.letterTypes.map(t => ({ id: t.id, name: t.name, compulsory: t.compulsory })),
    letters: liveLetters(doc.letters).map(l => ({ id: l.id, staffId: l.staffId, typeId: l.typeId ?? '', typeName: l.typeName, file: l.fileName })),
  }
}

/**
 * Each part of the app is a page of the portal (2026-10-11, the review's M2):
 * shown only while that page's tab is open to them, and a write counts only
 * while one of that page's boxes for it is (`actionsOnPage`) — the HR app is
 * the same account on a second surface, never a way round its ticks.
 */
export const PART_PAGE = {
  requests: '/member-admin',
  hiring: '/hiring/requests',
  insights: '/hiring/insights',
  talent: '/hiring/talent',
  docs: '/team/documentation',
  rooms: '/admin/rooms',
} as const satisfies Record<keyof HrAppData['parts'], PageRoute>

/** The account as one page of the portal sees it: its writes narrowed to that page's open boxes. */
export function onPage(user: User, route: PageRoute): User {
  return user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, route) } : user
}

/** What their cells and their tabs open in the app: its parts, and the writes behind its buttons. */
export function appAccess(user: User): Pick<HrAppData, 'parts' | 'may'> {
  const open = (route: PageRoute) => opensPage(user.tabs, route)
  const parts = {
    requests: can(user, 'member_requests_manage') && open(PART_PAGE.requests),
    hiring: canDo(user, 'hiring', 'view') && open(PART_PAGE.hiring),
    insights: canDo(user, 'hiring', 'view') && open(PART_PAGE.insights),
    talent: canDo(user, 'hiring', 'view') && open(PART_PAGE.talent),
    docs: canDo(user, 'documentation', 'view') && open(PART_PAGE.docs),
    rooms: canDo(user, 'rooms', 'view') && open(PART_PAGE.rooms),
  }
  // Member services decides by its key (member_is_manager); a box unticked on its page still closes it.
  const decide = parts.requests && (!user.closed?.length || canDo(onPage(user, PART_PAGE.requests), 'member', 'manage'))
  return {
    parts,
    may: {
      decide,
      hireApprove: parts.hiring && canDo(onPage(user, PART_PAGE.hiring), 'hiring', 'approve'),
      hireEdit: parts.hiring && canDo(onPage(user, PART_PAGE.hiring), 'hiring', 'edit'),
      hireCreate: parts.hiring && canDo(onPage(user, PART_PAGE.hiring), 'hiring', 'create'),
      talentEdit: parts.talent && canDo(onPage(user, PART_PAGE.talent), 'hiring', 'edit'),
      book: parts.rooms && canDo(onPage(user, PART_PAGE.rooms), 'rooms', 'create'),
    },
  }
}

/**
 * What HR's new work they are told of (2026-10-11, mig 20261011180000): the parts the app shows them and may act
 * in. The database keeps only those their own actions hold (`notification_topics_sync`).
 */
export function hrTopics(user: User): string[] {
  const { parts, may } = appAccess(user)
  return [
    ...(may.hireApprove ? ['hiring.guest'] : []),
    ...(parts.rooms && canDo(onPage(user, PART_PAGE.rooms), 'rooms', 'edit') ? ['rooms.guest'] : []),
    ...(may.decide ? ['member.requests'] : []),
  ]
}

export async function loadHrAppData(user: User): Promise<HrAppData> {
  const today = officeToday()
  const { parts, may } = appAccess(user)
  const readsHiring = parts.hiring || parts.insights || parts.talent
  const [members, factsRead, range, people, docs, hiring, notices, personal, mine] = await Promise.all([
    parts.requests ? adminMemberAction({ action: 'list' }) : Promise.resolve(null),
    parts.requests ? (async () => (await client()).rpc('member_admin_request_facts'))() : Promise.resolve(null),
    parts.rooms ? readRoomsRange(today, shiftDay(today, 6)) : Promise.resolve(null),
    parts.rooms ? readRoomsPeople() : Promise.resolve(null),
    parts.docs ? loadDocumentation() : Promise.resolve(null),
    readsHiring ? loadHiringBoard() : Promise.resolve(null),
    // Their notifications, and what HR work they are told of — never while viewing as somebody (read-only, and not theirs).
    user.viewingAs
      ? Promise.resolve(null)
      : (async () => {
          const db = await client()
          const sync = await db.rpc('notification_topics_sync', { p_topics: hrTopics(user) })
          if (sync.error) console.error('HR app topics could not be kept', sync.error.code ?? 'unknown')
          return db.rpc('notifications_mine', { p_limit: 50 })
        })(),
    // More › Change password, for a login of their own — never hr@ or another shared one (2026-10-12).
    user.viewingAs ? Promise.resolve(false) : loginIsPersonal(),
    // Their own memos (2026-10-12): the login's, in every view — never somebody else's while viewing as them.
    user.viewingAs ? Promise.resolve(NO_MEMOS) : loadMyMemos(),
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
  // Viewing as a person, the database still answers for the signed-in account: greet the person being viewed,
  // who is nobody's attendee here (the app is read-only then).
  const meName = user.viewingAs?.name ?? who?.me?.name ?? who?.account ?? user.name ?? ''

  return {
    greetName: meName.split(' ')[0] || meName,
    meId: user.viewingAs ? null : who?.me?.staffId ?? null,
    viewingAs: user.viewingAs?.name ?? null,
    today,
    staff,
    // Who may own a request: HR's own people, as the portal's Acknowledge offers them.
    owners: board ? hrOwners(board).map(p => ({ id: p.id, name: p.name, title: p.title, dept: p.department })) : staff.filter(p => p.dept === 'HR'),
    // Insights reads the requests too; the Hiring tab and the Review list them only while Requests is open (parts.hiring).
    hires: board && (parts.hiring || parts.insights) ? board.requests.map(r => hireOf(r, board)) : [],
    requests,
    rooms,
    bookings,
    sources: board ? board.sources.filter(x => x.active).map(x => x.name) : [],
    talents: board && parts.talent ? board.talents.map(talentOf) : [],
    docTypes: center?.docTypes ?? [],
    letters: center?.letters ?? [],
    bookDepts: (who?.departments ?? []).map(d => ({ id: d.id, name: d.name })),
    parts,
    may,
    notices: notices && !notices.error ? noticesFromRow(notices.data) : { unread: 0, items: [] },
    views: user.canSwitchView && !user.viewingAs ? { current: hrAppViewOf(user.role) } : null,
    personalLogin: personal,
    memos: mine.memos,
  }
}
