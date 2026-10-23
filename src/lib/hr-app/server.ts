import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { adminMemberAction, type AdminMemberData } from '@/lib/member/server'
import { requestFactsFromRow, type RequestFacts } from '@/lib/member/member-services'
import type { MemberRequest } from '@/lib/member/types'
import { ANY_TIME_LABEL, isAnyTime } from '@/lib/member/waiting-start'
import { readRoomsPeople, readRoomsRange } from '@/lib/rooms/read'
import { loadDocumentation } from '@/lib/documentation/server'
import { deptLabel, liveLetters, type Documentation } from '@/lib/documentation/model'
import { loadHiringBoard } from '@/lib/hiring/board'
import { dayLabel as hiringDay, hrOwners } from '@/lib/hiring/view'
import { reasonLabel } from '@/lib/hiring/reasons'
import type { HiringBankReason, HiringBoard, HiringRequest, HiringTalent } from '@/lib/hiring/types'
import { noticesFromRow } from '@/lib/push/notices'
import { bookerName, type Booking } from '@/lib/rooms/model'
import { officeToday } from '@/lib/office-time'
import { canDo } from '@/lib/permission-actions'
import { actionsOnPage, opensPage, type PageRoute } from '@/lib/page-tabs'
import { can } from '@/lib/permissions'
import { loginIsPersonal } from '@/lib/account/personal-login'
import { loadMyMemos } from '@/lib/memos/server'
import { NO_MEMOS } from '@/lib/memos/model'
import { loadMyDocuments } from '@/lib/documentation/my-docs'
import { loadBoard, loadLedger, loadRequests } from '@/lib/attendance/server'
import { reviewsFromRow, seesProbationReminders } from '@/lib/probation-reviews'
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
    // A waiting list's joining date: the day, or "Any time ready" (2026-10-14).
    start: isAnyTime(str(d.start)) ? ANY_TIME_LABEL : str(d.start) || null,
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

/** Somebody in the Talent Bank as the app draws them — why they are kept in the words of HR's `reasons`. */
export function talentOf(t: HiringTalent, reasons: readonly HiringBankReason[]): HrTalent {
  return {
    id: t.id, name: t.name, phone: t.phone || undefined, email: t.email || undefined, position: t.position, dept: t.department,
    from: t.fromRequest, when: hiringDay(t.savedAt), notes: t.notes, reason: reasonLabel(reasons, t.reason) || undefined,
  }
}

/** People › Documentation's Data center as the app draws it: everybody, the letter types, the letters on file (a withdrawn one is not). */
export function dataCenterOf(doc: Pick<Documentation, 'people' | 'departments' | 'letterTypes' | 'letters'> & Partial<Pick<Documentation, 'documents'>>): Pick<HrAppData, 'staff' | 'docTypes' | 'letters' | 'documents'> {
  const dept = new Map(doc.departments.map(d => [d.id, deptLabel(d.name)]))
  return {
    staff: doc.people.map(p => ({ id: p.id, name: p.name, title: p.title ?? '', dept: (p.departmentId && dept.get(p.departmentId)) || '' })),
    docTypes: doc.letterTypes.map(t => ({ id: t.id, name: t.name, compulsory: t.compulsory })),
    letters: liveLetters(doc.letters).map(l => ({
      id: l.id, staffId: l.staffId, typeId: l.typeId ?? '', typeName: l.typeName, file: l.fileName,
      staffName: l.staffName, filedAt: l.filedAt, readAt: l.readAt, ackAt: l.acknowledgedAt,
    })),
    // HR Mobile's Documents › Company (2026-10-17): the company's documents still on file.
    documents: (doc.documents ?? []).filter(x => !x.deletedAt).map(x => ({
      id: x.id, name: x.name, file: x.fileName, size: x.size, depts: x.departments.map(deptLabel), at: x.uploadedAt,
    })),
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
  // HR Mobile (2026-10-17): Today, Approve, Leave balances, Month close and Records are HR › Attendance's pages;
  // People is People Management's.
  today: '/attendance/today',
  approve: '/attendance/requests',
  balances: '/attendance/balances',
  close: '/attendance/close',
  records: '/attendance/records',
  people: '/team/people',
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
    today: canDo(user, 'attendance', 'view') && open(PART_PAGE.today),
    approve: canDo(user, 'attendance', 'view') && open(PART_PAGE.approve),
    balances: canDo(user, 'attendance', 'view') && open(PART_PAGE.balances),
    close: canDo(user, 'attendance', 'view') && open(PART_PAGE.close),
    records: canDo(user, 'attendance', 'view') && open(PART_PAGE.records),
    people: (can(user, 'team') || can(user, 'team_directory')) && open(PART_PAGE.people),
  }
  // Member services decides by its key (member_is_manager); a box unticked on its page still closes it.
  const decide = parts.requests && (!user.closed?.length || canDo(onPage(user, PART_PAGE.requests), 'member', 'manage'))
  return {
    parts,
    may: {
      attDecide: parts.approve && canDo(onPage(user, PART_PAGE.approve), 'attendance', 'approve'),
      decide,
      hireApprove: parts.hiring && canDo(onPage(user, PART_PAGE.hiring), 'hiring', 'approve'),
      hireEdit: parts.hiring && canDo(onPage(user, PART_PAGE.hiring), 'hiring', 'edit'),
      hireCreate: parts.hiring && canDo(onPage(user, PART_PAGE.hiring), 'hiring', 'create'),
      talentEdit: parts.talent && canDo(onPage(user, PART_PAGE.talent), 'hiring', 'edit'),
      book: parts.rooms && canDo(onPage(user, PART_PAGE.rooms), 'rooms', 'create'),
      // A probation's reminder (2026-10-23): People · Edit on a person's page, as HR view's bell asks — never while
      // viewing as somebody.
      probationAck: parts.people && seesProbationReminders(user),
    },
  }
}

/**
 * What HR's new work they are told of (2026-10-11, mig 20261011180000): the parts the app shows them and may act
 * in. The database keeps only those their own actions hold (`notification_topics_sync`). A probation ending
 * (2026-10-23, mig 20261024223000): whoever may acknowledge it. Since 2026-10-24 (mig 20261025003000) every topic is
 * asked again, as its holder, whenever it tells (`notification_topic_may`), so no permission change forgets one —
 * a page's tab, which the database cannot ask, is asked here.
 */
export function hrTopics(user: User): string[] {
  const { parts, may } = appAccess(user)
  return [
    ...(may.hireApprove ? ['hiring.guest'] : []),
    ...(parts.rooms && canDo(onPage(user, PART_PAGE.rooms), 'rooms', 'edit') ? ['rooms.guest'] : []),
    ...(may.decide ? ['member.requests'] : []),
    ...(may.probationAck ? ['people.probation'] : []),
  ]
}

/**
 * Everybody's mobile, for a person's Call and Message (2026-10-17, HR Mobile): People's own column, read under the
 * viewer's session — only while People is open to them, and only the people their reach shows.
 */
async function mobiles(): Promise<Record<string, string>> {
  const { data, error } = await (await client()).from('hr_staff_costs').select('id, contact_number').eq('status', 'active')
  if (error || !data) return {}
  return Object.fromEntries((data as Array<{ id: string; contact_number: string | null }>).filter(r => r.contact_number).map(r => [r.id, String(r.contact_number)]))
}

/** HR › Attendance as the app reads it: settings and people, this month, the requests, this year's ledger. */
async function attendanceOf(parts: HrAppData['parts'], today: string): Promise<{ att: HrAppData['att']; attError: string | null }> {
  if (!(parts.today || parts.approve || parts.balances || parts.close || parts.records)) return { att: null, attError: null }
  const [board, requests, ledger] = await Promise.all([loadBoard(today), parts.approve || parts.close ? loadRequests() : Promise.resolve(null), loadLedger(Number(today.slice(0, 4)))])
  if (!board.ok) return { att: null, attError: board.reason }
  return {
    att: { config: board.data.config, month: board.data.month, requests: requests?.ok ? requests.data : [], ledger: ledger.ok ? ledger.data : null },
    attError: requests && !requests.ok ? requests.reason : null,
  }
}

export async function loadHrAppData(user: User): Promise<HrAppData> {
  const today = officeToday()
  const { parts, may } = appAccess(user)
  const readsHiring = parts.hiring || parts.insights || parts.talent
  const [attRead, phones, probationRead] = await Promise.all([
    attendanceOf(parts, today),
    parts.people ? mobiles() : Promise.resolve({}),
    // The probations HR is reminded of (2026-10-23): read only for whoever may acknowledge one.
    may.probationAck ? (async () => (await client()).rpc('probation_reviews'))() : Promise.resolve(null),
  ])
  const [members, factsRead, range, people, docs, hiring, notices, personal, mine, myDocs] = await Promise.all([
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
    // Their own documents (2026-10-14): Company and Personal — the login's, never somebody else's while viewing as them.
    user.viewingAs ? Promise.resolve(null) : loadMyDocuments(),
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
    talents: board && parts.talent ? board.talents.map(t => talentOf(t, board.talentReasons)) : [],
    docTypes: center?.docTypes ?? [],
    letters: center?.letters ?? [],
    documents: center?.documents ?? [],
    hireFields: board && parts.hiring ? board.fields : [],
    hireReasons: board && parts.hiring ? board.talentReasons : [],
    hirePeople: board && parts.hiring ? board.people.map(p => ({ id: p.id, name: p.name, dept: p.department ?? '' })) : [],
    hireMe: board?.me.staffId ?? null,
    bookDepts: (who?.departments ?? []).map(d => ({ id: d.id, name: d.name })),
    parts,
    may,
    notices: notices && !notices.error ? noticesFromRow(notices.data) : { unread: 0, items: [] },
    probation: probationRead && !probationRead.error ? reviewsFromRow(probationRead.data) : null,
    views: user.canSwitchView && !user.viewingAs ? { current: hrAppViewOf(user.role) } : null,
    personalLogin: personal,
    memos: mine.memos,
    myDocs: myDocs?.ok ? myDocs.data : null,
    att: attRead.att,
    attError: attRead.attError,
    phones,
    // The greeting's second line: "Siti Nurhaliza · HR Manager".
    meLine: [user.viewingAs?.name ?? who?.me?.name ?? user.name ?? '', attRead.att?.config.people.find(p => p.id === who?.me?.staffId)?.title ?? null].filter(Boolean).join(' · '),
  }
}
