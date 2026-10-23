import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { projectLogFromRow } from '@/lib/marketing/audit'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'

// 2026-10-23 — ④-3 / ④-4: a project's Map and Audit trail (`Task Map.dc.html`, `Audit Trail.dc.html`) over its page.
// The formal log is read when it opens, filtered by person, action and stage, read-only; the Map and Replay are drawn
// from the task's stages and trail. The rows' words are lib/marketing/audit.test.ts's, the map's taskmap.test.ts's.

const readProjectLog = vi.fn()
vi.mock('./read', () => ({ readProjectLog: (id: string) => readProjectLog(id) }))

import ProjectSheet from './ProjectSheet'

const log = projectLogFromRow({
  track: 'TSK-CAR-2610-001', title: 'Price update', kind: 'quick',
  rows: [
    { id: 1, at: '2026-10-20T02:02:00Z', actor: 'SIA', action: 'created', data: { kind: 'quick' } },
    { id: 2, at: '2026-10-20T02:02:00Z', actor: 'SIA', action: 'opened', stage: 0, stageName: 'First draft', fromTo: 'Mei' },
    { id: 3, at: '2026-10-21T09:45:00Z', actor: 'Mei', action: 'submitted', stage: 0, stageName: 'First draft', fromTo: 'SIA', version: 'v1' },
    { id: 4, at: '2026-10-22T01:10:00Z', actor: 'SIA', action: 'changes', stage: 0, stageName: 'First draft', fromTo: 'Mei', reason: 'Logo too small', version: 'v1' },
  ],
})

const task = taskFromRow({
  today: '2026-10-22', me: 's-mei',
  team: [{ id: 's-sia', user: 'u1', full: 'SIA JOSIAH', first: 'SIA', title: 'MARKETING MANAGER' }, { id: 's-mei', user: 'u2', full: 'MEI LING', first: 'Mei', title: 'SOCIAL MEDIA SPECIALIST' }],
  sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: null },
  project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Price update', status: 'active', owner: 's-sia', cur: 0, free: [] },
  stages: [{ project: 'p1', idx: 0, name: 'First draft', dept: 'SOCIAL MEDIA SPECIALIST', owner: 's-mei', appr: [{ kind: 'person', staff: 's-sia' }], status: 'changes',
    dueOn: '2026-10-23', work: { notes: '', links: [] } }],
  events: log!.rows,
}) as MktTaskPage

const cells = () => screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell').map(c => c.textContent).join(' · '))
const sheet = (page: MktTaskPage | null, tab: 'map' | 'audit', onClose = () => {}) =>
  render(<ProjectSheet project="p1" track="TSK-CAR-2610-001" title="Price update" page={page} tab={tab} onClose={onClose} />)

describe('a project’s formal log', () => {
  it('is read when it opens, every record numbered, and closes', async () => {
    readProjectLog.mockResolvedValueOnce(log)
    const onClose = vi.fn()
    sheet(null, 'audit', onClose)
    expect(screen.getByText('Reading the log…')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('table', { name: 'Formal log' })).toBeTruthy())
    expect(readProjectLog).toHaveBeenCalledWith('p1')
    // A product project's intake has no stages to map: the log alone, no Map tab, no Replay.
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Audit trail'])
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
    sheet(null, 'audit')
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
    sheet(null, 'audit')
    await waitFor(() => expect(screen.getByText('Could not read the log')).toBeTruthy())
  })
})

describe('a task’s map and replay (④-4)', () => {
  it('opens on the map — its stations, the send-back — a station’s panel, and the list', () => {
    sheet(task, 'map')
    expect(screen.getByRole('dialog', { name: 'Task map' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map(t => `${t.textContent}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`))
      .toEqual(['Map*', 'Audit trail', '🗺️ Map view*', '☰ List view'])
    // The send-back: its red line's label and the stage's tag.
    expect(screen.getAllByText('returned ×1').length).toBe(2)
    expect(screen.getByText('📍 Now here')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'First draft · Changes requested' }))
    const panel = screen.getByRole('complementary', { name: 'First draft' })
    expect(within(panel).getByText('👤 SIA')).toBeTruthy()
    expect(within(panel).getByText('v1')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '☰ List view' }))
    expect(screen.getAllByRole('row').slice(1).map(r => r.textContent)).toEqual([
      // A lane is the stage's group — its person's People title (2026-10-24).
      '01📣Created by SIASOCIAL MEDIA SPECIALISTSIACreatedDone20 Oct',
      '02📣First draftSOCIAL MEDIA SPECIALISTMei🔒 Assigned · returned ×1Changes requestedDue 23 Oct',
      '03👤SIA approves First draftApprovalsSIAInternal approverPlanned',
    ])
  })

  it('replays the trail on the Audit trail tab, record by record', () => {
    readProjectLog.mockResolvedValue(log)
    vi.useFakeTimers()
    try {
      sheet(task, 'audit')
      fireEvent.click(screen.getByRole('tab', { name: '▶ Replay' }))
      expect(screen.getByText('4 / 4')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /Replay/ }))
      expect(screen.getByText('0 / 4')).toBeTruthy()
      act(() => { vi.advanceTimersByTime(1100 * 2) })
      expect(screen.getByText('2 / 4')).toBeTruthy()
      expect(screen.getByText('Stage 1 · First draft opened for Mei')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: /Pause/ }))
      fireEvent.change(screen.getByRole('slider', { name: 'Replay step' }), { target: { value: '4' } })
      expect(screen.getByText('SIA requested changes on First draft v1: "Logo too small"')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })
})
