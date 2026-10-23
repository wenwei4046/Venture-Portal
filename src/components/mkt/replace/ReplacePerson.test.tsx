import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { replacePlacesFromRow, type ReplaceWho } from '@/lib/marketing/replace'

// 2026-10-24 — Replace Person (④-5, `Replace Person.dc.html`; the user's answers 24–28), walked against the action it
// calls (lib/marketing/actions.ts; the database's side is tests/member-sql/validate-marketing-replace.mjs): who is
// replaced, where they appear — all ticked, untick what stays — who takes over and why, what stops Replace, then the
// record.

const actions = vi.hoisted(() => ({ replaceMktPerson: vi.fn() }))
vi.mock('@/lib/marketing/actions', () => actions)
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

import ReplacePerson from './ReplacePerson'

const SITI = '00000000-0000-4000-8000-000000000014', HAFIZ = '00000000-0000-4000-8000-000000000015', MEI = '00000000-0000-4000-8000-000000000012'
const names = { [SITI]: 'Siti', [HAFIZ]: 'Hafiz', [MEI]: 'Mei' }
const who: ReplaceWho[] = [
  { id: SITI, first: 'Siti', full: 'SITI AMINAH', title: 'GRAPHIC DESIGNER', places: 4 },
  { id: HAFIZ, first: 'Hafiz', full: 'HAFIZ', title: 'GRAPHIC DESIGNER', places: 1 },
  { id: MEI, first: 'Mei', full: 'MEI', title: 'VIDEOGRAPHER', places: 0 },
]
const takers = [
  { id: MEI, first: 'Mei', hint: 'VIDEOGRAPHER · 0 active', group: 'VIDEOGRAPHER' },
  { id: SITI, first: 'Siti', hint: 'GRAPHIC DESIGNER · 2 active', group: 'GRAPHIC DESIGNER' },
  { id: HAFIZ, first: 'Hafiz', hint: 'GRAPHIC DESIGNER · 3 active', group: 'GRAPHIC DESIGNER' },
]
const PLACES = [
  { key: 'wf:w1', grp: 'tpl', role: 'template', ref: 'w1', action: 'Graphic post', tname: 'Standard', version: 2, at: [{ n: 2, stage: 'Design', role: 'cand' }] },
  { key: 'st:p1:1:cand', grp: 'up', role: 'cand', ref: 'p1', track: 'MKT-CAR-2610-001', title: 'Nov content plan', idx: 1, stage: 'Design', status: 'planned',
    starts: '2026-11-04', cands: [SITI, HAFIZ], appr: [] },
  { key: 'st:p2:0:owner', grp: 'hand', role: 'owner', ref: 'p2', track: 'TSK-CAR-2610-002', title: 'Price banner', idx: 0, stage: 'Draft', status: 'accepted',
    due: '2026-10-24' },
  { key: 'st:p5:0:appr', grp: 'appr', role: 'appr', ref: 'p5', track: 'TSK-CAR-2610-005', title: 'Story set', idx: 0, stage: 'Stories', status: 'accepted',
    appr: [SITI, HAFIZ], level: 1 },
]
const places = replacePlacesFromRow({ person: { id: SITI, full: 'SITI AMINAH', first: 'Siti' }, places: PLACES })

beforeEach(() => {
  actions.replaceMktPerson.mockReset()
  router.push.mockReset()
})

describe('step 1 — who is replaced', () => {
  it('lists everybody with their places; Find … everywhere opens their places', () => {
    render(<ReplacePerson who={who} places={null} takers={takers} names={names} />)
    expect(screen.getByRole('heading', { name: 'Who are you replacing?' })).toBeTruthy()
    const people = screen.getByRole('radiogroup', { name: 'People' })
    expect(within(people).getAllByRole('radio').map(r => r.textContent)).toEqual([
      'SSitiGRAPHIC DESIGNER · in 4 places', 'HHafizGRAPHIC DESIGNER · in 1 place', 'MMeiVIDEOGRAPHER · in 0 places'])
    expect(screen.getByRole('button', { name: 'Pick somebody' })).toHaveProperty('disabled', true)
    fireEvent.click(within(people).getByRole('radio', { name: /Mei/ }))
    expect(screen.getByRole('button', { name: 'Mei stands nowhere' })).toHaveProperty('disabled', true)
    fireEvent.click(within(people).getByRole('radio', { name: /Siti/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Find Siti everywhere →' }))
    expect(router.push).toHaveBeenCalledWith(`/marketing/replace?p=${SITI}`)
  })
})

describe('steps 2–3 — where, who takes over, why', () => {
  it('everything ticked; what stops Replace, first thing first; untick what stays', async () => {
    render(<ReplacePerson who={who} places={places} takers={takers} names={names} />)
    expect(screen.getByText('Siti appears in 4 places')).toBeTruthy()
    expect(screen.getAllByRole('checkbox', { checked: true }).length).toBe(PLACES.length + 4)
    expect(screen.getByText('… takes over 4 of 4: 1 template, 1 upcoming stage, 1 in hand, 1 approval.')).toBeTruthy()
    expect(screen.getByText('Pick who takes over')).toBeTruthy()
    // Anybody on the roster but her, her own group first.
    const pick = screen.getByRole('radiogroup', { name: 'Replace with' })
    expect(within(pick).getAllByRole('radio').map(r => r.textContent)).toEqual(['HHafiz· GRAPHIC DESIGNER · 3 active', 'MMei· VIDEOGRAPHER · 0 active'])
    fireEvent.click(within(pick).getByRole('radio', { name: /Hafiz/ }))
    expect(screen.getByText('Hafiz is already a candidate — Siti will just be removed')).toBeTruthy()
    expect(screen.getByText('Hafiz already approves this stage — untick it, or pick somebody else')).toBeTruthy()
    expect(screen.getByText('A reason is required')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resigned' }))
    expect(screen.getByText('Hafiz already approves 1 stage under way — untick it, or pick somebody else')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replace selected (4)' })).toHaveProperty('disabled', true)
    // Unticked: it stays with her.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Story set — Stage 1 Stories' }))
    expect(screen.getByText('Stays with Siti')).toBeTruthy()
    expect(screen.getByText('Hafiz takes over 3 of 4: 1 template, 1 upcoming stage, 1 in hand. 1 stays with Siti.')).toBeTruthy()

    actions.replaceMktPerson.mockResolvedValue({ ok: true, done: {
      rec: 7, at: '2026-10-24T03:40:00Z', by: 'Josiah', from: { id: SITI, first: 'Siti' }, to: { id: HAFIZ, first: 'Hafiz' }, reason: 'Resigned', gone: 0,
      done: replacePlacesFromRow({ person: { id: SITI }, places: [{ ...PLACES[0], published: 3 }, { ...PLACES[1], dupe: true }, PLACES[2]] })!.places,
      kept: replacePlacesFromRow({ person: { id: SITI }, places: [PLACES[3]] })!.places,
    } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace selected (3)' }))
    })
    expect(actions.replaceMktPerson).toHaveBeenCalledWith(SITI, HAFIZ, ['wf:w1', 'st:p1:1:cand', 'st:p2:0:owner'], 'Resigned')

    // Step 4 — the record.
    expect(screen.getByText('3 places updated')).toBeTruthy()
    expect(screen.getByText('Audit #R-0007')).toBeTruthy()
    expect(screen.getByText(/^Siti → Hafiz · Reason: Resigned · 24 Oct 2026, 11:40 by Josiah$/)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Tasks in hand need Hafiz to Accept again. 1 task moved to Hafiz’s My Space with an Accept button. Their deadlines are unchanged.')
    const rows = within(screen.getByRole('table', { name: 'Places' })).getAllByRole('row').slice(1)
    expect(rows.map(r => within(r).getAllByRole('cell').map(c => c.textContent))).toEqual([
      ['Graphic post · Standard v2Workflow templates', 'Siti → Hafiz', 'Published v3'],
      ['Nov content plan — Stage 2 DesignUpcoming stages in active projects', 'Siti removed (Hafiz already listed)', 'Assigned · not started'],
      ['Price banner — Stage 1 DraftIn Siti’s hands now', 'Siti → Hafiz', 'Waiting for Hafiz to Accept'],
      ['Story set — Stage 1 StoriesApprovals under way', 'No change', 'Stays with Siti'],
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Replace someone else' }))
    expect(router.push).toHaveBeenCalledWith('/marketing/replace')
  })

  it('a refusal stays on the page, in its words', async () => {
    render(<ReplacePerson who={who} places={places} takers={takers} names={names} />)
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Replace with' })).getByRole('radio', { name: /Mei/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'Moved to Ads' } })
    actions.replaceMktPerson.mockResolvedValue({ ok: false, reason: 'None of those places is Siti’s any more — reload to see where they stand.' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace selected (4)' }))
    })
    expect(screen.getByRole('alert').textContent).toBe('None of those places is Siti’s any more — reload to see where they stand.')
    expect(screen.getByText('Siti appears in 4 places')).toBeTruthy()
  })

  it('the group’s box ticks and unticks all of it; Choose a different person goes back', () => {
    render(<ReplacePerson who={who} places={places} takers={takers} names={names} />)
    const hand = screen.getByRole('checkbox', { name: 'In Siti’s hands now — all' })
    fireEvent.click(hand)
    expect(hand.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('checkbox', { name: 'Price banner — Stage 1 Draft' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Tick all' }))
    expect(screen.getAllByRole('checkbox', { checked: true }).length).toBe(PLACES.length + 4)
    fireEvent.click(screen.getByRole('button', { name: 'Untick all' }))
    expect(screen.getByText('Nothing selected.')).toBeTruthy()
    expect(screen.getByText('Tick at least one place')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '← Choose a different person' }))
    expect(router.push).toHaveBeenCalledWith('/marketing/replace')
  })
})
