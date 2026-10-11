import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/member/server', () => ({ adminMemberAction: vi.fn() }))
vi.mock('@/lib/rooms/read', () => ({ readRoomsPeople: vi.fn(), readRoomsRange: vi.fn() }))
vi.mock('@/lib/documentation/server', () => ({ loadDocumentation: vi.fn() }))
vi.mock('@/lib/hiring/board', () => ({ loadHiringBoard: vi.fn() }))

import type { HiringRequest, HiringTalent } from '@/lib/hiring/types'
import type { MemberRequest } from '@/lib/member/types'
import type { Booking } from '@/lib/rooms/model'
import type { User } from '@/types'
import { appAccess, bookingOf, dataCenterOf, hireOf, memberRequestOf, talentOf } from './server'

// HR's account: every Round-2 cell, the keys that open their pages.
const HR_ACTIONS = {
  'hiring.view': 'all', 'hiring.create': 'all', 'hiring.edit': 'all', 'hiring.approve': 'all',
  'documentation.view': 'all', 'rooms.view': 'all', 'rooms.create': 'all', 'rooms.edit': 'all',
  'member.view': 'all', 'member.manage': 'all',
} as const
const HR_KEYS = ['hiring', 'documentation', 'meeting_rooms_manage', 'member_requests_manage']
const hrUser = (over: Partial<User>): User =>
  ({ id: 'u', email: 'hr@example.invalid', name: 'HR', role: 'hr', is_active: true, permissions: HR_KEYS, actions: { ...HR_ACTIONS }, ...over }) as unknown as User

describe('the app follows the account’s tabs, page by page (the review’s M2)', () => {
  it('with nothing unticked, every part and every write their cells hold', () => {
    expect(appAccess(hrUser({}))).toEqual({
      parts: { requests: true, hiring: true, insights: true, talent: true, docs: true, rooms: true },
      may: { decide: true, hireApprove: true, hireEdit: true, hireCreate: true, talentEdit: true, book: true },
    })
  })

  it('a closed page is left out — Requests closed while Insights stays — and a box unticked on one page closes its write there only', () => {
    const tabs = ['hr.hiring_insights.view', 'hr.talent_bank.view', 'hr.talent_bank.create', 'hr.documentation.view',
      'hr.member_services.view', 'hr.member_services.edit', 'hr.meeting_rooms.view', 'hr.meeting_rooms.create']
    const closed = ['hr.hiring_requests.view', 'hr.hiring_requests.create', 'hr.hiring_requests.edit', 'hr.hiring_requests.approve', 'hr.talent_bank.edit']
    const access = appAccess(hrUser({ tabs, closed }))
    expect(access.parts).toEqual({ requests: true, hiring: false, insights: true, talent: true, docs: true, rooms: true })
    expect(access.may).toEqual({ decide: true, hireApprove: false, hireEdit: false, hireCreate: false, talentEdit: false, book: true })
  })

  it('Member services’ Edit unticked: its requests still show, nothing is decided from the app', () => {
    const tabs = ['hr.member_services.view', 'hr.meeting_rooms.view']
    expect(appAccess(hrUser({ tabs, closed: ['hr.member_services.edit'] })).may.decide).toBe(false)
  })

  it('without the cell, the tab opens nothing', () => {
    const access = appAccess(hrUser({ actions: { 'rooms.view': 'all' }, permissions: ['meeting_rooms'] }))
    expect(access.parts).toEqual({ requests: false, hiring: false, insights: false, talent: false, docs: false, rooms: true })
    expect(access.may.book).toBe(false)
  })
})

// The HR phone app on the portal's own modules (2026-10-11): what each module answers, as the app draws it.

const REQUEST: HiringRequest = {
  id: 'HR-205', status: 'acknowledged', source: 'portal', requestedBy: 'kj', requesterName: 'Kar Jun', requesterDepartment: 'Revenue',
  requesterCompany: null, requesterPhone: null, fields: [],
  answers: { position: 'Senior Revenue Specialist', dept: 'Revenue · IR', headcount: '2', budget: '3200–3800', start: 'Within 1 month', emp: 'Full-time', reason: 'Expansion', age: '25–40', gender: 'Any', race: 'Any', jd: 'Lead fair sales for IR.', notes: '' },
  ownerId: 'grace', assistedBy: null, hiredNames: [], hiredThrough: null, hiringCost: null, attachmentName: null,
  submittedAt: '2026-10-09T01:00:00Z', acknowledgedAt: '2026-10-09T03:00:00Z', filledAt: null, closedAt: null,
  candidates: [{ id: 'c1', name: 'Melissa Ong', phone: '012-345 6789', source: 'Applied', stage: 'appointment', talentId: null, answers: {}, note: 'Referred by Chea Huan', files: [] }],
  events: [{ what: 'Submitted', who: 'Kar Jun', note: '', at: '2026-10-09T01:00:00Z' }, { what: 'Acknowledged', who: 'Grace Lim', note: 'Grace Lim owns it', at: '2026-10-09T03:00:00Z' }],
}
const PEOPLE = [{ id: 'grace', name: 'Grace Lim', title: 'HR Manager', department: 'HR' }]

describe('a hiring request, as the app draws it', () => {
  it('reads the requester form by the handoff’s field ids, the money grouped, the days as the portal writes them', () => {
    expect(hireOf(REQUEST, { people: PEOPLE })).toEqual({
      id: 'HR-205', status: 'acknowledged', position: 'Senior Revenue Specialist', headcount: 2, dept: 'Revenue · IR', budget: '3,200–3,800',
      start: 'Within 1 month', employment: 'Full-time', reason: 'Expansion', age: '25–40', gender: 'Any', race: 'Any', jd: 'Lead fair sales for IR.',
      notes: undefined, ownerName: 'Grace Lim', requester: 'Kar Jun', company: null, when: '9 Oct 2026', hired: null, source: null, cost: null,
      candidates: [{ id: 'c1', name: 'Melissa Ong', phone: '012-345 6789', note: 'Referred by Chea Huan', source: 'Applied', stage: 'appointment' }],
      events: [{ what: 'Submitted', when: '9 Oct 2026', who: 'Kar Jun', note: undefined }, { what: 'Acknowledged', when: '9 Oct 2026', who: 'Grace Lim', note: 'Grace Lim owns it' }],
    })
  })

  it('says who was hired, through what and at what cost once it is filled; one headcount when none is given', () => {
    const filled = hireOf({ ...REQUEST, status: 'filled', answers: { ...REQUEST.answers, headcount: '' }, hiredNames: ['Melissa Ong', 'Ryan Tan'], hiredThrough: 'Jobstreet', hiringCost: 1450 }, { people: [] })
    expect(filled).toMatchObject({ headcount: 1, hired: 'Melissa Ong, Ryan Tan', source: 'Jobstreet', cost: '1,450', ownerName: null })
    expect(hireOf({ ...REQUEST, requesterCompany: 'HOUZS Interior Sdn Bhd' }, { people: PEOPLE }).company).toBe('HOUZS Interior Sdn Bhd')
  })

  it('keeps somebody in the Talent Bank by their own words', () => {
    const t: HiringTalent = {
      id: 't1', no: 'T-001', name: 'Joyce Tan', phone: '', email: 'joyce@example.invalid', position: 'Account Executive', department: 'Finance',
      fromRequest: 'HR-199', notes: 'Strong on AR.', files: [], savedBy: 'Grace Lim', savedAt: '2026-09-02T08:00:00Z', events: [],
    }
    expect(talentOf(t)).toEqual({ id: 't1', name: 'Joyce Tan', phone: undefined, email: 'joyce@example.invalid', position: 'Account Executive', dept: 'Finance', from: 'HR-199', when: '2 Sep 2026', notes: 'Strong on AR.' })
  })
})

describe('the Data center', () => {
  it('lists everybody with their department’s short name, the letter types, and every letter on file — a memo saved there by its own name, a withdrawn one not at all', () => {
    const center = dataCenterOf({
      departments: [{ id: 'rev', name: 'Revenue Department', people: 1 }, { id: 'hr', name: 'HR', people: 1 }],
      people: [{ id: 'kj', name: 'Kar Jun', code: null, title: 'Team Assistant', departmentId: 'rev' }, { id: 'x', name: 'Nobody', code: null, title: null, departmentId: null }],
      letterTypes: [{ id: 'offer', name: 'Offer letter', compulsory: true, count: 1 }],
      letters: [
        { id: 'L1', ref: 'D-101', staffId: 'kj', staffName: 'Kar Jun', typeId: 'offer', typeName: 'Offer letter', fileName: 'Offer_kj.pdf', contentType: null, size: null, filedAt: '', filedBy: '', source: 'upload', readAt: null, acknowledgedAt: null, withdrawnAt: null, events: [] },
        { id: 'L2', ref: 'D-102', staffId: 'kj', staffName: 'Kar Jun', typeId: null, typeName: 'Memo', fileName: 'Rules.pdf', contentType: null, size: null, filedAt: '', filedBy: '', source: 'publish', readAt: null, acknowledgedAt: null, withdrawnAt: null, events: [] },
        { id: 'L3', ref: 'D-103', staffId: 'x', staffName: 'Nobody', typeId: 'offer', typeName: 'Offer letter', fileName: 'Wrong.pdf', contentType: null, size: null, filedAt: '', filedBy: '', source: 'upload', readAt: null, acknowledgedAt: null, withdrawnAt: '2026-10-11T03:00:00Z', events: [] },
      ],
    })
    expect(center.staff).toEqual([{ id: 'kj', name: 'Kar Jun', title: 'Team Assistant', dept: 'Revenue' }, { id: 'x', name: 'Nobody', title: '', dept: '' }])
    expect(center.docTypes).toEqual([{ id: 'offer', name: 'Offer letter', compulsory: true }])
    expect(center.letters).toEqual([
      { id: 'L1', staffId: 'kj', typeId: 'offer', typeName: 'Offer letter', file: 'Offer_kj.pdf' },
      { id: 'L2', staffId: 'kj', typeId: '', typeName: 'Memo', file: 'Rules.pdf' },
    ])
  })
})

describe('Member services’ requests and the meeting rooms', () => {
  const request = (over: Partial<MemberRequest>): MemberRequest => ({
    id: '5f0c8f1e-0000-4000-8000-000000000001', kind: 'claim', title: 'Claim', status: 'submitted', createdAt: '2026-10-05T04:00:00Z',
    detail: { amount: 480, category: 'Outstation 住宿', location: 'Kuantan', subDepartmentId: 'fair' }, ...over,
  })

  it('quotes a request by the number HR and the member both use, else its short id', () => {
    const subs = [{ id: 'fair', name: 'Fair' }] as never
    expect(memberRequestOf(request({ requestNo: 'RQ-2610-004' }), { submittedBy: 'Adrian' } as never, subs)).toMatchObject({
      code: 'RQ-2610-004', sub: 'Fair', byName: 'Adrian', category: 'Outstation accommodation', location: 'Kuantan', amount: '480',
    })
    expect(memberRequestOf(request({}), undefined, subs)?.code).toBe('RQ-5F0C8F1E')
    expect(memberRequestOf(request({ kind: 'memo' as never }), undefined, subs)).toBeNull()
  })

  it('lets the viewer cancel only what the database says they may', () => {
    const b = { id: 'b1', room: 'r1', day: '2026-10-11', from: 540, to: 600, title: 'Sync', department: 'HR', subDepartment: null, bookedBy: 'Grace Lim', canChange: true, source: 'hr_app', guestCompany: null, pax: 3 } as unknown as Booking
    expect(bookingOf(b)).toEqual({ id: 'b1', roomId: 'r1', date: '2026-10-11', from: 540, to: 600, title: 'Sync', dept: 'HR', byName: 'Grace Lim', mine: true, guest: false, company: null, pax: 3 })
    expect(bookingOf({ ...b, source: 'guest', canChange: false, guestCompany: 'Akemi Retail Sdn Bhd', department: null } as Booking)).toMatchObject({ guest: true, mine: false, company: 'Akemi Retail Sdn Bhd', dept: '' })
  })
})

describe('viewing the app as somebody (the roles audit, 2026-10-11)', () => {
  it('greets the person viewed, not the signed-in account the database answers for, and names them for the read-only strip', async () => {
    const { readRoomsPeople, readRoomsRange } = await import('@/lib/rooms/read')
    const { adminMemberAction } = await import('@/lib/member/server')
    const { createClient } = await import('@/lib/supabase/server')
    const { loadDocumentation } = await import('@/lib/documentation/server')
    const { loadHiringBoard } = await import('@/lib/hiring/board')
    vi.mocked(readRoomsRange).mockResolvedValue({ ok: false, reason: 'none' } as never)
    vi.mocked(readRoomsPeople).mockResolvedValue({ ok: true, data: { me: { name: 'Principal Account', staffId: 'p1' }, account: 'Principal', people: [], departments: [] } } as never)
    vi.mocked(adminMemberAction).mockResolvedValue({ ok: false } as never)
    vi.mocked(createClient).mockResolvedValue({ rpc: async () => ({ data: null, error: { message: 'none' } }) } as never)
    vi.mocked(loadDocumentation).mockResolvedValue({ ok: false } as never)
    vi.mocked(loadHiringBoard).mockResolvedValue({ ok: false } as never)
    const { loadHrAppData } = await import('./server')

    const viewing = await loadHrAppData(hrUser({ name: 'Nurul Huda', viewingAs: { id: 'u2', name: 'Nurul Huda' } }))
    expect(viewing).toMatchObject({ greetName: 'Nurul', viewingAs: 'Nurul Huda', meId: null })

    const own = await loadHrAppData(hrUser({}))
    expect(own).toMatchObject({ greetName: 'Principal', viewingAs: null, meId: 'p1' })
  })
})
