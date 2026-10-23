import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { picPageFromRow, type PicPage as Page } from '@/lib/marketing/pic'

// 2026-10-23 — the PIC's link (⑤-1, `PIC Link.dc.html`) for the subsidiary's PIC, who has no login: they read the
// minutes, approve with their full name or ask for changes in their words, and see the receipt. Walked against the one
// call it makes (lib/marketing/pic-actions.ts; the database's side is tests/member-sql/validate-marketing-pic-link.mjs).

const answerPic = vi.hoisted(() => vi.fn())
vi.mock('@/lib/marketing/pic-actions', () => ({ answerPic }))

import PicPage from './PicPage'

const CODE = '0123456789abcdef0123456789abcdef'
function page(over: Record<string, unknown> = {}): Page {
  return picPageFromRow({
    today: '2026-10-24', sub: 'Carres', product: 'Social Media Package A', title: 'Carres · Social Media Package A · Oct 2026',
    track: 'MKT-CAR-2610-001', status: 'waiting_pic', owner: 'Rachel', startedAt: '2026-10-23T01:00:00Z', sentAt: '2026-10-24T02:00:00Z',
    reply: null, updated: null, asked: null,
    minutes: { title: 'Kickoff', fields: [
      { name: 'Meeting date', type: 'Date', value: '2026-11-05' },
      { name: 'Objective', type: 'Long text', value: 'Year-end walk-ins' },
      { name: 'Shots', type: 'Table', value: { cols: ['Shot', 'Due'], rows: [['Opening', '6 Nov']] } },
    ] },
    ...over,
  }) as Page
}

beforeEach(() => answerPic.mockReset())

describe('the PIC’s link', () => {
  it('a code that is nobody’s: closed, and nothing more', () => {
    render(<PicPage code="nope" initial={null} />)
    expect(screen.getByText('This link is closed')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the minutes they are asked to approve, and who to ask', () => {
    render(<PicPage code={CODE} initial={page()} />)
    expect(screen.getByRole('heading', { name: 'Carres · Social Media Package A · Oct 2026' })).toBeTruthy()
    expect(screen.getAllByText('Waiting for your approval')).toHaveLength(2)
    expect(screen.getByText('Needs your approval')).toBeTruthy()
    expect(screen.getByText('5 Nov 2026')).toBeTruthy()
    expect(screen.getByText('Year-end walk-ins')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Shot' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Opening' })).toBeTruthy()
    expect(screen.getByText(/Reply to Rachel on WhatsApp\. This link is private to Carres/)).toBeTruthy()
  })

  it('approves with their full name, then shows the receipt', async () => {
    render(<PicPage code={CODE} initial={page()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const confirm = screen.getByRole('button', { name: 'Confirm approval' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Ke' } })
    expect(confirm).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Kelvin Tan' } })
    answerPic.mockResolvedValue({ ok: true, page: page({ status: 'approved', reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: '2026-10-25T02:12:00Z' } }) })
    await act(async () => {
      fireEvent.click(confirm)
    })
    await waitFor(() => expect(answerPic).toHaveBeenCalledWith(CODE, 'approve', 'Kelvin Tan', ''))
    expect(await screen.findByText('Signed by Kelvin Tan · 25 Oct 2026, 10:12')).toBeTruthy()
    expect(screen.getByText('Requirements')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('asks for changes in their words — 5 characters at least', async () => {
    render(<PicPage code={CODE} initial={page()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))
    const send = screen.getByRole('button', { name: 'Send to the team' })
    fireEvent.change(screen.getByRole('textbox', { name: 'What should change' }), { target: { value: 'Add' } })
    expect(send).toHaveProperty('disabled', true)
    expect(screen.getByText('Required')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'What should change' }), { target: { value: 'Add Penang, start 5 Nov' } })
    expect(screen.getByText('Ready to send')).toBeTruthy()
    answerPic.mockResolvedValue({ ok: true, page: page({ status: 'changes', reply: { decision: 'changes', name: 'Kelvin', reason: 'Add Penang, start 5 Nov', at: '2026-10-25T02:12:00Z' } }) })
    await act(async () => {
      fireEvent.click(send)
    })
    await waitFor(() => expect(answerPic).toHaveBeenCalledWith(CODE, 'changes', '', 'Add Penang, start 5 Nov'))
    expect(await screen.findByText('Changes sent')).toBeTruthy()
    expect(screen.getByText('“Add Penang, start 5 Nov”')).toBeTruthy()
    expect(screen.getByText('The team is making your changes')).toBeTruthy()
  })

  it('says why when the answer is refused', async () => {
    render(<PicPage code={CODE} initial={page()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Full name' }), { target: { value: 'Kelvin Tan' } })
    answerPic.mockResolvedValue({ ok: false, reason: 'Nothing is waiting for your approval now.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }))
    })
    expect((await screen.findByRole('alert')).textContent).toBe('Nothing is waiting for your approval now.')
  })

  it('waiting again: says what the team changed after they approved, or what they asked', () => {
    const { unmount } = render(<PicPage code={CODE} initial={page({ updated: { fields: 'Objective', at: 'x' } })} />)
    expect(screen.getByText('Updated after your approval — please review again')).toBeTruthy()
    expect(screen.getByText('The team changed Objective.')).toBeTruthy()
    unmount()
    render(<PicPage code={CODE} initial={page({ asked: { reason: 'Add Penang', at: 'x' }, reply: { decision: 'changes', name: 'Kelvin', reason: 'Add Penang', at: 'x' } })} />)
    expect(screen.getByText('You asked: “Add Penang”')).toBeTruthy()
    expect(screen.queryByText('Changes sent')).toBeNull()
  })
})
