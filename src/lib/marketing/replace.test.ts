import { describe, expect, it } from 'vitest'
import {
  placeWords, recNo, reasonOk, replaceBlock, replaceCountsFromRow, replaceDoneFromRow, replacePlacesFromRow, replacePreview, replaceResults,
  replaceTakers, replaceWho, swapNote, toAccept, type ReplacePlace,
} from './replace'

// 2026-10-24 — Replace Person (④-5, `Replace Person.dc.html`; the user's answers 24–28): where a person stands, in the
// page's words; what a swap to somebody does beyond the swap (only taken off where they are listed already; refused on an
// approval under way they hold already); the preview, what stops Replace, the record. The database's side is
// tests/member-sql/validate-marketing-replace.mjs.

const SITI = 's-siti', HAFIZ = 's-hafiz', AINA = 's-aina', MEI = 's-mei'
const names: Record<string, string> = { [SITI]: 'Siti', [HAFIZ]: 'Hafiz', [AINA]: 'Aina', [MEI]: 'Mei' }
const nameOf = (id: string) => names[id] ?? 'Somebody'

const row = {
  person: { id: SITI, full: 'SITI AMINAH', first: 'Siti' },
  places: [
    { key: 'wf:w1', grp: 'tpl', role: 'template', ref: 'w1', action: 'Graphic post', tname: 'Standard', version: 2, drafted: true,
      at: [{ n: 2, stage: 'Design', role: 'cand' }, { n: 1, stage: 'Shoot', role: 'appr' }] },
    { key: 'series:r1', grp: 'series', role: 'series', ref: 'r1', track: 'RCR-CAR-2610-001', title: 'Daily tip', at: [{ n: 1, stage: 'Post', role: 'owner' }] },
    { key: 'st:p1:1:cand', grp: 'up', role: 'cand', ref: 'p1', track: 'MKT-CAR-2610-001', title: 'Nov content plan', idx: 1, stage: 'Design', status: 'planned',
      starts: '2026-11-04', cands: [SITI, AINA, HAFIZ], appr: [] },
    { key: 'st:p2:1:appr', grp: 'up', role: 'appr', ref: 'p2', track: 'TSK-CAR-2610-002', title: 'Price banner', idx: 1, stage: 'Check', status: 'planned',
      starts: '2026-11-09', appr: [SITI, HAFIZ], level: 1 },
    { key: 'st:p2:0:owner', grp: 'hand', role: 'owner', ref: 'p2', track: 'TSK-CAR-2610-002', title: 'Price banner', idx: 0, stage: 'Draft', status: 'accepted',
      due: '2026-10-24', late: true },
    { key: 'sub:t1', grp: 'hand', role: 'subtask', ref: 'p3', track: 'MKT-2990-2610-018', title: 'Red Truck Reels', idx: 2, stage: 'Edit', subtask: 'Thumbnail',
      status: 'working', due: '2026-10-24', late: true },
    { key: 'st:p4:0:appr', grp: 'appr', role: 'appr', ref: 'p4', track: 'TSK-CAR-2610-004', title: 'Reels cover', idx: 0, stage: 'Cover', status: 'review',
      appr: [SITI], level: 1, waiting: true, ver: 2 },
    { key: 'st:p5:0:appr', grp: 'appr', role: 'appr', ref: 'p5', track: 'TSK-CAR-2610-005', title: 'Story set', idx: 0, stage: 'Stories', status: 'accepted',
      appr: [SITI, HAFIZ], level: 1 },
    { key: 'own:p2', grp: 'own', role: 'project', ref: 'p2', track: 'TSK-CAR-2610-002', title: 'Price banner', due: '2026-10-28' },
    { key: 'bad', grp: 'nowhere', role: 'owner' },
  ],
}
const read = replacePlacesFromRow(row)!
const P = (key: string) => read.places.find(p => p.key === key) as ReplacePlace

describe('where a person stands, as read', () => {
  it('reads the person and each place — a template’s stages in order; nothing it cannot place', () => {
    expect(read.person).toEqual({ id: SITI, full: 'SITI AMINAH', first: 'Siti' })
    expect(read.places.map(p => p.key)).toEqual(row.places.slice(0, -1).map(p => p.key))
    expect(P('wf:w1')).toMatchObject({ title: 'Graphic post', tname: 'Standard', version: 2, drafted: true,
      at: [{ n: 1, stage: 'Shoot', role: 'appr' }, { n: 2, stage: 'Design', role: 'cand' }] })
    expect(P('st:p2:0:owner')).toMatchObject({ n: 1, stage: 'Draft', status: 'accepted', late: true })
    expect([replacePlacesFromRow(null), replacePlacesFromRow({ places: [] })]).toEqual([null, null])
  })

  it('counts, and the record', () => {
    expect(replaceCountsFromRow([{ id: SITI, full: 'SITI AMINAH', first: 'Siti', places: 9 }, { id: '' }, 'x'])).toEqual([{ id: SITI, full: 'SITI AMINAH', first: 'Siti', places: 9 }])
    const d = replaceDoneFromRow({ rec: 42, at: '2026-10-24T03:40:00Z', by: 'Josiah', from: { id: SITI, first: 'Siti' }, to: { id: HAFIZ, first: 'Hafiz' },
      reason: 'Resigned', done: [{ ...row.places[0], published: 3 }], kept: [row.places[8]], gone: 1 })
    expect(d).toMatchObject({ rec: 42, by: 'Josiah', reason: 'Resigned', gone: 1 })
    expect([d!.done[0].published, d!.kept[0].key]).toEqual([3, 'own:p2'])
    expect(replaceDoneFromRow({ rec: 'x' })).toBeNull()
    expect(recNo(42)).toBe('R-0042')
  })
})

describe('the people', () => {
  it('step 1: the roster with their places, anybody else who still has some, most places first', () => {
    const team = [{ id: MEI, first: 'Mei', full: 'MEI', title: 'VIDEOGRAPHER' }, { id: HAFIZ, first: 'Hafiz', full: 'HAFIZ', title: 'GRAPHIC DESIGNER' }]
    expect(replaceWho(team, [{ id: HAFIZ, full: 'HAFIZ', first: 'Hafiz', places: 2 }, { id: SITI, full: 'SITI', first: 'Siti', places: 6 }]).map(w => [w.first, w.places, w.title]))
      .toEqual([['Siti', 6, 'Not on the roster'], ['Hafiz', 2, 'GRAPHIC DESIGNER'], ['Mei', 0, 'VIDEOGRAPHER']])
  })
  it('who takes over: anybody on the roster but them (answer 25), their own group first', () => {
    const people = [{ id: MEI, first: 'Mei', hint: '', group: 'VIDEOGRAPHER' }, { id: SITI, first: 'Siti', hint: '', group: 'GRAPHIC DESIGNER' },
      { id: HAFIZ, first: 'Hafiz', hint: '', group: 'GRAPHIC DESIGNER' }]
    expect(replaceTakers(people, SITI).map(p => p.first)).toEqual(['Hafiz', 'Mei'])
  })
})

describe('a place in words', () => {
  it('a template, a series, a stage not started, the work in hand, an approval, a project', () => {
    expect(placeWords(P('wf:w1'), nameOf)).toEqual({ title: 'Graphic post · Standard v2', detail: 'Stage 1 Shoot — approves · Stage 2 Design — a 🔓 candidate · its draft has edits not yet published', meta: null, red: false })
    expect(placeWords(P('series:r1'), nameOf)).toMatchObject({ title: 'Daily tip — its runs to come', detail: 'Stage 1 Post — does it', meta: 'RCR-CAR-2610-001' })
    expect(placeWords(P('st:p1:1:cand'), nameOf)).toMatchObject({ title: 'Nov content plan — Stage 2 Design', detail: 'One of 3 🔓 candidates (Siti / Aina / Hafiz)', meta: 'starts 4 Nov' })
    expect(placeWords(P('st:p2:1:appr'), nameOf)).toMatchObject({ detail: 'Approval level 1 of 2', meta: 'starts 9 Nov' })
    expect(placeWords(P('st:p2:0:owner'), nameOf)).toEqual({ title: 'Price banner — Stage 1 Draft', detail: 'Doing it · accepted', meta: 'due 24 Oct', red: true })
    expect(placeWords(P('sub:t1'), nameOf)).toEqual({ title: 'Thumbnail — MKT-2990-2610-018', detail: 'Red Truck Reels · Edit stage', meta: 'due 24 Oct', red: true })
    expect(placeWords(P('st:p4:0:appr'), nameOf)).toMatchObject({ detail: 'Approval level 1', meta: 'waiting now' })
    expect(placeWords(P('own:p2'), nameOf)).toMatchObject({ title: 'Price banner', detail: 'TSK-CAR-2610-002 · Owner', meta: 'due 28 Oct' })
  })
})

describe('what a swap to somebody does beyond the swap', () => {
  const hafiz = { id: HAFIZ, first: 'Hafiz' }, mei = { id: MEI, first: 'Mei' }
  it('a 🔓 candidate listed already: only taken off', () => {
    expect(swapNote(P('st:p1:1:cand'), hafiz, 'Siti')).toEqual({ text: 'Hafiz is already a candidate — Siti will just be removed', refused: false })
    expect(swapNote(P('st:p1:1:cand'), mei, 'Siti')).toBeNull()
  })
  it('an approver listed already: their level removed before it starts — refused on a stage under way', () => {
    expect(swapNote(P('st:p2:1:appr'), hafiz, 'Siti')).toEqual({ text: 'Hafiz already approves this stage — Siti’s level is removed', refused: false })
    expect(swapNote(P('st:p5:0:appr'), hafiz, 'Siti')).toEqual({ text: 'Hafiz already approves this stage — untick it, or pick somebody else', refused: true })
    expect([swapNote(P('st:p5:0:appr'), mei, 'Siti'), swapNote(P('st:p5:0:appr'), null, 'Siti')]).toEqual([null, null])
  })
})

describe('the preview and what stops Replace', () => {
  const all = new Set(read.places.map(p => p.key))
  it('who takes over how much — and what stays', () => {
    expect(replacePreview(read.places, all, 'Hafiz', 'Siti')).toBe('Hafiz takes over 9 of 9: 1 template, 1 series, 2 upcoming stages, 2 in hand, 2 approvals, 1 project.')
    const some = new Set(['st:p2:0:owner', 'own:p2'])
    expect(replacePreview(read.places, some, null, 'Siti')).toBe('… takes over 2 of 9: 1 in hand, 1 project. 7 stay with Siti.')
    expect(replacePreview(read.places, new Set(), 'Hafiz', 'Siti')).toBe('Nothing selected.')
  })
  it('first thing first: a place, who, why — then an approval refused', () => {
    const hafiz = { id: HAFIZ, first: 'Hafiz' }
    expect(replaceBlock(0, hafiz, 'Resigned', [])).toBe('Tick at least one place')
    expect(replaceBlock(3, null, 'Resigned', [])).toBe('Pick who takes over')
    expect(replaceBlock(3, hafiz, ' a ', [])).toBe('A reason is required')
    expect(replaceBlock(3, hafiz, 'Resigned', ['st:p5:0:appr'])).toBe('Hafiz already approves 1 stage under way — untick it, or pick somebody else')
    expect(replaceBlock(3, hafiz, 'Resigned', [])).toBeNull()
    expect([reasonOk('Workload'), reasonOk('no'), reasonOk('x'.repeat(201))]).toEqual([true, false, false])
  })
})

describe('the record, row by row', () => {
  it('each place changed — and what stayed with them', () => {
    const d = replaceDoneFromRow({ rec: 1, at: 'x', by: 'Josiah', from: { id: SITI, first: 'Siti' }, to: { id: HAFIZ, first: 'Hafiz' }, reason: 'Resigned',
      done: [{ ...row.places[0], published: 3 }, { ...row.places[2], dupe: true }, row.places[4], row.places[6], row.places[5]], kept: [row.places[8]], gone: 0 })!
    expect(replaceResults(d, nameOf).map(r => [r.title, r.change, r.status, r.tone, r.kept])).toEqual([
      ['Graphic post · Standard v2', 'Siti → Hafiz', 'Published v3', 'done', false],
      ['Nov content plan — Stage 2 Design', 'Siti removed (Hafiz already listed)', 'Assigned · not started', 'draft', false],
      ['Price banner — Stage 1 Draft', 'Siti → Hafiz', 'Waiting for Hafiz to Accept', 'waiting', false],
      ['Reels cover — Stage 1 Cover', 'Siti → Hafiz', 'Waiting for Hafiz’s approval', 'waiting', false],
      ['Thumbnail — MKT-2990-2610-018', 'Siti → Hafiz', 'With Hafiz', 'done', false],
      ['Price banner', 'No change', 'Stays with Siti', 'draft', true],
    ])
    expect(replaceResults(d, nameOf)[0].group).toBe('Workflow templates')
    expect(toAccept(d)).toBe(1)
  })
})
