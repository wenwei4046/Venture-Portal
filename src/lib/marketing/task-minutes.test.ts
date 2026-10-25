import { describe, expect, it } from 'vitest'
import {
  minutesPayload, minutesPicksFromRow, minutesProblems, minutesState, minutesTyped, newMinutesDoc, newMinutesFromDraft, NO_MINUTES, pickMinutes,
  type MinutesPick,
} from './task-minutes'

// 2026-10-25 — a task written with meeting minutes on New Project (②a-3; the user's answers 52–55). The database's side is
// tests/member-sql/validate-marketing-task-minutes.mjs.

const ROW = {
  id: 't1', name: 'Kickoff', version: 3, rules: { sign: true, lock: true },
  fields: [
    { name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true },
    { name: 'Agenda', type: 'Long text', req: true, pic: true }, { name: 'Budget', type: 'Number' },
    { name: 'Run', type: 'Campaign period' }, { name: 'Plan', type: 'Table', cols: [{ name: 'Item', type: 'Text' }, { name: 'Due date', type: 'Text' }] },
    { name: 'Signatures', type: 'Signature' },
  ],
}
const [KICKOFF] = minutesPicksFromRow([ROW]) as [MinutesPick]

describe('the templates New Project offers', () => {
  it('each published one at its last version — its fields and rules; anything else left out', () => {
    expect(KICKOFF).toMatchObject({ id: 't1', name: 'Kickoff', version: 3, rules: { sign: true, pic: false, lock: true } })
    expect(KICKOFF.fields.map(f => [f.name, f.type, f.req || f.lock])).toEqual([
      ['Project', 'Project link', true], ['Attendees', 'People', true], ['Agenda', 'Long text', true], ['Budget', 'Number', false],
      ['Run', 'Campaign period', false], ['Plan', 'Table', false], ['Signatures', 'Signature', false],
    ])
    expect(KICKOFF.fields[5].cols).toEqual([{ name: 'Item', type: 'Text' }, { name: 'Due date', type: 'Text' }])
    expect(minutesPicksFromRow([{ name: 'No id' }, 'junk', null])).toEqual([])
    expect(minutesPicksFromRow(null)).toEqual([])
  })
})

describe('the minutes as New Project fills them in', () => {
  it('a template picked: the attendees start as whoever starts the task — never over people already named', () => {
    expect(pickMinutes(NO_MINUTES, KICKOFF, 's1')).toEqual({ ...NO_MINUTES, template: 't1', vals: { Attendees: ['s1'] } })
    expect(pickMinutes({ ...NO_MINUTES, vals: { Attendees: ['s2'] } }, KICKOFF, 's1').vals.Attendees).toEqual(['s2'])
    expect(pickMinutes(NO_MINUTES, KICKOFF, null).vals).toEqual({})
  })

  it('drawn as minutes not made yet — only the template’s own fields, signed by whoever starts it once they say so', () => {
    const m = { template: 't1', vals: { Attendees: ['s1', 's2'], Agenda: 'Raya', Other: 'from another template' }, notes: 'n', sign: true }
    const doc = newMinutesDoc(KICKOFF, m, 's1')
    expect(doc).toMatchObject({ title: 'Kickoff', status: 'draft', locked: false, notes: 'n', signed: { s1: 'now' }, vals: { Attendees: ['s1', 's2'], Agenda: 'Raya' } })
    expect(doc.template).toEqual({ id: 't1', version: 3, name: 'Kickoff', fields: KICKOFF.fields, rules: KICKOFF.rules })
    // Not an attendee, or not said: no signature.
    expect(newMinutesDoc(KICKOFF, m, 's9').signed).toEqual({})
    expect(newMinutesDoc(KICKOFF, { ...m, sign: false }, 's1').signed).toEqual({})
  })

  it('sent: its own fields, an empty one left out, never the project link or the signatures — the notes, the signature asked', () => {
    const m = {
      template: 't1', notes: 'Ali sends drafts', sign: true,
      vals: { Project: 'x', Attendees: ['s1'], Agenda: 'Raya', Budget: '  ', Run: { from: '', to: '' }, Plan: { rows: [['', '']] }, Signatures: 'x', Old: 'gone' },
    }
    expect(minutesPayload(KICKOFF, m)).toEqual({ template: 't1', vals: { Attendees: ['s1'], Agenda: 'Raya' }, notes: 'Ali sends drafts', sign: true })
  })

  it('what stops the task being made: none picked, a required field empty — the project link and signatures are not asked', () => {
    expect(minutesProblems(null, NO_MINUTES)).toEqual(['Pick the meeting minutes'])
    expect(minutesProblems(KICKOFF, { ...NO_MINUTES, template: 't1' })).toEqual(['Attendees is empty', 'Agenda is empty'])
    expect(minutesProblems(KICKOFF, { ...NO_MINUTES, template: 't1', vals: { Attendees: ['s1'], Agenda: '  ' } })).toEqual(['Agenda is empty'])
    expect(minutesProblems(KICKOFF, { ...NO_MINUTES, template: 't1', vals: { Attendees: ['s1'], Agenda: 'Raya' } })).toEqual([])
  })

  it('anything written in them, for the draft — the attendees put in for whoever starts it are not', () => {
    const picked = pickMinutes(NO_MINUTES, KICKOFF, 's1')
    expect(minutesTyped(picked, KICKOFF, 's1')).toBe(false)
    expect(minutesTyped({ ...picked, vals: { Attendees: ['s1', 's2'] } }, KICKOFF, 's1')).toBe(true)
    expect(minutesTyped({ ...picked, vals: { ...picked.vals, Agenda: 'R' } }, KICKOFF, 's1')).toBe(true)
    expect(minutesTyped({ ...picked, notes: 'x' }, KICKOFF, 's1')).toBe(true)
    expect(minutesTyped({ ...picked, vals: { ...picked.vals, Plan: { rows: [['', '']] } } }, KICKOFF, 's1')).toBe(false)
    expect(minutesTyped({ ...picked, vals: { ...picked.vals, Run: { from: '2026-11-01', to: '' } } }, KICKOFF, 's1')).toBe(true)
  })

  it('a draft’s minutes put back — what a field cannot hold left out', () => {
    expect(newMinutesFromDraft({ template: 't1', notes: 'n', sign: true, vals: {
      Agenda: 'Raya', Attendees: ['s1', 7], Run: { from: '2026-11-01', to: 9 }, Plan: { rows: [['a', 1]], cols: ['A', null] }, Bad: 5, Worse: { x: 1 },
    } })).toEqual({ template: 't1', notes: 'n', sign: true, vals: {
      Agenda: 'Raya', Attendees: ['s1'], Run: { from: '2026-11-01', to: '' }, Plan: { rows: [['a', '']], cols: ['A', ''] },
    } })
    expect(newMinutesFromDraft('junk')).toBe(NO_MINUTES)
  })
})

describe('a task’s minutes on its page', () => {
  const doc = newMinutesDoc(KICKOFF, { template: 't1', vals: { Attendees: ['s1', 's2', 's3'], Agenda: 'x' }, notes: '', sign: true }, 's1')
  const names: Record<string, string> = { s1: 'Mei', s2: 'Ali', s3: 'Siti' }
  it('where they stand: whom they wait for to sign, complete — locked when the template says', () => {
    expect(minutesState(doc, id => names[id])).toEqual({ label: 'Waiting for Ali, Siti to sign', done: false })
    expect(minutesState({ ...doc, status: 'completed', locked: true }, id => names[id])).toEqual({ label: 'Complete · locked', done: true })
    expect(minutesState({ ...doc, status: 'completed' }, id => names[id])).toEqual({ label: 'Complete', done: true })
    expect(minutesState({ ...doc, template: { ...doc.template, rules: { ...doc.template.rules, sign: false } } }, id => names[id]))
      .toEqual({ label: 'Draft', done: false })
  })
})
