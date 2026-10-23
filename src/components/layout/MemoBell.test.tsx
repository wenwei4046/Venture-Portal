import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The portal's memo bell (2026-10-12 — the user: "我在任何一个 view 都可以收到那个 notification，那我只需要
// acknowledge 一次"): one's own memos, read from the browser, opened and acknowledged in a drawer — the login's
// receipt, the same in every view.

const db = vi.hoisted(() => ({ rpc: vi.fn() }))
const memoActions = vi.hoisted(() => ({ markMyMemo: vi.fn(), openMemoFile: vi.fn(), myMemoSignature: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => db }))
vi.mock('@/lib/memos/actions', () => memoActions)
const probationActions = vi.hoisted(() => ({ acknowledgeProbation: vi.fn() }))
vi.mock('@/app/(portal)/team/people/probation-actions', () => probationActions)

import { PNG, padPicture, sign } from '@/test/signature'
import MemoBell from './MemoBell'
import { officeToday } from '@/lib/office-time'

const row = (over: Record<string, unknown>) => ({
  id: 'm1', title: 'House rules', body: 'Read them.\n\nThey start Monday.', sender: 'People & Culture', kind: 'Memo',
  publishedAt: '2026-10-12T09:44:13Z', version: 1, requiresAck: true, attachmentName: null, attachmentType: null,
  readAt: null, acknowledgedAt: null, ...over,
})

beforeEach(() => {
  db.rpc.mockReset()
  memoActions.markMyMemo.mockReset()
  memoActions.openMemoFile.mockReset()
  memoActions.myMemoSignature.mockReset()
  memoActions.myMemoSignature.mockResolvedValue(PNG)
  padPicture()
  db.rpc.mockResolvedValue({
    data: {
      staffId: 'loo',
      memos: [
        row({ id: 'old', title: 'Old notice', publishedAt: '2026-10-01T02:00:00Z', readAt: '2026-10-02T02:00:00Z', acknowledgedAt: '2026-10-02T02:00:00Z' }),
        row({ id: 'm1', attachmentName: 'Rules.pdf', attachmentType: 'application/pdf' }),
      ],
    },
    error: null,
  })
  memoActions.markMyMemo.mockImplementation(async (_id: string, ack: boolean) => ({
    ok: true, readAt: '2026-10-12T10:00:00Z', acknowledgedAt: ack ? '2026-10-12T10:01:00Z' : null,
  }))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MemoBell', () => {
  it('reads the login’s own memos and counts what is new or waiting', async () => {
    render(<MemoBell />)
    expect(await screen.findByRole('button', { name: 'Memos, 1 new' })).toBeInTheDocument()
    expect(db.rpc).toHaveBeenCalledWith('my_memos')
  })

  it('lists them, waiting first; a memo opens as it reads, and opening it reads it', async () => {
    render(<MemoBell />)
    fireEvent.click(await screen.findByRole('button', { name: 'Memos, 1 new' }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('1 waiting for your acknowledgement')).toBeInTheDocument()
    const rows = within(drawer).getAllByRole('button').filter(b => /From People & Culture/.test(b.textContent ?? ''))
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringContaining('House rules'),
      expect.stringContaining('Old notice'),
    ])
    expect(rows[0]).toHaveTextContent('1 file')
    fireEvent.click(rows[0])
    const card = within(drawer).getByRole('article', { name: 'House rules, as it reads' })
    expect(within(card).getByText('They start Monday.')).toBeInTheDocument()
    expect(within(card).getByText('Rules.pdf')).toBeInTheDocument()
    expect(memoActions.markMyMemo).toHaveBeenCalledWith('m1', false)
  })

  it('Acknowledge waits for a signature, records it once with it — then says when and shows it', async () => {
    render(<MemoBell />)
    fireEvent.click(await screen.findByRole('button', { name: 'Memos, 1 new' }))
    const drawer = await screen.findByRole('dialog')
    fireEvent.click(within(drawer).getByText('House rules').closest('button')!)
    expect(within(drawer).getByRole('button', { name: 'Acknowledge' })).toBeDisabled()
    expect(within(drawer).getByText('Sign above to acknowledge.')).toBeInTheDocument()
    sign(within(drawer).getByLabelText('Sign here'))
    expect(within(drawer).getByText(/Your signature, name and time are recorded for HR/)).toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Acknowledge' }))
    await waitFor(() => expect(memoActions.markMyMemo).toHaveBeenCalledWith('m1', true, PNG))
    expect(await within(drawer).findByText(/You acknowledged this ·/)).toBeInTheDocument()
    expect(within(drawer).getByRole('img', { name: 'Your signature' })).toHaveAttribute('src', PNG)
    expect(within(drawer).queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Memos' })).toBeInTheDocument()
  })

  it('a memo acknowledged before shows the signature it was given, read back when opened', async () => {
    render(<MemoBell />)
    fireEvent.click(await screen.findByRole('button', { name: 'Memos, 1 new' }))
    const drawer = await screen.findByRole('dialog')
    fireEvent.click(within(drawer).getByText('Old notice').closest('button')!)
    expect(memoActions.myMemoSignature).toHaveBeenCalledWith('old')
    expect(await within(drawer).findByRole('img', { name: 'Your signature' })).toHaveAttribute('src', PNG)
    expect(within(drawer).queryByLabelText('Sign here')).toBeNull()
  })

  it('a refusal is said in words', async () => {
    memoActions.markMyMemo.mockImplementation(async (_id: string, ack: boolean) =>
      ack ? { ok: false, reason: 'Read-only while viewing as somebody — nothing is saved.' } : { ok: true, readAt: 'x', acknowledgedAt: null })
    render(<MemoBell />)
    fireEvent.click(await screen.findByRole('button', { name: 'Memos, 1 new' }))
    const drawer = await screen.findByRole('dialog')
    fireEvent.click(within(drawer).getByText('House rules').closest('button')!)
    sign(within(drawer).getByLabelText('Sign here'))
    fireEvent.click(within(drawer).getByRole('button', { name: 'Acknowledge' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('Read-only while viewing as somebody')
  })

  it('a shared login has none: an empty drawer, no count', async () => {
    db.rpc.mockResolvedValue({ data: { staffId: null, memos: [] }, error: null })
    render(<MemoBell />)
    fireEvent.click(await screen.findByRole('button', { name: 'Memos' }))
    expect(await screen.findByText('No memos for you yet.')).toBeInTheDocument()
  })
})

// HR view's Notifications (2026-10-23 — the user, circling the bell: "at least show up in this notification side, in
// desktop view"): a probation ending within 14 days, or past and still open, for whoever may act on it.
describe('MemoBell in HR’s view — probations ending', () => {
  /** YYYY-MM-DD, n days from the office's today — the reminders are read against the real one. */
  const plus = (n: number) => {
    const [y, m, d] = officeToday().split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d) + n * 86_400_000).toISOString().slice(0, 10)
  }
  const review = (over: Record<string, unknown>) => ({
    id: 'p1', name: 'ZACK', firstName: null, lastName: null, code: 'HV052', department: 'Revenue Department', title: 'Revenue Specialist',
    hireDate: '2026-08-01', months: 3, endsOn: plus(9), ackEnd: null, ackName: null, ackAt: null, ...over,
  })
  const answers = (reviews: unknown[], memos: unknown[] = []) =>
    db.rpc.mockImplementation(async (name: string) => ({ data: name === 'probation_reviews' ? reviews : { staffId: 'loo', memos }, error: null }))

  beforeEach(() => probationActions.acknowledgeProbation.mockReset())

  it('counts the ones waiting for Acknowledge — and the shared hr@ reads no memos', async () => {
    answers([review({}), review({ id: 'p2', name: 'ACKED', endsOn: plus(3), ackEnd: plus(3), ackName: 'LI SEAN', ackAt: '2026-10-23T02:00:00Z' }), review({ id: 'p3', name: 'LATER', endsOn: plus(40) })])
    render(<MemoBell memos={false} probation />)
    expect(await screen.findByRole('button', { name: 'Notifications, 1 new' })).toBeInTheDocument()
    expect(db.rpc).toHaveBeenCalledWith('probation_reviews')
    expect(db.rpc).not.toHaveBeenCalledWith('my_memos')
  })

  it('lists them waiting first, each opening their page; acknowledged ones say who', async () => {
    answers([review({ id: 'p2', name: 'ACKED', endsOn: plus(3), ackEnd: plus(3), ackName: 'LI SEAN', ackAt: '2026-10-23T02:00:00Z' }), review({}), review({ id: 'p3', name: 'LATER', endsOn: plus(40) })])
    render(<MemoBell memos={false} probation />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('1 probation to acknowledge')).toBeInTheDocument()
    expect(within(drawer).getByText('Probation ending')).toBeInTheDocument()
    const links = within(drawer).getAllByRole('link')
    expect(links.map(l => l.textContent)).toEqual([expect.stringContaining('ZACK'), expect.stringContaining('ACKED')])
    expect(links[0]).toHaveAttribute('href', '/team/people/p1')
    expect(links[0]).toHaveTextContent('in 9 days · Revenue Department')
    expect(links[1]).toHaveTextContent('Acknowledged by LI SEAN')
    expect(within(drawer).queryByText('LATER')).toBeNull()
  })

  it('Acknowledge records it and the count goes', async () => {
    answers([review({})])
    probationActions.acknowledgeProbation.mockResolvedValue({ ok: true, endsOn: plus(9), ackName: 'LI SEAN', ackAt: '2026-10-23T03:00:00Z' })
    render(<MemoBell memos={false} probation />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }))
    const drawer = await screen.findByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Acknowledge' }))
    expect(await within(drawer).findByText('Acknowledged')).toBeInTheDocument()
    expect(probationActions.acknowledgeProbation).toHaveBeenCalledWith('p1')
    expect(within(drawer).getByText(/Acknowledged by LI SEAN/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('a refusal is said in words', async () => {
    answers([review({})])
    probationActions.acknowledgeProbation.mockResolvedValue({ ok: false, reason: 'They are not on probation any more — reload the page.' })
    render(<MemoBell memos={false} probation />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }))
    const drawer = await screen.findByRole('dialog')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Acknowledge' }))
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('They are not on probation any more')
  })

  it('beside one’s own memos: both counted, both listed', async () => {
    answers([review({ endsOn: plus(-2) })], [row({ id: 'm1' })])
    render(<MemoBell memos probation />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 new' }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('1 probation to acknowledge · 1 memo waiting')).toBeInTheDocument()
    expect(within(drawer).getByText(/2 days ago/)).toBeInTheDocument()
    expect(within(drawer).getByText('Memos')).toBeInTheDocument()
    expect(within(drawer).getByText('House rules')).toBeInTheDocument()
  })

  it('nothing ending soon: says so', async () => {
    answers([review({ endsOn: plus(30) })])
    render(<MemoBell memos={false} probation />)
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByText('No probation ends in the next 14 days.')).toBeInTheDocument()
  })
})
