import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The browser's own reads and the session's: drawn here without them.
const reads = vi.hoisted(() => ({ task: vi.fn(async () => null), lists: vi.fn(async () => ({})), visit: vi.fn(async () => null) }))
vi.mock('@/lib/mkt-app/read', () => ({ readTaskNow: reads.task, readOptionListsNow: reads.lists, readVisitNow: reads.visit }))
vi.mock('@/components/mkt/myspace/chat-read', () => ({ readChatThread: vi.fn(async () => null), readChatListNow: vi.fn(async () => null) }))
vi.mock('@/lib/payment-requests/upload', () => ({ uploadRequestFile: vi.fn(), removeRequestUpload: vi.fn() }))
vi.mock('@/components/pwa/PortalPushAsk', () => ({ default: () => null }))
vi.mock('@/components/layout/view-as-actions', () => ({ stopViewingAsPerson: vi.fn() }))
// Me (components/me) reads from the browser: drawn here as its layer only.
vi.mock('@/components/me/useMe', () => ({ useMe: () => ({ s: { today: null, todayAt: 0 } }), useClock: () => 0 }))
vi.mock('@/components/me/MeOverlay', () => ({
  MeOverlay: ({ open, startPunch }: { open: boolean; startPunch?: string | null }) => (open ? <div data-testid="me" data-punch={startPunch ?? ''} /> : null),
}))

import { boardFromRow } from '@/lib/marketing/board'
import { calendarEvents } from '@/lib/marketing/calendar'
import { chatListFromRow } from '@/lib/marketing/chat'
import { plateColumns, plateOf, weekRows } from '@/lib/marketing/my-space'
import { projectRows } from '@/lib/marketing/projects'
import { spaceFromRow } from '@/lib/marketing/space'
import type { MktAppData } from '@/lib/mkt-app/model'
import type { PaymentRequest, RequestContext } from '@/lib/payment-requests/model'
import MktApp, { type MktAppActions } from './MktApp'

// The Marketing app (2026-11-28 — `Marketing App iOS + Android.dc.html`): five tabs, the task page pushed over them,
// More's tiles and settings, Claim and Claim & approve on the Claim page's own rules.

const MEI = '00000000-0000-0000-0000-00000000000a'
const RACHEL = '00000000-0000-0000-0000-00000000000b'
const CAR = '10000000-0000-0000-0000-000000000001'
const team = [
  { id: MEI, full: 'Mei Ling', first: 'Mei', team: 'content' },
  { id: RACHEL, full: 'Rachel Tan', first: 'Rachel', team: 'manager' },
]
const subs = [{ id: CAR, code: 'CAR', name: 'Carres', dot: 'oklch(0.70 0.12 235)', emoji: '🛋️' }]
const P1 = '20000000-0000-0000-0000-000000000001'
const board = boardFromRow({
  today: '2026-11-26', me: MEI, team, subs,
  projects: [{ id: P1, trackId: 'TSK-CAR-2611-001', kind: 'quick', sub: CAR, title: 'Price update', status: 'active', cur: 0 }],
  stages: [{ project: P1, idx: 0, name: 'Design', dept: 'content', status: 'accepted', owner: MEI, appr: [], apprIdx: 0, dueOn: '2026-11-27' }],
  subtasks: [],
})
const NOW = new Date('2026-11-26T04:00:00Z')
const columns = plateColumns(board, board.me, NOW)

const data = (over: Partial<MktAppData> = {}): MktAppData => ({
  today: '2026-11-26',
  me: { staff: MEI, first: 'Mei', full: 'Mei Ling', role: 'Content Executive', letter: 'M', avatarBg: 'rgb(var(--mk-app))' },
  viewingAs: null,
  personalLogin: true,
  views: null,
  parts: { projects: true, calendar: true, claims: true, claimsApprove: false, library: true, rooms: true, manager: false },
  may: { create: true, edit: true, decide: true, manage: false, space: true },
  columns,
  week: weekRows(columns, board.today),
  rows: projectRows(board),
  subs: board.subs,
  events: calendarEvents(board),
  notices: [],
  space: spaceFromRow({}),
  pet: null,
  hasPet: true,
  plate: plateOf(columns),
  lobby: [],
  chat: chatListFromRow({ me: MEI, lobby: { last: null, unread: false }, dms: [] }),
  chatTasks: [],
  claims: { mine: [], approval: null, canCreate: true, error: null },
  counts: { tracking: 0, claims: 0 },
  ...over,
})

const request = (over: Partial<PaymentRequest>): PaymentRequest => ({
  id: 'r1', requestNo: 'PRQ-2611-0001', status: 'pending_approval', kind: 'claim', mine: false, requesterName: 'AINA YUSOF', departmentId: 'mkt', departmentName: 'Marketing',
  pool: 'dept_pool_marketing', billingMode: null, payToSalary: true, payeeName: 'AINA YUSOF', payeeStaffId: 's-aina', payeeBank: 'Maybank', payeeAccount: '•••• 4821',
  description: 'Props for the shoot', total: 120, submittedAt: '2026-11-25T02:00:00Z', createdAt: '2026-11-25T02:00:00Z', updatedAt: '2026-11-25T02:00:00Z',
  rejectedStage: null, rejectedAt: null, rejectReason: null, rejectedByName: null, needsApproval: true, approvedAt: null, approvedByName: null, reviewers: ['Mei Ling'],
  pvId: null, pvNo: null, pvStatus: null, items: [{ id: 'i1', description: 'Props for the shoot', amount: 120 }], shares: [], files: [], ...over,
})
const context: RequestContext = {
  name: 'MEI LING', staffId: MEI, people: [{ id: MEI, name: 'MEI LING', department: 'Marketing', hasSalary: true }], departmentId: 'mkt', departmentName: 'Marketing',
  pool: 'dept_pool_marketing', salaryAccount: { bank: 'Hong Leong Bank', last4: '4821' }, departments: [{ id: 'hr', name: 'HR', venture: false }], companies: [], reviewers: null,
}

const done = vi.fn(async () => ({ ok: true as const }))
const actions = (): MktAppActions => ({
  saveWork: vi.fn(async () => ({ ok: true as const, missing: [] })),
  submit: vi.fn(async () => ({ ok: true as const, page: null })),
  decide: vi.fn(async () => ({ ok: true as const, page: null })),
  review: vi.fn(async () => ({ ok: true as const, page: null })),
  nudge: vi.fn(async () => ({ ok: true as const, who: 'Rachel', already: false })),
  refresh: vi.fn(),
  createTask: vi.fn(async () => ({ ok: true as const, id: 'p2', track: 'TSK-CAR-2611-002', open: 'TSK-CAR-2611-002' })),
  saveSpace: vi.fn(async () => ({ ok: true as const, space: spaceFromRow({}) })),
  care: vi.fn(async () => ({ ok: false as const, reason: 'no pet' })),
  send: vi.fn(async () => ({ ok: false as const, reason: 'not here' })),
  read: done,
  noticesRead: done,
  switchView: vi.fn(),
  changePassword: vi.fn(async () => ({ ok: true as const })),
  signOut: vi.fn(async () => undefined),
  claims: {
    openNew: vi.fn(async () => ({ ok: true as const, data: context })),
    save: vi.fn(async () => ({ ok: false as const, reason: 'not saved' })),
    cancel: vi.fn(async () => ({ ok: false as const, reason: 'no' })),
    approve: vi.fn(async (ids: string[]) => ({ ok: true as const, data: { approved: ids.length } })),
    sendBack: vi.fn(async (ids: string[]) => ({ ok: true as const, data: { sentBack: ids.length } })),
    openFile: vi.fn(async () => ({ ok: false as const, reason: 'gone' })),
  },
})

const tabBar = () => screen.getByRole('navigation', { name: 'Marketing' })
// Each tab's icon and label, its badge's count left out.
const tabs = () => within(tabBar()).getAllByRole('button').map(b => b.textContent?.replace(/\d+/g, '').trim())

afterEach(async () => {
  cleanup()
  // The steps the app held are taken back a moment after it goes (useBackStep): let those Backs land here, not in the
  // next test's history.
  await new Promise(r => setTimeout(r, 30))
  vi.clearAllMocks()
})

describe('the Marketing app', () => {
  it('opens on Tasks — My turn and its card, This week — over the tab bar', () => {
    render(<MktApp data={data()} actions={actions()} platform="android" />)
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
    expect(tabs()).toEqual(['👉Tasks', '📁Projects', '+New', '🏠Space', '☰More'])
    // The Tasks tab's badge is My turn's count.
    expect(within(tabBar()).getByRole('button', { name: /Tasks/ }).textContent).toContain('1')
    expect(screen.getAllByText('Price update').length).toBeGreaterThan(0)
    expect(screen.getByText('🗓️ This week')).toBeTruthy()
  })

  it('hides ＋ without Marketing · Create — Marketing · Staff ticks View and Edit only', () => {
    render(<MktApp data={data({ may: { create: false, edit: true, decide: true, manage: false, space: true } })} actions={actions()} platform="ios" />)
    expect(tabs()).toEqual(['👉Tasks', '📁Projects', '🏠Space', '☰More'])
  })

  it('a card opens its task page, read from the browser on the tap', async () => {
    render(<MktApp data={data()} actions={actions()} platform="android" />)
    fireEvent.click(screen.getAllByText('Price update')[0].closest('button')!)
    await waitFor(() => expect(reads.task).toHaveBeenCalledWith('TSK-CAR-2611-001'))
  })

  it('More: the tiles each part opens, Manager tools for a manager only, Sign out always', () => {
    const { unmount } = render(<MktApp data={data()} actions={actions()} platform="android" />)
    fireEvent.click(within(tabBar()).getByRole('button', { name: /More/ }))
    expect(screen.getByText('Calendar')).toBeTruthy()
    expect(screen.getByText('Claim')).toBeTruthy()
    expect(screen.getByText('Library')).toBeTruthy()
    expect(screen.getByText('Meeting Rooms')).toBeTruthy()
    expect(screen.queryByText('Manager tools')).toBeNull()
    expect(screen.queryByText('Change view')).toBeNull()
    expect(screen.getByText('Change password')).toBeTruthy()
    expect(screen.getByText('Sign out')).toBeTruthy()
    unmount()

    render(<MktApp data={data({
      parts: { projects: true, calendar: true, claims: false, claimsApprove: false, library: false, rooms: true, manager: true },
      views: { current: 'marketing' }, personalLogin: false, counts: { tracking: 3, claims: 0 },
    })} actions={actions()} platform="android" />)
    fireEvent.click(within(tabBar()).getByRole('button', { name: /More/ }))
    // A shared login: no Claim, no Change password; the view switch for an account that may switch.
    expect(screen.queryByText('Claim')).toBeNull()
    expect(screen.queryByText('Library')).toBeNull()
    expect(screen.queryByText('Change password')).toBeNull()
    expect(screen.getByText('Change view')).toBeTruthy()
    expect(screen.getByText('Manager tools')).toBeTruthy()
    expect(screen.getByText('Tracking Dashboard').closest('button')?.textContent).toContain('3')
  })

  it('Claim: one’s own requests; New request picks nothing until it is picked', async () => {
    const a = actions()
    render(<MktApp data={data()} actions={a} platform="android" />)
    fireEvent.click(within(tabBar()).getByRole('button', { name: /More/ }))
    fireEvent.click(screen.getByText('Claim').closest('button')!)
    expect(screen.getByText('Waiting to be paid · 0 requests')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ New request' }))
    // Save and Submit wait for the window's context (who may approve, the salary account HR holds).
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' }).hasAttribute('disabled')).toBe(false))
    expect(a.claims.openNew).toHaveBeenCalledTimes(1)
    const kinds = screen.getByRole('radiogroup', { name: 'What is it?' })
    expect(within(kinds).getAllByRole('radio').map(r => r.getAttribute('aria-checked'))).toEqual(['false', 'false'])
    // Submit with nothing picked: the Claim page's own words, and nothing is sent.
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.getByRole('alert').textContent).toBe('Pick what it is first.')
    expect(a.claims.save).not.toHaveBeenCalled()
    // A claim: the salary account HR holds, Another account — and who bears it, none chosen.
    fireEvent.click(within(kinds).getAllByRole('radio')[0])
    expect(screen.getByRole('radio', { name: 'My salary account · Hong Leong Bank •••• 4821' }).getAttribute('aria-checked')).toBe('false')
    expect(within(screen.getByRole('radiogroup', { name: 'Who bears it?' })).getAllByRole('radio').map(r => r.getAttribute('aria-checked'))).toEqual(['false', 'false'])
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(screen.getByRole('alert').textContent).toBe('Add where to pay you, each item’s words and amount, the receipts or invoices and who bears it.')
  })

  it('Claim & approve: the ticked go to Finance together', async () => {
    const a = actions()
    const waiting = [request({}), request({ id: 'r2', requestNo: 'PRQ-2611-0002', total: 80, description: 'Taxi' })]
    render(<MktApp data={data({
      parts: { projects: true, calendar: true, claims: true, claimsApprove: true, library: true, rooms: true, manager: false },
      claims: { mine: [], approval: { departmentName: 'Marketing', canApprove: true, approvers: [{ id: MEI, name: 'Mei Ling' }], requests: waiting }, canCreate: true, error: null },
    })} actions={a} platform="android" />)
    fireEvent.click(within(tabBar()).getByRole('button', { name: /More/ }))
    // The tile's count: what waits for this approver.
    expect(screen.getByText('Claim & approve').closest('button')?.textContent).toContain('2')
    fireEvent.click(screen.getByText('Claim & approve').closest('button')!)
    expect(screen.getByText('Waiting for you · 2 requests')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Tick Props for the shoot' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tick Taxi' }))
    expect(screen.getByText('2 selected · RM 200.00')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve' })) })
    expect(a.claims.approve).toHaveBeenCalledWith(['r1', 'r2'])
    expect(a.refresh).toHaveBeenCalled()
    expect(screen.getByText('Nothing waits for your approval.')).toBeTruthy()
  })

  // 2026-11-28, found writing these: More's tab held a Back step only while nothing was pushed, so a tile's screen pushed
  // its step as the tab's went — and the tab's, taken back a moment later, took the new one: Claim opened and its form
  // shut by itself. Each layer's step now stays under whatever opens over it.
  it('a layer opened over another stays open, and the phone’s Back takes the top one only', async () => {
    const tick = () => act(async () => { await new Promise(r => setTimeout(r, 30)) })
    const pushed = () => document.querySelector('[role="dialog"][data-open="true"]')?.textContent ?? ''
    render(<MktApp data={data()} actions={actions()} platform="android" />)
    fireEvent.click(within(tabBar()).getByRole('button', { name: /More/ }))
    await tick()
    fireEvent.click(screen.getByText('Claim').closest('button')!)
    await tick()
    fireEvent.click(screen.getByRole('button', { name: '+ New request' }))
    await tick()
    expect(pushed()).toContain('New request')
    await act(async () => { window.history.back() })
    await tick()
    expect(pushed()).toContain('Waiting to be paid')
    await act(async () => { window.history.back() })
    await tick()
    expect(pushed()).toBe('')
    expect(screen.getByRole('heading', { name: 'More' })).toBeTruthy()
    await act(async () => { window.history.back() })
    await tick()
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
  })

  it('viewing as a person: their screen, read only — no ＋', () => {
    render(<MktApp data={data({ viewingAs: 'Mei Ling', personalLogin: false, may: { create: false, edit: false, decide: false, manage: false, space: false } })} actions={actions()} platform="android" />)
    expect(tabs()).toEqual(['👉Tasks', '📁Projects', '🏠Space', '☰More'])
  })
})
