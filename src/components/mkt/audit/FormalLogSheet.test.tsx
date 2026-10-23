import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { projectLogFromRow } from '@/lib/marketing/audit'

// 2026-10-23 — ④-3: a project's Audit trail (`Audit Trail.dc.html`) — the formal log, read when it opens from the
// trail's head; filtered by person, action and stage; read-only. The rows' words are lib/marketing/audit.test.ts's.

const readProjectLog = vi.fn()
vi.mock('./read', () => ({ readProjectLog: (id: string) => readProjectLog(id) }))

import FormalLogSheet from './FormalLogSheet'

const log = projectLogFromRow({
  track: 'TSK-CAR-2610-001', title: 'Price update', kind: 'quick',
  rows: [
    { id: 1, at: '2026-10-20T02:02:00Z', actor: 'SIA', action: 'created', data: { kind: 'quick' } },
    { id: 2, at: '2026-10-20T02:02:00Z', actor: 'SIA', action: 'opened', stage: 0, stageName: 'First draft', fromTo: 'Mei' },
    { id: 3, at: '2026-10-21T09:45:00Z', actor: 'Mei', action: 'submitted', stage: 0, stageName: 'First draft', fromTo: 'SIA', version: 'v1' },
    { id: 4, at: '2026-10-22T01:10:00Z', actor: 'SIA', action: 'changes', stage: 0, stageName: 'First draft', fromTo: 'Mei', reason: 'Logo too small', version: 'v1' },
  ],
})

const cells = () => screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent).join(' · '))

describe('a project’s formal log', () => {
  it('is read when it opens, every record numbered, and closes', async () => {
    readProjectLog.mockResolvedValueOnce(log)
    const onClose = vi.fn()
    render(<FormalLogSheet project="p1" track="TSK-CAR-2610-001" onClose={onClose} />)
    expect(screen.getByText('Reading the log…')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('table', { name: 'Formal log' })).toBeTruthy())
    expect(readProjectLog).toHaveBeenCalledWith('p1')
    expect(cells()).toEqual([
      '1 · 20 Oct 10:02 · SIA · Task created · — · — · —',
      '2 · 20 Oct 10:02 · SIA · Stage opened · → Mei · — · —',
      '3 · 21 Oct 17:45 · Mei · Submitted · Mei → SIA · — · First draft v1',
      '4 · 22 Oct 09:10 · SIA · Changes requested · → Mei · "Logo too small" · First draft v1',
    ])
    expect(screen.getByText('4 of 4 records')).toBeTruthy()
    expect(screen.getByText('Read-only')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('filters by person and stage, chips removable, Clear all', async () => {
    readProjectLog.mockResolvedValueOnce(log)
    render(<FormalLogSheet project="p1" track="TSK-CAR-2610-001" onClose={() => {}} />)
    await waitFor(() => screen.getByRole('table', { name: 'Formal log' }))
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }))
    const pop = screen.getByRole('group', { name: 'Filter the log' })
    expect(within(pop).getAllByRole('checkbox').map(b => b.textContent)).toEqual([
      'SIA3', 'Mei1', 'Task created1', 'Stage opened1', 'Submitted1', 'Changes requested1', '—1', 'First draft3',
    ])
    fireEvent.click(within(pop).getByRole('checkbox', { name: /^SIA/ }))
    fireEvent.click(within(pop).getByRole('checkbox', { name: /^First draft/ }))
    expect(cells().map(c => c.split(' · ')[0])).toEqual(['2', '4'])
    expect(screen.getByText('2 of 4 records')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Stage: First draft' }))
    expect(cells().map(c => c.split(' · ')[0])).toEqual(['1', '2', '4'])
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(cells().length).toBe(4)
  })

  it('says so when it cannot be read', async () => {
    readProjectLog.mockResolvedValueOnce(null)
    render(<FormalLogSheet project="p1" track="TSK-CAR-2610-001" onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Could not read the log')).toBeTruthy())
  })
})
