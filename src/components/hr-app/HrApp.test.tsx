import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AttConfig, AttLedger, AttMonth, AttRequest, AttStep } from '@/lib/attendance/types'
import type { HrAppData } from '@/lib/hr-app/model'
import type { TermReview } from '@/lib/term-reviews'

const itSupport = vi.hoisted(() => ({ render: vi.fn() }))
vi.mock('@/components/it-support/ItSupport', () => ({
  default: (props: { app: string; initialId?: string; readOnly?: boolean }) => {
    itSupport.render(props)
    return <div data-testid="it-support" data-app={props.app} data-request={props.initialId ?? ''} />
  },
}))
vi.mock('@/components/layout/view-as-actions', () => ({ stopViewingAsPerson: vi.fn() }))
// Me (components/me) reads from the browser: drawn here as its layer only, with the rows the app hands it.
vi.mock('@/components/me/useMe', () => ({ useMe: () => ({ s: { today: null, todayAt: 0 } }), useClock: () => 0 }))
vi.mock('@/components/me/MeOverlay', () => ({
  MeOverlay: ({ open, accountRows, backLabel, startRequest }: { open: boolean; accountRows?: ReactNode; backLabel: string; startRequest?: string | null }) =>
    (open ? <div data-testid="me" data-back={backLabel} data-start={startRequest ?? ''}>{accountRows}</div> : null),
}))

import { PNG, padPicture, sign } from '@/test/signature'
import HrApp, { type HrAppActions } from './HrApp'

// The HR app — HR Mobile (2026-10-17, the handoff `design_handoff_hr_mobile`): four tabs, sub screens, the generic
// pages, sheets; and the old app's functions kept in the new look (the user: "keep all").

const work = { type: 'work' as const, start: '09:00', end: '18:00', break: 60 }
const person = (id: string, name: string, title: string, over: Record<string, unknown> = {}) => ({
  id, name, code: null, titleId: null, title, level: 3, levelName: 'Executive', departmentId: 'hr', department: 'HR', hireDate: '2023-03-03', hasLogin: true,
  uplineId: 's1', upline: 'Grace Lim', uplineHasLogin: true, templateId: null, ...over,
})
const config: AttConfig = {
  today: '2026-10-14', now: '10:05', canCreate: true, canEdit: true, canApprove: true, me: 'Grace Lim',
  people: [
    person('s1', 'Grace Lim', 'HR Manager', { uplineId: null, upline: null, level: 7 }),
    person('s2', 'Nurul Huda', 'HR Executive'),
    person('s3', 'Kar Jun', 'Team Assistant'),
  ],
  titles: [], levels: [{ rank: 3, name: 'Executive' }, { rank: 7, name: 'Manager' }], departments: [{ id: 'hr', name: 'HR' }],
  schedules: [{ id: 'w', name: 'Office 9–6', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => ({ day, ...work })).concat([{ day: 'Sat', type: 'off' } as never, { day: 'Sun', type: 'rest' } as never]) }],
  locations: [{ id: 'hq', name: 'HQ', address: '', state: 'Selangor', radius: 150, lat: 3.05, lng: 101.62 }],
  holidays: [],
  assignments: [{ id: 'a', level: 'company', titleId: null, staffId: null, label: 'Everyone', mode: 'clock', scheduleId: 'w', locationId: 'hq', anywhere: false, ot: 'statutory', from: '2026-01-01' }],
  leaveTypes: [{ id: 'al', code: 'AL', name: 'Annual leave', groups: [{ titles: ['all'], levels: ['all'], base: 12, steps: [] }], rules: '', route: 'upline_only', counts: 'working', accrues: true, unpaid: false, drawsFrom: null }],
  otRates: [], routes: [],
  policies: [{ id: 'p', from: '2026-01-01', fenceMode: 'flag', photoRequired: true, earliestInMin: 120, cutover: '04:00', graceMin: 5, correctionsPerMonth: 3, otWarnH: 80, otFlagH: 104, otBase: 'basic', photoKeepDays: 90, otWageCap: 4000 }],
}
const pin = (staffId: string, time: string) => ({ id: staffId, staffId, day: '2026-10-14', dir: 'in' as const, time, source: 'app' as const, locationId: 'hq', distance: 12, inside: true, accuracy: 5, device: '', photo: true, reason: '', invalid: false, invalidReason: '' })
const month: AttMonth = { month: '2026-10-01', punches: [pin('s1', '08:32'), pin('s2', '09:08')], marks: [], overrides: [], leave: [], decisions: [], close: null }
const step = (over: Partial<AttStep>): AttStep => ({ id: 'x', seq: 1, role: 'hr', approverId: null, approver: 'HR approvers', state: 'waiting', decidedBy: null, onBehalf: false, note: '', arrivedAt: '2026-10-14T00:20:00Z', decidedAt: null, ...over })
const req = (over: Partial<AttRequest>): AttRequest => ({
  id: 'q-al', ref: 'LV-2610-004', staffId: 's3', who: 'Kar Jun', kind: 'leave', leaveCode: 'AL', from: '2026-10-22', to: '2026-10-23', days: 2, hours: null, detail: {},
  reason: 'Family trip', attachment: null, hasAttachment: false, route: 'hr_only', status: 'pending', onBehalf: false, by: 'Kar Jun', sentAt: '2026-10-14T00:20:00Z',
  decidedAt: null, steps: [step({})], events: [], ...over,
})
const requests = [
  req({}),
  req({ id: 'q-ot', ref: 'OT-2610-014', staffId: 's2', who: 'Nurul Huda', kind: 'ot', leaveCode: null, from: '2026-10-15', to: '2026-10-15', days: null, hours: 3, route: 'upline_then_hr',
    detail: { from: '18:00', to: '21:00' }, steps: [step({ role: 'upline', approver: 'Grace Lim' }), step({ id: 'y', seq: 2, state: 'queued', arrivedAt: null })] }),
]
const ledger: AttLedger = { year: 2026, entries: [], leave: [], marks: [] }

const data: HrAppData = {
  greetName: 'Grace', meId: 's1', viewingAs: null, today: '2026-10-14', meLine: 'Grace Lim · HR Manager',
  staff: [{ id: 's1', name: 'Grace Lim', title: 'HR Manager', dept: 'HR' }, { id: 's2', name: 'Nurul Huda', title: 'HR Executive', dept: 'HR' }],
  owners: [], hires: [], requests: [], rooms: [{ id: 'r1', name: 'Meeting Room 1', seats: 8 }], bookings: [], sources: [], talents: [], docTypes: [], letters: [],
  bookDepts: [{ id: 'd1', name: 'HR' }],
  parts: { requests: false, hiring: false, insights: false, talent: false, docs: false, rooms: true, today: true, approve: true, balances: true, close: true, records: true, people: true },
  may: { attDecide: true, decide: false, hireApprove: false, hireEdit: false, hireCreate: false, talentEdit: false, book: true },
  notices: { unread: 0, items: [] },
  att: { config, month, requests, ledger },
  phones: { s2: '012-345 6789' },
}

const done = vi.fn(async () => ({ ok: true as const }))
const actions = {
  hireAck: done, hireInfo: done, hireDecline: done, hireCancel: done, hireFill: done, hireNew: vi.fn(async () => ({ ok: true as const, id: 'HR-300' })), candStage: done, candAdd: done,
  requestDecide: done, attDecide: done, book: done, bookCancel: done, talentNotes: done, talentRemove: done,
  letterLink: vi.fn(async () => ({ ok: false as const, reason: 'none' })),
  noticesRead: done, pushSave: done, pushRemove: done, pushTrouble: vi.fn(),
  switchView: vi.fn(),
  refresh: vi.fn(),
} as unknown as HrAppActions

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.history.pushState(null, '', '/hr-app')
})

const nav = () => screen.getByRole('navigation', { name: 'HR app' })
const tab = (name: string) => fireEvent.click(within(nav()).getByRole('button', { name: new RegExp(`^${name}`) }))

describe('the four tabs', () => {
  it('Home: the brand and who, the greeting, the line, quick actions and the six sections; Approve’s badge', () => {
    render(<HrApp data={data} actions={actions} />)
    expect(screen.getByText('HOUZS HR')).toBeInTheDocument()
    expect(screen.getByText('Grace Lim · HR Manager')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Good (morning|afternoon|evening), Grace\.$/ })).toBeInTheDocument()
    expect(screen.getByText('1 request waiting for HR · 1 not in yet · 1 late · October closes 3 Nov.')).toBeInTheDocument()
    expect(within(nav()).getAllByRole('button').map(b => b.textContent)).toEqual(['Home', 'Today', 'Approve1', 'People'])
    // Payroll, People and the rest are on Home; a section whose pages are all closed is not.
    expect(screen.getByText('Quick actions')).toBeInTheDocument()
    expect(screen.getByText('III.')).toBeInTheDocument()
    expect(screen.queryByText('Talent Bank')).toBeNull()
  })

  it('Today: the four tiles count and filter; the list runs Not in → Late → In', () => {
    render(<HrApp data={data} actions={actions} />)
    tab('Today')
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    const names = () => screen.getAllByRole('button').map(b => b.textContent ?? '').filter(t => /Grace|Nurul|Kar/.test(t))
    expect(names()).toEqual(['KJKar JunTeam Assistant · no punch yetNot in', 'NHNurul HudaIN 09:08 · HQ · 12 mLate 8m', 'GLGrace LimIN 08:32 · HQ · 12 mIn'])
    fireEvent.click(screen.getByRole('button', { name: /^1\s*Late/ }))
    expect(names()).toEqual(['NHNurul HudaIN 09:08 · HQ · 12 mLate 8m'])
    fireEvent.click(screen.getByRole('button', { name: /^1\s*Late/ }))
    expect(names()).toHaveLength(3)
  })

  it('People: by department, the search, a person’s page — Call with no mobile on file says so', () => {
    render(<HrApp data={data} actions={actions} />)
    tab('People')
    expect(screen.getByText('HR · 3')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search name or title'), { target: { value: 'assistant' } })
    expect(screen.getByText('HR · 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Kar Jun/ }))
    expect(screen.getByRole('heading', { name: 'Kar Jun' })).toBeInTheDocument()
    expect(screen.getByText('Today · Not in')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Call' }))
    expect(screen.getByRole('status')).toHaveTextContent('No mobile on file')
  })
})

describe('Approve', () => {
  it('Pending: HR’s own step; Reject waits for a note, then sends it; the toast is the handoff’s', async () => {
    const decide = vi.fn(async () => ({ ok: true as const }))
    render(<HrApp data={data} actions={{ ...actions, attDecide: decide }} />)
    tab('Approve')
    fireEvent.click(screen.getByRole('button', { name: /Kar Jun/ }))
    expect(screen.getByRole('heading', { name: 'Annual leave' })).toBeInTheDocument()
    expect(screen.getByText('Approval flow')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByRole('status')).toHaveTextContent('Add a note to reject')
    expect(decide).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Busy week' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(decide).toHaveBeenCalledWith('q-al', false, 'Busy week'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Kar Jun · Annual leave rejected'))
  })

  it('At upline: “Approve on behalf”', async () => {
    const decide = vi.fn(async () => ({ ok: true as const }))
    render(<HrApp data={data} actions={{ ...actions, attDecide: decide }} />)
    tab('Approve')
    fireEvent.click(screen.getByRole('button', { name: /^At upline/ }))
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve on behalf' }))
    await waitFor(() => expect(decide).toHaveBeenCalledWith('q-ot', true, ''))
  })

  it('at the viewer’s own upline seat: a plain “Approve” — their own step, never on their own behalf (2026-10-17)', async () => {
    const decide = vi.fn(async () => ({ ok: true as const }))
    const mine = requests.map(r => (r.id === 'q-ot' ? { ...r, steps: [step({ role: 'upline', approver: 'Grace Lim', approverId: 's1' }), step({ id: 'y', seq: 2, state: 'queued', arrivedAt: null })] } : r))
    render(<HrApp data={{ ...data, att: { config, month, requests: mine, ledger } }} actions={{ ...actions, attDecide: decide }} />)
    tab('Approve')
    fireEvent.click(screen.getByRole('button', { name: /^At upline/ }))
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    expect(screen.queryByRole('button', { name: 'Approve on behalf' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(decide).toHaveBeenCalledWith('q-ot', true, ''))
  })

  it('without Approve’s box: the page, no decision bar', () => {
    render(<HrApp data={{ ...data, may: { ...data.may, attDecide: false } }} actions={actions} />)
    tab('Approve')
    fireEvent.click(screen.getByRole('button', { name: /Kar Jun/ }))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
  })

  it('Members (the old Review): a claim asks payroll or payment, and sends the one pressed with the note', async () => {
    const claim = { id: 'q1', code: 'RQ-2610-004', kind: 'claim' as const, status: 'submitted', sub: 'Fair', byName: 'Kar Jun', category: 'Travel', location: 'Penang', amount: '120.00' }
    const decide = vi.fn(async () => ({ ok: true as const }))
    render(<HrApp data={{ ...data, requests: [claim], parts: { ...data.parts, requests: true }, may: { ...data.may, decide: true } }} actions={{ ...actions, requestDecide: decide }} />)
    expect(within(nav()).getByRole('button', { name: /^Approve/ })).toHaveTextContent('Approve2')
    tab('Approve')
    fireEvent.click(screen.getByRole('button', { name: /^Members/ }))
    fireEvent.click(screen.getByRole('button', { name: /Travel · RM 120\.00/ }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Receipts checked' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('dialog', { name: 'Approve claim' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Request payment' }))
    await waitFor(() => expect(decide).toHaveBeenCalledWith('q1', 'approve', 'Receipts checked', 'payment'))
  })
})

describe('the sub screens', () => {
  it('Leave balances and Month close', () => {
    render(<HrApp data={data} actions={actions} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Leave' })[0])
    expect(screen.getByRole('heading', { name: 'Leave balances' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('All 3')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Month close' })[0])
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    expect(screen.getByText('Register + payroll')).toBeInTheDocument()
    expect(screen.getByText('Deciding days and closing the month happen on desktop.')).toBeInTheDocument()
  })

  it('Payroll opens on the desktop', () => {
    render(<HrApp data={data} actions={actions} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Payroll' })[0])
    expect(screen.getByText('This page works best on a bigger screen. Open it on the desktop portal.')).toBeInTheDocument()
  })
})

describe('the room schedule’s Book sheet (the old Rooms)', () => {
  function openBook() {
    render(<HrApp data={data} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Room schedule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Book a room' }))
  }

  it('keeps the same title field, focused, key after key', () => {
    openBook()
    const field = screen.getByPlaceholderText('e.g. Interview')
    field.focus()
    for (const typed of ['I', 'In', 'Int', 'Interview']) {
      fireEvent.change(screen.getByPlaceholderText('e.g. Interview'), { target: { value: typed } })
      expect(screen.getByPlaceholderText('e.g. Interview')).toBe(field)
      expect(document.activeElement).toBe(field)
    }
    expect(field).toHaveValue('Interview')
  })

  it('keeps the people search while a name is typed, and finds them', () => {
    openBook()
    const search = screen.getByPlaceholderText('Add a colleague — type a name')
    search.focus()
    fireEvent.change(search, { target: { value: 'N' } })
    fireEvent.change(screen.getByPlaceholderText('Add a colleague — type a name'), { target: { value: 'Nur' } })
    expect(screen.getByPlaceholderText('Add a colleague — type a name')).toBe(search)
    expect(screen.getByRole('button', { name: '+ Nurul Huda' })).toBeInTheDocument()
  })

  it('books it and says so', async () => {
    const book = vi.fn(async () => ({ ok: true as const }))
    render(<HrApp data={data} actions={{ ...actions, book }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Room schedule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Book a room' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. Interview'), { target: { value: 'Interview' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Department' }), { target: { value: 'd1' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Room' }), { target: { value: 'r1' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'From' }), { target: { value: '900' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'To' }), { target: { value: '960' } })
    fireEvent.click(screen.getByRole('button', { name: 'Book' }))
    await waitFor(() => expect(book).toHaveBeenCalledWith({ title: 'Interview', dept: 'd1', roomId: 'r1', date: '2026-10-14', from: 900, to: 960, attendees: ['s1'], pax: 1 }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Meeting Room 1 booked 15:00–16:00'))
  })
})

describe('viewed as somebody', () => {
  it('says whose app it is; no bell, no avatar, no decisions', () => {
    render(<HrApp data={{ ...data, viewingAs: 'Nurul Huda', greetName: 'Nurul' }} actions={actions} />)
    expect(screen.getByRole('status')).toHaveTextContent('Viewing as Nurul Huda — their pages, menus and buttons. Read-only: nothing you press is saved.')
    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Me' })).toBeNull()
    tab('Approve')
    fireEvent.click(screen.getByRole('button', { name: /Kar Jun/ }))
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })
})

describe('the bell (2026-10-11)', () => {
  const notices = {
    unread: 2,
    items: [
      { id: 'n3', kind: 'review' as const, title: 'New guest booking · HOUZS Interior', body: 'Showroom kickoff', refKind: 'booking' as const, refId: 'b9', at: new Date().toISOString(), read: false },
      { id: 'n2', kind: 'review' as const, title: 'New claim · Kar Jun', body: 'Travel', refKind: 'member_request' as const, refId: 'gone', at: new Date().toISOString(), read: false },
      { id: 'n1', kind: 'rooms' as const, title: 'Grace Lim added you to a meeting', body: 'Interview', refKind: 'booking' as const, refId: 'b1', at: '2026-10-01T02:00:00Z', read: true },
    ],
  }

  it('counts what is new, opens the list, marks them read; a notice opens its place', () => {
    const read = vi.fn(async () => ({ ok: true as const }))
    render(<HrApp data={{ ...data, notices, parts: { ...data.parts, requests: true } }} actions={{ ...actions, noticesRead: read }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 2 new' }))
    expect(read).toHaveBeenCalledWith(null)
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Earlier')).toBeInTheDocument()
    fireEvent.click(screen.getByText('New claim · Kar Jun'))
    expect(screen.getByRole('heading', { name: 'Approve' })).toBeInTheDocument()
  })

  it('opens a tapped push’s place once (?open=…), then forgets the address', () => {
    const hire = { id: 'HR-205', status: 'acknowledged', position: 'Revenue Specialist', headcount: 1, dept: 'Revenue · Fair', budget: '', start: '', ownerName: null,
      requester: 'Kar Jun', when: '9 Oct 2026', candidates: [], events: [] } as unknown as HrAppData['hires'][number]
    window.history.pushState(null, '', '/hr-app?open=hire:HR-205')
    render(<HrApp data={{ ...data, hires: [hire], parts: { ...data.parts, hiring: true } }} actions={actions} />)
    expect(screen.getByRole('heading', { name: 'Revenue Specialist' })).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('one’s own request, decided (?open=me:…, 2026-10-17): Me opens on it — for a login of their own', () => {
    window.history.pushState(null, '', '/hr-app?open=me:q-9')
    render(<HrApp data={{ ...data, personalLogin: true }} actions={actions} />)
    expect(screen.getByTestId('me')).toHaveAttribute('data-start', 'q-9')
    expect(window.location.search).toBe('')
    cleanup()
    // A shared login has no Me: the app as it opens.
    window.history.pushState(null, '', '/hr-app?open=me:q-9')
    render(<HrApp data={{ ...data, personalLogin: false }} actions={actions} />)
    expect(screen.queryByTestId('me')).toBeNull()
    expect(window.location.search).toBe('')
  })
})

// A probation ending (2026-10-23, mig 20261024223000 — the user: "HR 手机 app 里的提醒和推送"): Home lists the ones
// waiting, the person's page acknowledges one, a tapped push or a bell notice opens the person.
describe('a probation ending (2026-10-23)', () => {
  const review = (over: Partial<TermReview> = {}): TermReview => ({
    kind: 'probation', id: 's2', name: 'Nurul Huda', code: 'HV040', department: 'HR', title: 'HR Executive', hireDate: '2026-07-23', months: 3,
    endsOn: '2026-10-22', ackEnd: null, ackName: null, ackAt: null, ...over,
  })
  const acked = review({ id: 's3', name: 'Kar Jun', endsOn: '2026-10-20', ackEnd: '2026-10-20', ackName: 'Grace Lim', ackAt: '2026-10-14T01:00:00Z' })
  const withProbation = (over: Partial<HrAppData> = {}): HrAppData =>
    ({ ...data, probation: [review(), acked], may: { ...data.may, termEdit: true }, ...over })

  it('Home lists those waiting and its line counts them; one opens the person, whose page acknowledges it', async () => {
    const ack = vi.fn(async () => ({ ok: true as const }))
    render(<HrApp data={withProbation()} actions={{ ...actions, probationAck: ack }} />)
    expect(screen.getByText('1 request waiting for HR · 1 probation ending · 1 not in yet · 1 late · October closes 3 Nov.')).toBeInTheDocument()
    expect(screen.getByText('Probation ending')).toBeInTheDocument()
    const row = screen.getByRole('button', { name: /Nurul Huda/ })
    expect(row).toHaveTextContent('Ends 22 Oct 2026 · in 8 days · HR')
    // Acknowledged already: not on Home.
    expect(screen.queryByRole('button', { name: /Kar Jun.*Ends/ })).toBeNull()
    fireEvent.click(row)
    expect(screen.getByRole('heading', { name: 'Nurul Huda' })).toBeInTheDocument()
    expect(screen.getByText('3 months · ends 22 Oct 2026 · in 8 days')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(ack).toHaveBeenCalledWith('s2'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Acknowledged'))
    expect(actions.refresh).toHaveBeenCalled()
  })

  it('acknowledged for its end: who and when, no button — and none without the box, nor while viewing as somebody', () => {
    render(<HrApp data={withProbation()} actions={{ ...actions, probationAck: done }} />)
    tab('People')
    fireEvent.click(screen.getByRole('button', { name: /Kar Jun/ }))
    expect(screen.getByText('Acknowledged by Grace Lim · 14 Oct 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    cleanup()
    render(<HrApp data={withProbation({ may: { ...data.may, termEdit: false } })} actions={{ ...actions, probationAck: done }} />)
    tab('People')
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    expect(screen.getByText('3 months · ends 22 Oct 2026 · in 8 days')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    cleanup()
    render(<HrApp data={withProbation({ viewingAs: 'Grace Lim' })} actions={{ ...actions, probationAck: done }} />)
    expect(screen.queryByText('Probation ending')).toBeNull()
  })

  it('a tapped push opens the person (?open=person:…), then forgets the address; the bell’s notice is tagged PROB and opens them', () => {
    window.history.pushState(null, '', '/hr-app?open=person:s2')
    render(<HrApp data={withProbation()} actions={{ ...actions, probationAck: done }} />)
    expect(screen.getByRole('heading', { name: 'Nurul Huda' })).toBeInTheDocument()
    expect(window.location.search).toBe('')
    cleanup()
    const notices = { unread: 1, items: [{ id: 'n9', kind: 'people' as const, title: 'Probation ending · Nurul Huda', body: 'Ends 22 Oct 2026 · in 8 days · HR',
      refKind: 'hr_staff' as const, refId: 's2', at: new Date().toISOString(), read: false }] }
    render(<HrApp data={withProbation({ notices })} actions={{ ...actions, probationAck: done }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }))
    expect(screen.getByText('PROB')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Probation ending · Nurul Huda'))
    expect(screen.getByRole('heading', { name: 'Nurul Huda' })).toBeInTheDocument()
  })

  // A contract (2026-10-24 — "need 30 days and 15 days before remind, 2 reminder"): its own list on Home, its own
  // Acknowledge and tag — and each term is reminded 30 days before its end, then again 15.
  it('a contract ending: Home’s own list and line; the person’s page acknowledges it by its own action', async () => {
    const ack = vi.fn(async () => ({ ok: true as const }))
    const probationAck = vi.fn(async () => ({ ok: true as const }))
    const contract = [review({ kind: 'contract', months: 12, endsOn: '2026-11-03' })] // 20 days from 14 Oct: the first reminder
    render(<HrApp data={withProbation({ probation: [], contract })} actions={{ ...actions, probationAck, contractAck: ack }} />)
    expect(screen.getByText('1 request waiting for HR · 1 contract ending · 1 not in yet · 1 late · October closes 3 Nov.')).toBeInTheDocument()
    expect(screen.getByText('Contract ending')).toBeInTheDocument()
    expect(screen.queryByText('Probation ending')).toBeNull()
    expect(screen.getByText('CONT')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    expect(screen.getByText('12 months · ends 3 Nov 2026 · in 20 days')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(ack).toHaveBeenCalledWith('s2'))
    expect(probationAck).not.toHaveBeenCalled()
  })

  it('the first reminder’s acknowledgement does not answer the second: listed and offered again', () => {
    // Acknowledged on 1 Oct, 21 days before its end — the first reminder's; 8 days left on 14 Oct, the second stands.
    const first = review({ ackEnd: '2026-10-22', ackName: 'Grace Lim', ackAt: '2026-10-01T02:00:00Z' })
    render(<HrApp data={withProbation({ probation: [first] })} actions={{ ...actions, probationAck: done }} />)
    expect(screen.getByText('Probation ending')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    expect(screen.getByText('30-day reminder acknowledged by Grace Lim · 1 Oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument()
  })

  it('a contract’s notice is tagged CONT', () => {
    const notices = { unread: 1, items: [{ id: 'n10', kind: 'people' as const, title: 'Contract ending · Nurul Huda', body: 'Ends 3 Nov 2026 · in 20 days · HR',
      refKind: 'hr_staff' as const, refId: 's2', at: new Date().toISOString(), read: false }] }
    render(<HrApp data={withProbation({ probation: [], notices })} actions={{ ...actions, probationAck: done }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }))
    expect(screen.getByText('CONT')).toBeInTheDocument()
    expect(screen.queryByText('PROB')).toBeNull()
  })

  // The step after the reminder (2026-10-24 — the user: "do for hr app as well"): a contract's Renew, its new contract
  // required and filed with it; a probation's Confirm as permanent and Extend, each with a letter, optional.
  const TYPES = [
    { id: 'offer', name: 'Offer letter', compulsory: true },
    { id: 'cfs', name: 'Contract for Service', compulsory: false },
    { id: 'conf', name: 'Confirmation letter', compulsory: false },
  ]
  const withSteps = (over: Partial<HrAppData> = {}): HrAppData => withProbation({ may: { ...data.may, termEdit: true, letters: true }, letterTypes: TYPES, ...over })
  const pdf = (name: string) => new File(['%PDF'], name, { type: 'application/pdf' })
  const contract = [review({ kind: 'contract', months: 12, endsOn: '2026-11-03' })]

  it('a contract: Renew beside Acknowledge opens on the day after its end, its months and the contract’s type; the new contract is asked for, then renewed and filed', async () => {
    const renew = vi.fn(async () => ({ ok: true as const, endsOn: '2027-05-03', filed: 'Contract for Service' }))
    render(<HrApp data={withSteps({ probation: [], contract })} actions={{ ...actions, contractAck: done, contractRenew: renew }} />)
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }))
    const sheet = screen.getByRole('dialog', { name: 'Renew the contract' })
    expect(within(sheet).getByText('This one ends 3 Nov 2026')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('New contract starts')).toHaveValue('2026-11-04')
    expect(within(sheet).getByLabelText('Period')).toHaveValue('12')
    expect(within(sheet).getByText('3 Nov 2027')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Letter type')).toHaveValue('cfs')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Renew' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Attach the new contract.')
    expect(renew).not.toHaveBeenCalled()
    const file = pdf('contract-2027.pdf')
    fireEvent.change(within(sheet).getByLabelText('New contract'), { target: { files: [file] } })
    expect(within(sheet).getByText('contract-2027.pdf')).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Period'), { target: { value: '6' } })
    expect(within(sheet).getByText('3 May 2027')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Renew' }))
    await waitFor(() => expect(renew).toHaveBeenCalledWith({ staffId: 's2', start: '2026-11-04', months: 6, endsWas: '2026-11-03' }, { typeId: 'cfs', newType: '', file }, TYPES))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Contract renewed to 3 May 2027 · Contract for Service filed to Nurul Huda's record"))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actions.refresh).toHaveBeenCalled()
  })

  it('Renew: a start before this contract’s is refused here; the server’s refusal stays on the sheet', async () => {
    const renew = vi.fn(async () => ({ ok: false as const, reason: 'Their contract changed since this page was opened — reload it.' }))
    render(<HrApp data={withSteps({ probation: [], contract })} actions={{ ...actions, contractAck: done, contractRenew: renew }} />)
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }))
    const sheet = screen.getByRole('dialog', { name: 'Renew the contract' })
    fireEvent.change(within(sheet).getByLabelText('New contract'), { target: { files: [pdf('c.pdf')] } })
    fireEvent.change(within(sheet).getByLabelText('New contract starts'), { target: { value: '2026-07-01' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Renew' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('The new contract starts after this one did (23 Jul 2026).')
    expect(renew).not.toHaveBeenCalled()
    fireEvent.change(within(sheet).getByLabelText('New contract starts'), { target: { value: '2026-11-04' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Renew' }))
    await waitFor(() => expect(within(sheet).getByRole('alert')).toHaveTextContent('Their contract changed since this page was opened — reload it.'))
    expect(screen.getByRole('dialog', { name: 'Renew the contract' })).toBeInTheDocument()
  })

  it('no Renew without Documentation · Create — its contract could not be filed — nor for a contract with no end to count from', () => {
    render(<HrApp data={withSteps({ probation: [], contract, may: { ...data.may, termEdit: true, letters: false } })} actions={{ ...actions, contractAck: done, contractRenew: vi.fn() }} />)
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renew' })).toBeNull()
    cleanup()
    render(<HrApp data={withSteps({ probation: [], contract: [review({ kind: 'contract', months: 12, hireDate: null, endsOn: null })] })} actions={{ ...actions, contractAck: done, contractRenew: vi.fn() }} />)
    tab('People')
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    expect(screen.queryByRole('button', { name: 'Renew' })).toBeNull()
  })

  it('a probation: Extend and Confirm as permanent over Acknowledge; Confirm files its letter once confirmed', async () => {
    const confirm = vi.fn(async () => ({ ok: true as const }))
    const filed = vi.fn(async () => ({ filed: ['Confirmation letter'], failed: [] }))
    render(<HrApp data={withSteps()} actions={{ ...actions, probationAck: done, probationConfirm: confirm, probationExtend: done, lettersFile: filed }} />)
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    for (const name of ['Extend', 'Confirm as permanent', 'Acknowledge']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm as permanent' }))
    const sheet = screen.getByRole('dialog', { name: 'Confirm as permanent' })
    expect(within(sheet).getByText('Their probation ends here')).toBeInTheDocument()
    expect(within(sheet).getByLabelText('Letter type')).toHaveValue('conf')
    const file = pdf('confirmation.pdf')
    fireEvent.change(within(sheet).getByLabelText('Letter'), { target: { files: [file] } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('s2'))
    await waitFor(() => expect(filed).toHaveBeenCalledWith('s2', [expect.objectContaining({ typeId: 'conf', newType: '', file })], TYPES))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Nurul Huda · confirmed as permanent · Confirmation letter filed to Nurul Huda's record"))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Extend: by 1–3 months, the new end worked out; with no letter chosen only the step is sent', async () => {
    const extend = vi.fn(async () => ({ ok: true as const }))
    const filed = vi.fn()
    render(<HrApp data={withSteps()} actions={{ ...actions, probationAck: done, probationConfirm: done, probationExtend: extend, lettersFile: filed }} />)
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Extend' }))
    const sheet = screen.getByRole('dialog', { name: 'Extend the probation' })
    expect(within(sheet).getByText('It ends 22 Oct 2026')).toBeInTheDocument()
    expect(within(sheet).getByText('22 Nov 2026')).toBeInTheDocument()
    fireEvent.change(within(sheet).getByLabelText('Extend by'), { target: { value: '2' } })
    expect(within(sheet).getByText('22 Dec 2026')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Extend' }))
    await waitFor(() => expect(extend).toHaveBeenCalledWith('s2', 2))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Probation extended to 22 Dec 2026'))
    expect(filed).not.toHaveBeenCalled()
  })

  it('a letter that is not filed is said; the step stands — and without Documentation · Create the steps take none', async () => {
    const filed = vi.fn(async () => ({ filed: [], failed: [{ key: 'confirm', name: 'Confirmation letter', reason: 'The file did not arrive. Please upload it again.' }] }))
    render(<HrApp data={withSteps()} actions={{ ...actions, probationAck: done, probationConfirm: done, probationExtend: done, lettersFile: filed }} />)
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm as permanent' }))
    let sheet = screen.getByRole('dialog', { name: 'Confirm as permanent' })
    fireEvent.change(within(sheet).getByLabelText('Letter'), { target: { files: [pdf('confirmation.pdf')] } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'Nurul Huda · confirmed as permanent · Confirmation letter was not filed: The file did not arrive. Please upload it again.'))
    cleanup()
    render(<HrApp data={withSteps({ may: { ...data.may, termEdit: true, letters: false } })} actions={{ ...actions, probationAck: done, probationConfirm: done, probationExtend: done, lettersFile: filed }} />)
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm as permanent' }))
    sheet = screen.getByRole('dialog', { name: 'Confirm as permanent' })
    expect(within(sheet).queryByLabelText('Letter type')).toBeNull()
    expect(within(sheet).queryByLabelText('Letter')).toBeNull()
  })

  it('none of the steps without People · Edit on the person’s page, nor while viewing as somebody', () => {
    const steps = { ...actions, probationAck: done, probationConfirm: done, probationExtend: done, lettersFile: vi.fn(), contractAck: done, contractRenew: vi.fn() }
    render(<HrApp data={withSteps({ may: { ...data.may, termEdit: false, letters: true } })} actions={steps} />)
    tab('People')
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    for (const name of ['Extend', 'Confirm as permanent', 'Acknowledge', 'Renew']) expect(screen.queryByRole('button', { name })).toBeNull()
    cleanup()
    render(<HrApp data={withSteps({ viewingAs: 'Grace Lim' })} actions={steps} />)
    tab('People')
    fireEvent.click(screen.getByRole('button', { name: /Nurul Huda/ }))
    for (const name of ['Extend', 'Confirm as permanent', 'Acknowledge', 'Renew']) expect(screen.queryByRole('button', { name })).toBeNull()
  })
})

// IT-0008 (2026-10-24): a candidate not selected leaves the list for the Talent Bank — on the phone as on the request page.
describe('a hire’s candidates: Not selected goes to the Talent Bank', () => {
  const hire = {
    id: 'HR-205', status: 'acknowledged', position: 'Revenue Specialist', headcount: 1, dept: 'Revenue · Fair', budget: '', start: '', ownerName: null,
    requester: 'Kar Jun', when: '9 Oct 2026', events: [],
    candidates: [{ id: 'c1', name: 'Daniel Lee', source: 'Applied', stage: 'appointment' }, { id: 'c2', name: 'Nur Iman', source: 'Applied', stage: 'rejected' }],
  } as unknown as HrAppData['hires'][number]

  it('lists the ones still in the running; Not selected asks why — the one their stage says first — then keeps them in the bank', async () => {
    const stage = vi.fn(async () => ({ ok: true as const }))
    window.history.pushState(null, '', '/hr-app?open=hire:HR-205')
    render(<HrApp data={{ ...data, hires: [hire], parts: { ...data.parts, hiring: true }, may: { ...data.may, hireEdit: true } }} actions={{ ...actions, candStage: stage }} />)
    expect(screen.getByText('Daniel Lee')).toBeInTheDocument()
    expect(screen.queryByText('Nur Iman')).toBeNull()
    fireEvent.click(screen.getByText('Daniel Lee'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Not selected/ }))
    expect(stage).not.toHaveBeenCalled()
    expect(screen.getByText('Not selected · Daniel Lee')).toBeInTheDocument()
    const why = ['Failed interview', 'Not shortlisted', 'Not right now', 'Declined offer', 'Other']
    expect(screen.getAllByRole('button').map(b => b.textContent).filter(t => why.includes(t ?? ''))).toEqual(why)
    fireEvent.click(screen.getByRole('button', { name: 'Not right now' }))
    await waitFor(() => expect(stage).toHaveBeenCalledWith('HR-205', 'c1', 'rejected', 'not_right_now'))
  })

  // HR's list (2026-10-24, "do with same" as File types): the sheet offers the ones that are on, in HR's words.
  it('Not selected asks why from HR’s list — renamed, turned off and added as Form settings left it', async () => {
    const stage = vi.fn(async () => ({ ok: true as const }))
    const hireReasons = [
      { id: 'not_shortlisted', name: 'Not shortlisted', active: true, used: 0 },
      { id: 'failed_interview', name: 'Interview failed', active: true, used: 2 },
      { id: 'not_right_now', name: 'Not right now', active: false, used: 4 },
      { id: 'r-salary', name: 'Salary too high', active: true, used: 0 },
    ]
    window.history.pushState(null, '', '/hr-app?open=hire:HR-205')
    render(<HrApp data={{ ...data, hires: [hire], hireReasons, parts: { ...data.parts, hiring: true }, may: { ...data.may, hireEdit: true } }} actions={{ ...actions, candStage: stage }} />)
    fireEvent.click(screen.getByText('Daniel Lee'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Not selected/ }))
    const offered = ['Interview failed', 'Not shortlisted', 'Salary too high']
    const words = screen.getAllByRole('button').map(b => b.textContent ?? '')
    expect(words.filter(t => [...offered, 'Not right now', 'Failed interview'].includes(t))).toEqual(offered)
    fireEvent.click(screen.getByRole('button', { name: 'Salary too high' }))
    await waitFor(() => expect(stage).toHaveBeenCalledWith('HR-205', 'c1', 'rejected', 'r-salary'))
  })

  it('everybody not selected: the card is their fold alone', () => {
    window.history.pushState(null, '', '/hr-app?open=hire:HR-205')
    render(<HrApp data={{ ...data, hires: [{ ...hire, candidates: hire.candidates.slice(1) }], parts: { ...data.parts, hiring: true } }} actions={actions} />)
    expect(screen.getByRole('button', { name: 'Not selected · 1 · in Talent Bank' })).toBeInTheDocument()
    expect(screen.queryByText('No candidates yet.')).toBeNull()
  })

  // The user, asked whether the phone should bring somebody back as the desktop's fold does: "can" (2026-10-24).
  const kept = { ...hire, candidates: [hire.candidates[0], { ...hire.candidates[1], phone: '012-111 2222', note: 'Asked for RM 4,000', why: 'Not right now' }] }

  it('the not selected fold at the card’s foot: each says why; a tap opens the status sheet that brings them back', async () => {
    const stage = vi.fn(async () => ({ ok: true as const }))
    window.history.pushState(null, '', '/hr-app?open=hire:HR-205')
    render(<HrApp data={{ ...data, hires: [kept], parts: { ...data.parts, hiring: true }, may: { ...data.may, hireEdit: true } }} actions={{ ...actions, candStage: stage }} />)
    const fold = screen.getByRole('button', { name: 'Not selected · 1 · in Talent Bank' })
    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Nur Iman')).toBeNull()
    fireEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Nur Iman')).toBeInTheDocument()
    expect(screen.getByText('Not right now')).toBeInTheDocument()
    // Why in place of the note, as on the request's page.
    expect(screen.queryByText(/Asked for RM 4,000/)).toBeNull()
    fireEvent.click(screen.getByText('Nur Iman'))
    const sheet = screen.getByRole('dialog', { name: 'Status · Nur Iman' })
    expect(within(sheet).getByRole('button', { name: /^Not selected/ })).toHaveTextContent('✓')
    fireEvent.click(within(sheet).getByRole('button', { name: /^Shortlisted/ }))
    await waitFor(() => expect(stage).toHaveBeenCalledWith('HR-205', 'c2', 'shortlisted'))
  })

  it('without Hiring · Edit the fold still says who and why, and a tap changes nothing', () => {
    window.history.pushState(null, '', '/hr-app?open=hire:HR-205')
    render(<HrApp data={{ ...data, hires: [kept], parts: { ...data.parts, hiring: true } }} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not selected · 1 · in Talent Bank' }))
    expect(screen.getByText('Not right now')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Nur Iman'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('memos (2026-10-12)', () => {
  const memo = {
    id: 'm1', title: 'House rules', body: 'Read them.\n\nThey start Monday.', sender: 'People & Culture', kind: 'Memo',
    publishedAt: '2026-10-12T09:44:13Z', version: 1, requiresAck: true, attachment: { name: 'Rules.pdf', type: 'application/pdf' }, readAt: null, acknowledgedAt: null,
  }
  const marks = () => {
    const mark = vi.fn(async (_id: string, ack: boolean, _signature?: string | null) => ({ ok: true as const, acknowledgedAt: ack ? '2026-10-12T10:01:00Z' : null }))
    const memoSignature = vi.fn(async () => PNG)
    return { mark, memoSignature, acts: { ...actions, memoMark: mark, memoSignature, memoFile: vi.fn(async () => ({ ok: false as const, reason: 'Withdrawn.' })) } }
  }

  it('Home heads with one to acknowledge; opening reads it; Acknowledge waits for a signature and records it once', async () => {
    padPicture()
    const { mark, acts } = marks()
    render(<HrApp data={{ ...data, memos: [memo], personalLogin: true }} actions={acts} />)
    expect(screen.getByText('Waiting for you')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /House rules/ }))
    expect(screen.getByRole('heading', { name: 'House rules' })).toBeInTheDocument()
    expect(screen.getByText('They start Monday.')).toBeInTheDocument()
    await waitFor(() => expect(mark).toHaveBeenCalledWith('m1', false))
    // 2026-10-20 — the user: "签完之后再来点那个 Acknowledge button".
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeDisabled()
    sign(screen.getByLabelText('Sign here'))
    expect(screen.getByText('Your signature, name and time are recorded for HR.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(mark).toHaveBeenCalledWith('m1', true, PNG))
    expect(await screen.findByText(/You acknowledged this ·/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Your signature' })).toHaveAttribute('src', PNG)
    expect(screen.queryByLabelText('Sign here')).toBeNull()
    vi.restoreAllMocks()
  })

  it('one acknowledged before shows the signature it was given, read back once; viewing as somebody, none', async () => {
    const { memoSignature, acts } = marks()
    const done = { ...memo, readAt: '2026-10-12T10:00:00Z', acknowledgedAt: '2026-10-12T10:01:00Z' }
    window.history.pushState(null, '', '/hr-app?open=memo:m1')
    const { unmount } = render(<HrApp data={{ ...data, memos: [done], personalLogin: true }} actions={acts} />)
    expect(await screen.findByRole('img', { name: 'Your signature' })).toHaveAttribute('src', PNG)
    expect(memoSignature).toHaveBeenCalledWith('m1')
    expect(screen.queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    unmount()
    memoSignature.mockClear()
    window.history.pushState(null, '', '/hr-app?open=memo:m1')
    render(<HrApp data={{ ...data, memos: [memo], personalLogin: true, viewingAs: 'KRIS' }} actions={acts} />)
    expect(screen.queryByLabelText('Sign here')).toBeNull()
    expect(memoSignature).not.toHaveBeenCalled()
  })

  it('a tapped push opens it (?open=memo:…); one taken back since opens the list', () => {
    const { acts } = marks()
    window.history.pushState(null, '', '/hr-app?open=memo:m1')
    const { unmount } = render(<HrApp data={{ ...data, memos: [memo], personalLogin: true }} actions={acts} />)
    expect(screen.getByRole('heading', { name: 'House rules' })).toBeInTheDocument()
    unmount()
    window.history.pushState(null, '', '/hr-app?open=memo:gone')
    render(<HrApp data={{ ...data, memos: [memo], personalLogin: true }} actions={acts} />)
    expect(screen.getByRole('heading', { name: 'Memos' })).toBeInTheDocument()
  })
})

// The avatar opens Me (2026-10-17 — the user: "a top-right avatar on the header opens Me"); the old More's rows sit in
// Me › Profile — Memos, My documents, Phone notifications, Change password, Request to change email, Switch view.
describe('the avatar: Me, with the old More’s rows', () => {
  const openMe = (over: Partial<HrAppData>, acts: Partial<HrAppActions> = {}) => {
    render(<HrApp data={{ ...data, personalLogin: true, ...over }} actions={{ ...actions, ...acts }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Me' }))
    return screen.getByTestId('me')
  }

  it('opens Me over the app (back to HR) for a login of their own; a shared login gets its Account sheet', () => {
    const me = openMe({ views: { current: 'hr' } })
    expect(me).toHaveAttribute('data-back', 'HR')
    expect(within(me).getByText('Memos')).toBeInTheDocument()
    expect(within(me).getByText('Change password')).toBeInTheDocument()
    const views = within(me).getByRole('group', { name: 'Switch view' })
    fireEvent.click(within(views).getByText('Revenue team'))
    expect(actions.switchView).toHaveBeenCalledWith('revenue_member')
    cleanup()
    render(<HrApp data={{ ...data, personalLogin: false, views: { current: 'hr' } }} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByText('Change password')).toBeNull()
  })

  it('Change password: asks the current one, then the new one twice; says what is wrong before sending; done, Done closes it', async () => {
    const change = vi.fn(async () => ({ ok: true as const }))
    const me = openMe({}, { changePassword: change })
    fireEvent.click(within(me).getByText('Change password'))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument())
    const sheet = screen.getByRole('dialog', { name: 'Change password' })
    const fill = (a: string, b: string, c: string) => {
      fireEvent.change(within(sheet).getByLabelText('Current password'), { target: { value: a } })
      fireEvent.change(within(sheet).getByLabelText(/^New password/), { target: { value: b } })
      fireEvent.change(within(sheet).getByLabelText('Confirm new password'), { target: { value: c } })
    }
    fill('old-pass', 'new-pass-1', 'new-pass-2')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Change password' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('The two new passwords do not match.')
    expect(change).not.toHaveBeenCalled()
    fill('old-pass', 'new-pass-1', 'new-pass-1')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(screen.getByText(/Password changed\./)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Change password' })).toBeNull()
  })
})

describe('IT support stays in the HR app', () => {
  it('opens from Me’s Profile and returns to HR without loading Revenue', async () => {
    window.history.pushState(null, '', '/hr-app')
    render(<HrApp data={{ ...data, personalLogin: true }} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Me' }))
    fireEvent.click(within(screen.getByTestId('me')).getByText('IT support'))
    expect(await screen.findByTestId('it-support')).toHaveAttribute('data-app', 'hr')
    expect(screen.getByRole('heading', { name: 'IT support' })).toBeInTheDocument()
    expect(screen.queryByTestId('me')).toBeNull()
    expect(window.location.pathname).toBe('/hr-app')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByTestId('it-support')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'HR app' })).toBeInTheDocument()
  })

  it('a shared login can open IT support from Account without a People profile', () => {
    render(<HrApp data={{ ...data, personalLogin: false, meId: null }} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Account' })).getByRole('button', { name: 'IT support' }))
    expect(screen.getByTestId('it-support')).toHaveAttribute('data-app', 'hr')
    expect(screen.queryByRole('dialog', { name: 'Account' })).toBeNull()
    expect(screen.queryByTestId('me')).toBeNull()
  })

  it('a bell notice opens the request in HR’s own IT page', () => {
    window.history.pushState(null, '', '/hr-app')
    const notices = {
      unread: 1,
      items: [{ id: 'n-it', kind: 'it' as const, title: 'IT-0001 · Fixed', body: 'Upload issue',
        refKind: 'it_request' as const, refId: 'it-1', at: '2026-10-20T15:00:00Z', read: false }],
    }
    render(<HrApp data={{ ...data, notices }} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 1 new' }))
    fireEvent.click(screen.getByText('IT-0001 · Fixed'))
    expect(screen.getByTestId('it-support')).toHaveAttribute('data-request', 'it-1')
    expect(window.location.pathname).toBe('/hr-app')
  })

  // 2026-10-27 — the user's phone: the list ran from one edge of the screen to the other, and its table came out
  // dark in the phone's dark mode (the portal's own tokens turn dark there; the sheet's never do).
  it('stands in a sub screen’s gutter, on the sheet’s palette', () => {
    window.history.pushState(null, '', '/hr-app?open=it:it-1')
    render(<HrApp data={data} actions={actions} />)
    const frame = screen.getByTestId('it-support').parentElement!
    expect(frame).toHaveClass('sheet-theme')
    expect(frame.className).toMatch(/sub/)
  })

  it('a tapped IT push opens its request and consumes the address', () => {
    window.history.pushState(null, '', '/hr-app?open=it:it-1')
    render(<HrApp data={data} actions={actions} />)
    expect(screen.getByTestId('it-support')).toHaveAttribute('data-request', 'it-1')
    expect(window.location.pathname).toBe('/hr-app')
    expect(window.location.search).toBe('')
  })

  it('View as hides the entrance and does not mount private IT reads from a push URL', () => {
    window.history.pushState(null, '', '/hr-app?open=it:it-1')
    render(<HrApp data={{ ...data, personalLogin: true, viewingAs: 'Nurul Huda' }} actions={actions} />)
    expect(screen.queryByText('IT support')).toBeNull()
    expect(screen.queryByTestId('it-support')).toBeNull()
    expect(itSupport.render).not.toHaveBeenCalled()
    expect(screen.getByRole('navigation', { name: 'HR app' })).toBeInTheDocument()
  })
})

describe('the bar while reading on (2026-10-11)', () => {
  it('steps out of the way on a scroll down, is back on a scroll up or another tab, and the page opens at its top', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(70)
    render(<HrApp data={data} actions={actions} />)
    const bar = nav()
    const page = bar.parentElement!.querySelector('[class*="scroller"]') as HTMLElement
    let top = 0
    Object.defineProperty(page, 'clientHeight', { configurable: true, get: () => 600 })
    Object.defineProperty(page, 'scrollHeight', { configurable: true, get: () => 2000 })
    Object.defineProperty(page, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v } })
    const at = (y: number) => { top = y; act(() => { page.dispatchEvent(new Event('scroll')) }) }
    at(0)
    at(200)
    expect(bar).toHaveAttribute('data-tucked')
    at(150)
    expect(bar).not.toHaveAttribute('data-tucked')
    at(400)
    expect(bar).toHaveAttribute('data-tucked')
    fireEvent.click(within(bar).getByRole('button', { name: /^Today/, hidden: true }))
    expect(bar).not.toHaveAttribute('data-tucked')
    expect(top).toBe(0)
    vi.restoreAllMocks()
  })
})
