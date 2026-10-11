import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HrAppData } from '@/lib/hr-app/model'
vi.mock('@/components/layout/view-as-actions', () => ({ stopViewingAsPerson: vi.fn() }))

import HrApp, { type HrAppActions } from './HrApp'

// The HR phone app's sheets (2026-10-11): a field in a sheet keeps its place
// while it is typed in. Its label was a component made afresh inside the
// sheet on every render, so React swapped the input for a new one after each
// key — "Interview" left "I", the people search kept "N" (the phone audit).

const data: HrAppData = {
  greetName: 'Grace',
  meId: 's1',
  viewingAs: null,
  today: '2026-10-11',
  staff: [
    { id: 's1', name: 'Grace Lim', title: 'HR Manager', dept: 'HR' },
    { id: 's2', name: 'Nurul Huda', title: 'HR Executive', dept: 'HR' },
  ],
  owners: [],
  hires: [],
  requests: [],
  rooms: [{ id: 'r1', name: 'Meeting Room 1', seats: 8 }],
  bookings: [],
  sources: [],
  talents: [],
  docTypes: [],
  letters: [],
  bookDepts: [{ id: 'd1', name: 'HR' }],
  parts: { requests: false, hiring: false, insights: false, talent: false, docs: false, rooms: true },
  may: { decide: false, hireApprove: false, hireEdit: false, hireCreate: false, talentEdit: false, book: true },
  notices: { unread: 0, items: [] },
}

const done = vi.fn(async () => ({ ok: true as const }))
const actions = {
  hireAck: done, hireInfo: done, hireDecline: done, hireCancel: done, hireFill: done, candStage: done, candAdd: done,
  requestDecide: done, book: done, bookCancel: done, talentNotes: done, talentRemove: done,
  letterLink: vi.fn(async () => ({ ok: false as const, reason: 'none' })),
  noticesRead: done, pushSave: done, pushRemove: done, pushTrouble: vi.fn(),
  switchView: vi.fn(),
  refresh: vi.fn(),
} as unknown as HrAppActions

afterEach(cleanup)

function openBook() {
  render(<HrApp data={data} actions={actions} />)
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Rooms' }))
  fireEvent.click(screen.getByRole('button', { name: '+ Book' }))
}

describe('the HR app’s Book sheet', () => {
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
    expect(document.activeElement).toBe(search)
    expect(screen.getByRole('button', { name: '+ Nurul Huda' })).toBeInTheDocument()
  })

  it('keeps a select the same field when it changes', () => {
    openBook()
    const room = screen.getByRole('combobox', { name: 'Room' })
    fireEvent.change(room, { target: { value: 'r1' } })
    expect(screen.getByRole('combobox', { name: 'Room' })).toBe(room)
    expect(room).toHaveValue('r1')
  })
})

describe('the HR app viewed as somebody', () => {
  it('says whose app it is and that nothing is saved', () => {
    render(<HrApp data={{ ...data, viewingAs: 'Nurul Huda', greetName: 'Nurul' }} actions={actions} />)
    expect(screen.getByRole('status')).toHaveTextContent('Viewing as Nurul Huda — their pages, menus and buttons. Read-only: nothing you press is saved.')
    expect(screen.getByRole('button', { name: 'Stop viewing' })).toBeInTheDocument()
  })

  it('shows no strip in your own app', () => {
    render(<HrApp data={data} actions={actions} />)
    expect(screen.queryByText(/Viewing as/)).toBeNull()
  })
})

describe('the HR app approving a claim', () => {
  // The user, 2026-10-11: the phone asks where the money goes, as Member services does on the desktop.
  const claim = { id: 'q1', code: 'RQ-2610-004', kind: 'claim' as const, status: 'submitted', sub: 'Fair', byName: 'Kar Jun', category: 'Travel', location: 'Penang', amount: '120.00' }
  const withClaim: HrAppData = { ...data, requests: [claim], parts: { ...data.parts, requests: true }, may: { ...data.may, decide: true } }

  function openClaim() {
    const decide = vi.fn(async () => ({ ok: true as const }))
    render(<HrApp data={withClaim} actions={{ ...actions, requestDecide: decide }} />)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: /Review/ }))
    fireEvent.click(screen.getByText('Kar Jun', { exact: false }))
    fireEvent.change(screen.getByPlaceholderText('Note (optional)'), { target: { value: 'Receipts checked' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    return decide
  }

  it('asks payroll or payment, and sends the one pressed with the note', () => {
    const decide = openClaim()
    expect(screen.getByText('Approve claim')).toBeInTheDocument()
    expect(decide).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Request payment' }))
    expect(decide).toHaveBeenCalledWith('q1', 'approve', 'Receipts checked', 'payment')
  })

  it('adds it to the payroll', () => {
    const decide = openClaim()
    fireEvent.click(screen.getByRole('button', { name: 'Add to payroll' }))
    expect(decide).toHaveBeenCalledWith('q1', 'approve', 'Receipts checked', 'payroll')
  })
})

describe('the HR app’s bell (2026-10-11)', () => {
  const notices = {
    unread: 2,
    items: [
      { id: 'n3', kind: 'review' as const, title: 'New guest booking · HOUZS Interior', body: 'Showroom kickoff · Meeting Room 1', refKind: 'booking' as const, refId: 'b9', at: new Date().toISOString(), read: false },
      { id: 'n2', kind: 'review' as const, title: 'New claim · Kar Jun', body: 'Travel', refKind: 'member_request' as const, refId: 'gone', at: new Date().toISOString(), read: false },
      { id: 'n1', kind: 'rooms' as const, title: 'Grace Lim added you to a meeting', body: 'Interview', refKind: 'booking' as const, refId: 'b1', at: '2026-10-01T02:00:00Z', read: true },
    ],
  }

  it('counts what is new, opens the list, and marks them read', () => {
    const read = vi.fn(async () => ({ ok: true as const }))
    render(<HrApp data={{ ...data, notices }} actions={{ ...actions, noticesRead: read }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 2 new' }))
    expect(read).toHaveBeenCalledWith(null)
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Earlier')).toBeInTheDocument()
    expect(screen.getByText('New guest booking · HOUZS Interior')).toBeInTheDocument()
    expect(screen.getByText('Grace Lim added you to a meeting')).toBeInTheDocument()
  })

  it('opens what a notice is about — its tab, when it has left the lists', () => {
    render(<HrApp data={{ ...data, notices, parts: { ...data.parts, requests: true } }} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications, 2 new' }))
    fireEvent.click(screen.getByText('New claim · Kar Jun'))
    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
  })

  it('has no bell while viewing as somebody', () => {
    render(<HrApp data={{ ...data, notices, viewingAs: 'Nurul Huda' }} actions={actions} />)
    expect(screen.queryByRole('button', { name: /Notifications/ })).toBeNull()
  })

  it('opens a tapped push’s place once (?open=…), then forgets the address', () => {
    const hire = { id: 'HR-205', status: 'acknowledged', position: 'Revenue Specialist', headcount: 1, dept: 'Revenue · Fair', budget: '', start: '', ownerName: null,
      requester: 'Kar Jun', when: '9 Oct 2026', candidates: [], events: [] } as unknown as HrAppData['hires'][number]
    window.history.pushState(null, '', '/hr-app?open=hire:HR-205')
    render(<HrApp data={{ ...data, hires: [hire], parts: { ...data.parts, hiring: true } }} actions={actions} />)
    expect(screen.getByRole('heading', { name: 'Revenue Specialist' })).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('says when this browser cannot show phone notifications', async () => {
    render(<HrApp data={data} actions={actions} />)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'More' }))
    const row = await screen.findByRole('button', { name: /Phone notifications/ })
    await waitFor(() => expect(row).toHaveTextContent('This browser cannot show them'))
    expect(row).toBeDisabled()
  })
})

describe('the HR app with no meeting room yet', () => {
  it('greys out + Book: there is nothing to book', () => {
    render(<HrApp data={{ ...data, rooms: [] }} actions={actions} />)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Rooms' }))
    expect(screen.getByRole('button', { name: '+ Book' })).toBeDisabled()
  })
})

// One app (2026-10-11, lib/one-app.ts): the HR app is HR's view of it on a phone, and More moves an account that
// may switch views to the others — the portal's switcher, as the Revenue app's module menu has it.
describe('the HR app’s views', () => {
  function openMore(views: HrAppData['views']) {
    render(<HrApp data={{ ...data, views }} actions={actions} />)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'More' }))
  }

  it('lists every view for an account that may switch, this one marked as here', () => {
    openMore({ current: 'hr' })
    const views = screen.getByRole('region', { name: 'Switch view' })
    expect(within(views).getAllByRole('button').map(b => b.textContent)).toEqual([
      'PrincipalThe portal', 'FinanceThe portal', 'HRYou are here', 'Revenue teamThe Revenue app',
    ])
    expect(within(views).getByRole('button', { name: /HR/ })).toBeDisabled()
  })

  it('switches with the portal’s own action', () => {
    openMore({ current: 'hr' })
    fireEvent.click(within(screen.getByRole('region', { name: 'Switch view' })).getByRole('button', { name: /Revenue team/ }))
    expect(actions.switchView).toHaveBeenCalledWith('revenue_member')
  })

  it('is not there for anybody else', () => {
    openMore(null)
    expect(screen.queryByRole('region', { name: 'Switch view' })).toBeNull()
  })
})

// Change password (2026-10-12 — the user: "in their profile tab", "just for that personal acc"): More offers it to a
// login of their own — never hr@ or another shared one, never while viewing as somebody.
describe('the HR app’s Change password', () => {
  function openMore(over: Partial<HrAppData>, change = vi.fn(async () => ({ ok: true as const }))) {
    render(<HrApp data={{ ...data, ...over }} actions={{ ...actions, changePassword: change }} />)
    fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'More' }))
    return change
  }
  const fill = (current: string, next: string, confirm: string) => {
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: next } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
  }

  it('is in More for a personal login only', () => {
    openMore({ personalLogin: true })
    expect(screen.getByRole('button', { name: /Change password/ })).toBeInTheDocument()
    cleanup()
    openMore({})
    expect(screen.queryByRole('button', { name: /Change password/ })).toBeNull()
    cleanup()
    openMore({ personalLogin: true, viewingAs: 'Nurul Huda' })
    expect(screen.queryByRole('button', { name: /Change password/ })).toBeNull()
  })

  it('asks the current password, then the new one twice, and says what is wrong before sending', () => {
    const change = openMore({ personalLogin: true })
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }))
    const sheet = screen.getByRole('dialog', { name: 'Change password' })
    expect(within(sheet).getByLabelText('Current password')).toHaveAttribute('type', 'password')
    fill('old-pass', 'new-pass-1', 'new-pass-2')
    fireEvent.click(within(sheet).getByRole('button', { name: 'Change password' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('The two new passwords do not match.')
    expect(change).not.toHaveBeenCalled()
  })

  it('sends it, says it is done, and Done closes the sheet', async () => {
    const change = openMore({ personalLogin: true })
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }))
    fill('old-pass', 'new-pass-1', 'new-pass-1')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Change password' })).getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(screen.getByText(/Password changed\./)).toBeInTheDocument())
    expect(change).toHaveBeenCalledWith({ current: 'old-pass', next: 'new-pass-1', confirm: 'new-pass-1' })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Change password' })).toBeNull()
  })

  it('stays while it is being sent: Cancel and the scrim wait for the answer', async () => {
    let answer: (v: { ok: true }) => void = () => {}
    openMore({ personalLogin: true }, vi.fn(() => new Promise<{ ok: true }>(r => { answer = r })) as never)
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }))
    fill('old-pass', 'new-pass-1', 'new-pass-1')
    const sheet = screen.getByRole('dialog', { name: 'Change password' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Cancel' })).toBeDisabled())
    fireEvent.click(sheet.previousElementSibling as Element)
    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument()
    await act(async () => { answer({ ok: true }) })
    await waitFor(() => expect(screen.getByText(/Password changed\./)).toBeInTheDocument())
    // Answered, the scrim closes it again.
    fireEvent.click(screen.getByRole('dialog', { name: 'Change password' }).previousElementSibling as Element)
    expect(screen.queryByRole('dialog', { name: 'Change password' })).toBeNull()
  })

  it('shows the server’s refusal in the sheet', async () => {
    openMore({ personalLogin: true }, vi.fn(async () => ({ ok: false as const, reason: 'Your current password is not right.' })) as never)
    fireEvent.click(screen.getByRole('button', { name: /Change password/ }))
    fill('wrong-one', 'new-pass-1', 'new-pass-1')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Change password' })).getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your current password is not right.'))
  })
})

describe('the HR app’s tab bar while reading on (2026-10-11)', () => {
  it('steps out of the way on a scroll down, and is back on a scroll up or on another tab', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(70)
    render(<HrApp data={data} actions={actions} />)
    const nav = screen.getByRole('navigation', { name: 'HR app' })
    const page = nav.parentElement!.querySelector('header')!.parentElement!
    let top = 0
    Object.defineProperty(page, 'clientHeight', { configurable: true, get: () => 600 })
    Object.defineProperty(page, 'scrollHeight', { configurable: true, get: () => 2000 })
    Object.defineProperty(page, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v } })
    const at = (y: number) => { top = y; act(() => { page.dispatchEvent(new Event('scroll')) }) }
    at(0)
    at(200)
    expect(nav).toHaveAttribute('data-tucked')
    expect(nav).toHaveAttribute('inert')
    at(150)
    expect(nav).not.toHaveAttribute('data-tucked')
    at(400)
    expect(nav).toHaveAttribute('data-tucked')
    fireEvent.click(within(nav).getByRole('button', { name: 'Rooms' }))
    expect(nav).not.toHaveAttribute('data-tucked')
    // …and the page it opens starts at its top (the user: "每次点进去都从最上面开始").
    expect(top).toBe(0)
    vi.restoreAllMocks()
  })
})
