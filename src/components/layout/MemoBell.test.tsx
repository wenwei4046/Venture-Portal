import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The portal's memo bell (2026-10-12 — the user: "我在任何一个 view 都可以收到那个 notification，那我只需要
// acknowledge 一次"): one's own memos, read from the browser, opened and acknowledged in a drawer — the login's
// receipt, the same in every view.

const db = vi.hoisted(() => ({ rpc: vi.fn() }))
const memoActions = vi.hoisted(() => ({ markMyMemo: vi.fn(), openMemoFile: vi.fn(), myMemoSignature: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => db }))
vi.mock('@/lib/memos/actions', () => memoActions)

import { PNG, padPicture, sign } from '@/test/signature'
import MemoBell from './MemoBell'

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
