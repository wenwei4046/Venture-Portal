import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { AttConfig, AttLedger, AttMonth, AttRequest, AttStep } from '@/lib/attendance/types'
import type { HrAppData } from '@/lib/hr-app/model'

vi.mock('@/components/layout/view-as-actions', () => ({ stopViewingAsPerson: vi.fn() }))
// Me (components/me) reads from the browser: drawn here as its layer only, with the rows the app hands it.
vi.mock('@/components/me/useMe', () => ({ useMe: () => ({ s: { today: null, todayAt: 0 } }), useClock: () => 0 }))
vi.mock('@/components/me/MeOverlay', () => ({
  MeOverlay: ({ open, accountRows, backLabel }: { open: boolean; accountRows?: ReactNode; backLabel: string }) => (open ? <div data-testid="me" data-back={backLabel}>{accountRows}</div> : null),
}))

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
})

describe('memos (2026-10-12)', () => {
  const memo = {
    id: 'm1', title: 'House rules', body: 'Read them.\n\nThey start Monday.', sender: 'People & Culture', kind: 'Memo',
    publishedAt: '2026-10-12T09:44:13Z', version: 1, requiresAck: true, attachment: { name: 'Rules.pdf', type: 'application/pdf' }, readAt: null, acknowledgedAt: null,
  }
  const marks = () => {
    const mark = vi.fn(async (_id: string, ack: boolean) => ({ ok: true as const, acknowledgedAt: ack ? '2026-10-12T10:01:00Z' : null }))
    return { mark, acts: { ...actions, memoMark: mark, memoFile: vi.fn(async () => ({ ok: false as const, reason: 'Withdrawn.' })) } }
  }

  it('Home heads with one to acknowledge; opening reads it; Acknowledge records it once', async () => {
    const { mark, acts } = marks()
    render(<HrApp data={{ ...data, memos: [memo], personalLogin: true }} actions={acts} />)
    expect(screen.getByText('Waiting for you')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /House rules/ }))
    expect(screen.getByRole('heading', { name: 'House rules' })).toBeInTheDocument()
    expect(screen.getByText('They start Monday.')).toBeInTheDocument()
    await waitFor(() => expect(mark).toHaveBeenCalledWith('m1', false))
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(mark).toHaveBeenCalledWith('m1', true))
    expect(await screen.findByText(/You acknowledged this ·/)).toBeInTheDocument()
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
