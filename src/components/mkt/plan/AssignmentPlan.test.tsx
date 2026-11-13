import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'

// 2026-10-24 — a deliverable's Assignment Plan on the page (②b-2a, `Assignment Plan.dc.html`): the manager picks each
// stage's person (its group first) or leaves it to the stage before, an approval picked at assignment, the start day;
// Save stays shut while something is missing and says what; once the deliverable has opened, a change of hands asks
// why first. Saved through planMktDeliverable (the database's side: validate-marketing-deliverables.mjs).

const actions = vi.hoisted(() => ({ planMktDeliverable: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)

import AssignmentPlan from './AssignmentPlan'

const ALI = 's-ali', MEI = 's-mei', JOSIAH = 's-josiah'
const team = [
  { id: JOSIAH, full: 'SIA JOSIAH', first: 'SIA', title: 'MARKETING MANAGER' },
  { id: MEI, full: 'MEI LING', first: 'Mei', title: 'VIDEOGRAPHER' },
  { id: ALI, full: 'ALI HASSAN', first: 'Ali', title: 'GRAPHIC DESIGNER' },
]
const people = [
  { id: MEI, first: 'Mei', hint: 'VIDEOGRAPHER · 1 active', group: 'VIDEOGRAPHER' },
  { id: ALI, first: 'Ali', hint: 'GRAPHIC DESIGNER · 3 active', group: 'GRAPHIC DESIGNER' },
  { id: JOSIAH, first: 'SIA', hint: 'MARKETING MANAGER · 0 active', group: 'MARKETING MANAGER' },
]
const approvers = people.filter(p => p.group === 'MARKETING MANAGER')
const stage = (idx: number, over: Record<string, unknown>) => ({
  project: 'd1', idx, name: `Stage ${idx}`, dept: 'GRAPHIC DESIGNER', mode: 'assign', cands: [], sla: 1, appr: [], split: false,
  spec: { form: [] }, work: {}, status: 'planned', ...over,
})
function page(over: Record<string, unknown> = {}, stages = [
  stage(0, { name: 'Design', sla: 2, appr: [{ kind: 'pic' }] }),
  stage(1, { name: 'Caption', dept: 'VIDEOGRAPHER', mode: 'prev', cands: [ALI, MEI], appr: [{ kind: 'person', staff: JOSIAH }] }),
  stage(2, { name: 'Publish', dept: 'VIDEOGRAPHER', appr: [{ kind: 'assign' }], split: true }),
]): MktTaskPage {
  return taskFromRow({
    today: '2026-10-26', me: JOSIAH, team,
    sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
    project: { id: 'd1', trackId: 'MKT-CAR-2610-007-D01', kind: 'deliverable', sub: 'sub', title: 'Image post 1/2', status: 'planning', cur: 0,
      workflow: 'Image post · Standard', parent: { id: 'p1', trackId: 'MKT-CAR-2610-007', title: 'Carres · Social Pack', status: 'active' },
      deliv: { group: 'Graphic design', item: 'Image post', n: 1, of: 2 }, locked: false, free: [], ...over },
    stages, events: [], holidays: [{ day: '2026-11-03', name: 'Selangor day' }],
  }) as MktTaskPage
}
const card = (name: string) => screen.getByRole('region', { name: new RegExp(`· ${name}$`) })

beforeEach(() => actions.planMktDeliverable.mockReset())

describe('a deliverable’s Assignment Plan', () => {
  it('lays out each stage — its group, approvals, days and dates — and the summary', () => {
    render(<AssignmentPlan initial={page()} people={people} approvers={approvers} />)
    expect(screen.getAllByText('Image post 1/2').map(e => e.tagName)).toEqual(['A', 'DIV']) // the crumb back to it, its title
    expect(screen.getByRole('link', { name: 'Carres · Social Pack' }).getAttribute('href')).toBe('/marketing/projects/MKT-CAR-2610-007')
    expect(screen.getByText('Not planned')).toBeTruthy()
    expect(within(card('Design')).getByText('GRAPHIC DESIGNER')).toBeTruthy()
    expect(within(card('Design')).getByText('PIC · Kelvin')).toBeTruthy()
    expect(within(card('Caption')).getByText('Picked by previous stage')).toBeTruthy()
    expect(within(card('Publish')).getByRole('button', { name: '👤 Pick who approves' })).toBeTruthy()
    // Tomorrow is offered to start: Tue 27 Oct; Design's two days → Thu 29.
    expect((screen.getByLabelText('Starts') as HTMLInputElement).value).toBe('2026-10-27')
    expect(within(card('Design')).getByText('27 Oct → 29 Oct')).toBeTruthy()
    expect(screen.getByText('Working days Monday to Friday · public holidays in it: none in this range')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save plan' })).toHaveProperty('disabled', true)
    expect(screen.getByText('2 stages unassigned')).toBeTruthy()
  })

  it('assigns each stage — its group first — picks the approval left to assignment, and saves the plan', async () => {
    render(<AssignmentPlan initial={page()} people={people} approvers={approvers} />)
    fireEvent.click(within(card('Design')).getByRole('button', { name: /Choose someone/ }))
    const menu = within(card('Design')).getByRole('menu')
    expect(within(menu).getByText('Assign to · GRAPHIC DESIGNER first')).toBeTruthy()
    expect(within(menu).getAllByRole('menuitem').map(o => o.textContent)).toEqual([
      'AAli· 3 activeGRAPHIC DESIGNER', 'MMei· 1 activeVIDEOGRAPHER', 'SSIA· 0 activeMARKETING MANAGER',
    ])
    expect(within(menu).getByText('The first stage is always assigned by MM')).toBeTruthy()
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Ali/ }))
    fireEvent.click(within(card('Publish')).getByRole('button', { name: /Choose someone/ }))
    fireEvent.click(within(card('Publish')).getByRole('menuitem', { name: /Mei/ }))
    fireEvent.click(within(card('Publish')).getByRole('button', { name: '👤 Pick who approves' }))
    fireEvent.click(within(card('Publish')).getByRole('option', { name: /SIA/ }))
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-11-02' } })
    expect(screen.getByText('Working days Monday to Friday · public holidays in it: Selangor day')).toBeTruthy()
    expect(screen.getByText('Notifies 3 people')).toBeTruthy()
    const save = screen.getByRole('button', { name: 'Save plan' })
    expect(save).toHaveProperty('disabled', false)
    actions.planMktDeliverable.mockResolvedValue({ ok: true, reassigned: 0, page: null })
    await act(async () => {
      fireEvent.click(save)
    })
    await waitFor(() => expect(actions.planMktDeliverable).toHaveBeenCalledTimes(1))
    expect(actions.planMktDeliverable.mock.calls[0]).toEqual(['d1', {
      start: '2026-11-02',
      stages: [
        { owner: ALI, extra: null, appr: [{ ids: ['pic'], rule: 'any' }], sla: 2, split: false },
        { owner: null, extra: null, appr: [{ ids: [JOSIAH], rule: 'any' }], sla: 1, split: false },
        { owner: MEI, extra: null, appr: [{ ids: [JOSIAH], rule: 'any' }], sla: 1, split: true },
      ],
    }])
    expect(await screen.findByText('3 people on the plan told · Ali has it to Accept on Mon 2 Nov')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plan saved ✓' })).toHaveProperty('disabled', true)
  })

  it('two PICs: the PIC level is either one’s or both, and the plan saves which (②b-2d-2b — the user’s answer 29)', async () => {
    render(<AssignmentPlan initial={page({ pic: 'Kelvin', pic2: 'Hana' })} people={people} approvers={approvers} />)
    const design = card('Design')
    expect(within(design).getByText('PIC · Kelvin and Hana')).toBeTruthy()
    const toggle = within(design).getByRole('button', { name: 'Either PIC approves — make it both' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(within(design).getByText('Both PICs · Kelvin and Hana')).toBeTruthy()
    expect(within(design).getByRole('button', { name: 'Both PICs approve — make it either' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(design).getByRole('button', { name: /Choose someone/ }))
    fireEvent.click(within(design).getByRole('menuitem', { name: /Ali/ }))
    fireEvent.click(within(card('Publish')).getByRole('button', { name: /Choose someone/ }))
    fireEvent.click(within(card('Publish')).getByRole('menuitem', { name: /Mei/ }))
    fireEvent.click(within(card('Publish')).getByRole('button', { name: '👤 Pick who approves' }))
    fireEvent.click(within(card('Publish')).getByRole('option', { name: /SIA/ }))
    actions.planMktDeliverable.mockResolvedValue({ ok: true, reassigned: 0, page: null })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save plan' }))
    })
    await waitFor(() => expect(actions.planMktDeliverable).toHaveBeenCalledTimes(1))
    expect(actions.planMktDeliverable.mock.calls[0][1].stages[0].appr).toEqual([{ ids: ['pic'], rule: 'any', picAll: true }])
  })

  it('one PIC: no either / both to pick', () => {
    render(<AssignmentPlan initial={page()} people={people} approvers={approvers} />)
    expect(within(card('Design')).queryByRole('button', { name: /make it both/ })).toBeNull()
  })

  it('a refusal says why and keeps the plan', async () => {
    const planned = page({ status: 'active', startsOn: '2026-11-02' }, [
      stage(0, { name: 'Design', owner: ALI, status: 'todo' }), stage(1, { name: 'Caption', owner: MEI }),
    ])
    render(<AssignmentPlan initial={planned} people={people} approvers={approvers} />)
    fireEvent.click(within(card('Caption')).getByRole('button', { name: 'One day more' }))
    actions.planMktDeliverable.mockResolvedValue({ ok: false, reason: 'Its product project is not running (done).' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    })
    expect(await screen.findByText('Its product project is not running (done).')).toBeTruthy()
    expect(within(card('Caption')).getByText('2d')).toBeTruthy()
  })

  it('once open: a stage done is locked, and a change of hands asks why first', async () => {
    const live = page({ status: 'active', startsOn: '2026-10-26', cur: 1 }, [
      stage(0, { name: 'Design', owner: ALI, status: 'done', startsOn: '2026-10-26', dueOn: '2026-10-27' }),
      stage(1, { name: 'Caption', owner: MEI, status: 'accepted', startsOn: '2026-10-28', dueOn: '2026-10-28' }),
    ])
    render(<AssignmentPlan initial={live} people={people} approvers={approvers} />)
    expect(screen.getByText(/Changing a plan mid-way/)).toBeTruthy()
    expect(within(card('Design')).getByRole('button', { name: /Ali/ })).toHaveProperty('disabled', true)
    expect(screen.queryByLabelText('Starts')).toBeNull() // the start day stays
    fireEvent.click(within(card('Caption')).getByRole('button', { name: /Mei/ }))
    fireEvent.click(within(card('Caption')).getByRole('menuitem', { name: /Ali/ }))
    const dialog = screen.getByRole('dialog', { name: 'Reassign Caption' })
    expect(dialog.textContent).toContain('Mei → Ali · Ali must Accept again')
    const ok = within(dialog).getByRole('button', { name: 'Reassign' })
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'MC' } })
    expect(ok).toHaveProperty('disabled', true)
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Mei is on MC until Friday' } })
    fireEvent.click(ok)
    expect(within(card('Caption')).getByText('Changed from Mei: “Mei is on MC until Friday” · Ali must Accept again')).toBeTruthy()
    actions.planMktDeliverable.mockResolvedValue({ ok: true, reassigned: 1, page: null })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    })
    await waitFor(() => expect(actions.planMktDeliverable).toHaveBeenCalledTimes(1))
    expect(actions.planMktDeliverable.mock.calls[0][1]).toMatchObject({ start: '2026-10-26', reasons: { 1: 'Mei is on MC until Friday' } })
    expect(await screen.findByText('Plan updated · 1 change of hands logged · new people told')).toBeTruthy()
  })

  // 2026-11-13 — the Workflow Builder 2a's levels: several on one, any one or everyone; a level not touched is sent whole.
  it('a level of several: shown whole, Any one | Everyone, a person on one level only — and untouched levels kept', async () => {
    const pg = page({}, [
      stage(0, { name: 'Design', sla: 2, appr: [{ ids: [JOSIAH, 'pic'], rule: 'all' }] }),
      stage(1, { name: 'Caption', dept: 'VIDEOGRAPHER', mode: 'prev', cands: [ALI, MEI], appr: [] }),
      stage(2, { name: 'Publish', dept: 'VIDEOGRAPHER', appr: [{ ids: ['assign'], rule: 'any' }], split: true }),
    ])
    render(<AssignmentPlan initial={pg} people={people} approvers={approvers} />)
    const design = card('Design')
    const l1 = within(design).getByLabelText('Level 1')
    expect(l1.textContent).toContain('SIA×&🔗PIC · Kelvin')
    expect(within(design).getByRole('radio', { name: 'Everyone' }).getAttribute('aria-checked')).toBe('true')
    // Publish: its "picked at assignment" resolved (SIA on another stage is no matter — one level a stage).
    fireEvent.click(within(card('Publish')).getByRole('button', { name: '👤 Pick who approves' }))
    const sia = within(card('Publish')).getByRole('option', { name: /SIA/ })
    expect(sia.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(sia)
    // A second level on Design: SIA is on level 1 — not offered.
    fireEvent.click(within(design).getByRole('button', { name: '+ Level' }))
    expect(within(design).getByRole('option', { name: /SIA/ }).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(within(design).getByRole('radio', { name: 'Any one' }))
    fireEvent.click(within(design).getByRole('button', { name: /Choose someone/ }))
    fireEvent.click(within(design).getByRole('menuitem', { name: /Ali/ }))
    fireEvent.click(within(card('Publish')).getByRole('button', { name: /Choose someone/ }))
    fireEvent.click(within(card('Publish')).getByRole('menuitem', { name: /Mei/ }))
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-11-02' } })
    actions.planMktDeliverable.mockResolvedValue({ ok: true, reassigned: 0, page: null })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save plan' }))
    })
    await waitFor(() => expect(actions.planMktDeliverable).toHaveBeenCalledTimes(1))
    expect(actions.planMktDeliverable.mock.calls[0][1].stages.map((x: { appr: unknown }) => x.appr)).toEqual([
      [{ ids: [JOSIAH, 'pic'], rule: 'any' }], [], [{ ids: [JOSIAH], rule: 'any' }],
    ])
  })
})
