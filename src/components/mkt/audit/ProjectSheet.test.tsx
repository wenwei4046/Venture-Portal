import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { projectLogFromRow } from '@/lib/marketing/audit'
import { productProjectFromRow } from '@/lib/marketing/project'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'

// 2026-10-23 — ④-3 / ④-4: a project's Map and Audit trail (`Task Map.dc.html`, `Audit Trail.dc.html`) over its page.
// The formal log is read when it opens, filtered by person, action and stage, read-only; the Map and Replay are drawn
// from the task's stages and trail. The rows' words are lib/marketing/audit.test.ts's, the map's taskmap.test.ts's.

const readProjectLog = vi.fn()
vi.mock('./read', () => ({ readProjectLog: (id: string) => readProjectLog(id) }))
const actions = vi.hoisted(() => ({ correctMktLogRecord: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)

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

  // ④-4c (the user's answer 23): opened from another project — its station first, its panel opening it.
  it('starts at the project it was opened from: its station before Created, its panel a link to it', () => {
    const opened = { ...task, project: { ...task.project, source: { id: 'p0', trackId: 'MKT-CAR-2610-003', title: 'Social Media', kind: 'product' as const, status: 'active' as const, owner: 'SIA' } } }
    sheet(opened, 'map')
    fireEvent.click(screen.getByRole('button', { name: 'MKT-CAR-2610-003 · Social Media · In progress' }))
    const panel = screen.getByRole('complementary', { name: 'MKT-CAR-2610-003 · Social Media' })
    expect(within(panel).getByRole('link', { name: 'Open MKT-CAR-2610-003 →' }).getAttribute('href')).toBe('/marketing/projects/MKT-CAR-2610-003')
    expect(within(panel).getByText('Opened TSK-CAR-2610-001 from it')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '☰ List view' }))
    expect(screen.getAllByRole('row')[1].textContent).toBe('01📣MKT-CAR-2610-003 · Social MediaSOCIAL MEDIA SPECIALISTSIAProduct project · Opened fromIn progress')
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

describe('its export and its corrections (④-3b — the user’s answers 18, 19, 21)', () => {
  const opened = async (manage = false) => {
    readProjectLog.mockResolvedValueOnce(log)
    render(<ProjectSheet project="p1" track="TSK-CAR-2610-001" title="Price update" page={null} tab="audit" manage={manage} onClose={() => {}} />)
    await waitFor(() => screen.getByRole('table', { name: 'Formal log' }))
  }

  it('anybody exports the rows shown — a formal document, the table, CSV — and nobody but the manager corrects', async () => {
    await opened()
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter the log' })).getByRole('checkbox', { name: /^Mei/ }))
    fireEvent.click(screen.getByRole('button', { name: /Export/ }))
    expect(within(screen.getByRole('menu', { name: 'Export' })).getAllByRole('menuitem').map(a => [a.textContent, a.getAttribute('href'), a.getAttribute('download')])).toEqual([
      ['PDF — formal document', '/marketing/projects/p1/log?format=pdf&person=Mei', 'TSK-CAR-2610-001_audit.pdf'],
      ['PDF — the table', '/marketing/projects/p1/log?format=table&person=Mei', 'TSK-CAR-2610-001_audit_table.pdf'],
      ['CSV', '/marketing/projects/p1/log?format=csv&person=Mei', 'TSK-CAR-2610-001_audit.csv'],
    ])
    expect(screen.queryByRole('button', { name: /^Correct record/ })).toBeNull()
  })

  it('the manager corrects a record: a record of its own — correction of #3 — and #3 says so', async () => {
    await opened(true)
    fireEvent.click(screen.getByRole('button', { name: 'Correct record #3' }))
    const panel = screen.getByRole('group', { name: 'Correct record #3' })
    expect(within(panel).getByText('Correct #3 · Submitted · First draft · 21 Oct 17:45')).toBeTruthy()
    const add = within(panel).getByRole('button', { name: 'Add correction' })
    expect(add).toHaveProperty('disabled', true)
    fireEvent.change(within(panel).getByRole('textbox', { name: 'What was wrong, and what is right' }), { target: { value: 'Sent at 18:45, not 17:45.' } })
    const after = { ...log!, rows: [...log!.rows, { id: 5, at: '2026-10-22T02:00:00Z', actor: 'SIA', action: 'correction', stage: 0, stageName: 'First draft',
      fromTo: null, reason: 'Sent at 18:45, not 17:45.', version: null, data: null, corrects: 3 }] }
    actions.correctMktLogRecord.mockResolvedValueOnce({ ok: true, log: after })
    await act(async () => {
      fireEvent.click(add)
    })
    expect(actions.correctMktLogRecord).toHaveBeenCalledWith('p1', 3, 'Sent at 18:45, not 17:45.')
    expect(screen.queryByRole('group', { name: 'Correct record #3' })).toBeNull()
    expect([cells()[2], cells()[4]]).toEqual([
      '3 · 21 Oct 17:45 · Mei · Submittedcorrected in #5Correct · Mei → SIA · — · First draft v1',
      '5 · 22 Oct 10:00 · SIA · Correctioncorrection of #3Correct · — · "Sent at 18:45, not 17:45." · —',
    ])
    expect(screen.getByText('5 of 5 records')).toBeTruthy()
  })

  it('a refusal says why and keeps the words', async () => {
    await opened(true)
    fireEvent.click(screen.getByRole('button', { name: 'Correct record #2' }))
    const panel = screen.getByRole('group', { name: 'Correct record #2' })
    fireEvent.change(within(panel).getByRole('textbox'), { target: { value: 'Opened for Ali, not Mei.' } })
    actions.correctMktLogRecord.mockResolvedValueOnce({ ok: false, reason: 'Only Marketing’s managers correct a record.' })
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Add correction' }))
    })
    expect(within(panel).getByRole('alert').textContent).toBe('Only Marketing’s managers correct a record.')
    expect((within(panel).getByRole('textbox') as HTMLTextAreaElement).value).toBe('Opened for Ali, not Mei.')
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Correct record #2' })).toBeNull()
  })
})

// 2026-10-25 — ④-4d (the user's answers 22, 23): a product project's Map — its intake and its work — drawn from its page,
// then again from the formal log's every record once it is read.
describe('a product project’s map and replay', () => {
  const product = productProjectFromRow({
    today: '2026-10-22', me: 's-sia',
    team: [{ id: 's-sia', user: 'u1', full: 'SIA JOSIAH', first: 'SIA', title: 'MARKETING MANAGER' }],
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: { id: 'p7', track: 'MKT-CAR-2610-007', title: 'Carres · Post pack · Oct 2026', status: 'waiting_pic', owner: 's-sia', ownerName: 'SIA', pic: 'Kelvin',
      linkSentAt: '2026-10-21T02:00:00Z', createdAt: '2026-10-20T01:00:00Z', product: { id: 'pr', version: 1, name: 'Post pack', kind: 'one', note: '' } },
    minutes: [{ id: 'm1', title: 'Kickoff', intake: true, status: 'sent', rev: 2, vals: {}, signed: {},
      template: { id: 't1', version: 1, name: 'Kickoff', fields: [], rules: { sign: true, pic: true } } }],
    // The page's trail: its newest records only.
    trail: [{ at: '2026-10-21T02:00:00Z', actor: 'SIA', action: 'link sent', reason: 'Kelvin' }],
    deliverables: [],
  })!
  const productLog = projectLogFromRow({
    track: 'MKT-CAR-2610-007', title: 'Carres · Post pack · Oct 2026', kind: 'product',
    rows: [
      { id: 20, at: '2026-10-20T01:00:00Z', actor: 'SIA', action: 'created', data: { product: 'Post pack', version: 1 } },
      { id: 21, at: '2026-10-21T02:00:00Z', actor: 'SIA', action: 'link sent', reason: 'Kelvin' },
    ],
  })

  it('opens on its intake — Created, the minutes, the PIC’s approval waiting, the work ahead — and replays the whole log', async () => {
    readProjectLog.mockReset()
    readProjectLog.mockResolvedValue(productLog)
    render(<ProjectSheet project="p7" track="MKT-CAR-2610-007" title="Carres · Post pack · Oct 2026" page={null} product={product} tab="map" onClose={() => {}} />)
    expect(screen.getAllByRole('tab').map(t => `${t.textContent}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`))
      .toEqual(['Map*', 'Audit trail', '🗺️ Map view*', '☰ List view'])
    expect(readProjectLog).toHaveBeenCalledWith('p7')
    expect(screen.getByText('Now at 🔗 Kelvin approves the minutes')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '☰ List view' }))
    expect(screen.getAllByRole('row').slice(1).map(r => r.textContent)).toEqual([
      '01🛡️Created by SIAMARKETING MANAGERSIAPost pack v1Done20 Oct',
      '02🛡️Meeting minutes · KickoffMARKETING MANAGERSIAIntake meetingDone21 Oct',
      '03🔗Kelvin approves the minutesApprovalsKelvinPIC via linkWaiting for KelvinSince 21 Oct',
      '04🛡️Plan assignmentsMARKETING MANAGERSIAPlan assignmentsPlanned',
    ])
    fireEvent.click(screen.getByRole('tab', { name: 'Audit trail' }))
    fireEvent.click(screen.getByRole('tab', { name: '▶ Replay' }))
    // Drawn again from the formal log: both records, not the page's one.
    await waitFor(() => expect(screen.getByText('2 / 2')).toBeTruthy())
  })
})
