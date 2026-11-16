import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { quoteBookFromRow } from '@/lib/marketing/quotes'
import QuoteList, { quoteNote } from './QuoteList'

// 2026-11-16 — the Quotations list v2 (docs/design_handoff_product_builder_v2/ §6): the status seg's counts leave out
// what is archived; the date under the number; a note beside the status; "Assign tasks →" opens the assignment; the
// menu's Duplicate, Archive (any status) and Delete… (drafts only); the archived shelf.

const line = { kind: 'item', key: 'l', item: 'i1', name: 'Image posts', list: 450, qty: 2 }
const BOOK = quoteBookFromRow({
  today: '2026-11-16',
  clients: [{ id: 's1', code: 'CAR', name: 'Carres', dot: '#c00' }],
  quotes: [
    { id: 'q1', no: 'QT-2611-001', sub: 's1', status: 'draft', date: '2026-11-15', valid: 30, lines: [line], removed: ['Reels'] },
    { id: 'q2', no: 'QT-2611-002', sub: 's1', status: 'sent', date: '2026-11-04', valid: 14, lines: [line], history: [{ seq: 1, kind: 'sent', rev: 2, at: '2026-11-04', snap: { lines: [] } }] },
    { id: 'q3', no: 'QT-2611-003', sub: 's1', status: 'accepted', date: '2026-11-01', valid: 30, acceptedOn: '2026-11-10', lines: [line] },
    { id: 'q4', no: 'QT-2610-009', sub: 's1', status: 'accepted', date: '2026-10-01', valid: 30, acceptedOn: '2026-10-05', lines: [line], archivedAt: '2026-11-01T00:00:00Z' },
  ],
})

describe('the Quotations list v2', () => {
  it('counts the live list only; date under the number; a note beside each status; the footer total', () => {
    render(<QuoteList book={BOOK} busy={false} onOpen={vi.fn()} onNew={vi.fn()} />)
    expect(screen.getByRole('tab', { name: /All\s*3/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Accepted\s*1/ })).toBeTruthy()
    expect(screen.queryByText('QT-2610-009')).toBeNull()
    const row = screen.getByText('QT-2611-002').closest('[role="button"]') as HTMLElement
    expect(within(row).getByText('04/11/2026')).toBeTruthy()
    expect(within(row).getByText('v2')).toBeTruthy()
    expect(within(row).getByText('Expires in 2 days')).toBeTruthy()
    expect(within(screen.getByText('QT-2611-001').closest('[role="button"]') as HTMLElement).getByText('Removed: Reels')).toBeTruthy()
    expect(screen.getByText('3 quotations')).toBeTruthy()
    expect(screen.getByText('🗄 Archived · 1')).toBeTruthy()
  })

  it('“Assign tasks →” opens the assignment, not the quotation', () => {
    const onAssign = vi.fn()
    const onOpen = vi.fn()
    render(<QuoteList book={BOOK} busy={false} onOpen={onOpen} onNew={vi.fn()} onAssign={onAssign} />)
    fireEvent.click(screen.getByRole('button', { name: 'Assign tasks →' }))
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 'q3' }))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('⋯: Duplicate and Archive for any status, Delete… only on a draft — asked first', () => {
    const onDelete = vi.fn()
    const onArchive = vi.fn()
    render(<QuoteList book={BOOK} busy={false} onOpen={vi.fn()} onNew={vi.fn()} onDelete={onDelete} onArchive={onArchive} onDuplicate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'More for QT-2611-002' }))
    let menu = screen.getByRole('menu', { name: 'QT-2611-002' })
    expect(within(menu).queryByRole('menuitem', { name: 'Delete…' })).toBeNull()
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Archive/ }))
    expect(onArchive).toHaveBeenCalledWith(expect.objectContaining({ id: 'q2' }), true)
    fireEvent.contextMenu(screen.getByText('QT-2611-001'))
    menu = screen.getByRole('menu', { name: 'QT-2611-001' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Delete…' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete QT-2611-001' })
    expect(within(dialog).getByText('Carres · RM 900. It was never sent, so nothing else changes.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete quotation' }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }))
  })

  it('the archived shelf lists only what is archived, with the way back', () => {
    render(<QuoteList book={BOOK} busy={false} onOpen={vi.fn()} onNew={vi.fn()} />)
    fireEvent.click(screen.getByText('🗄 Archived · 1'))
    expect(screen.getByText('QT-2610-009')).toBeTruthy()
    expect(screen.queryByText('QT-2611-001')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '← Back to quotations' }))
    expect(screen.getByText('QT-2611-001')).toBeTruthy()
  })

  it('the note: valid for days, expiring soon, expired, not sent, tasks assigned', () => {
    expect(quoteNote({ status: 'sent', date: '2026-11-10', valid: 30, tasks: null }, '2026-11-16').text).toBe('Valid 24 more days')
    expect(quoteNote({ status: 'sent', date: '2026-10-01', valid: 30, tasks: null }, '2026-11-16').text).toBe('Expired 31/10/2026')
    expect(quoteNote({ status: 'draft', date: '2026-11-10', valid: 30, tasks: null }, '2026-11-16').text).toBe('Not sent yet')
    expect(quoteNote({ status: 'accepted', date: '2026-11-10', valid: 30, tasks: [] }, '2026-11-16').text).toBe('Tasks assigned')
  })
})
