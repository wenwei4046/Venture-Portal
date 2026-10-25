import { describe, expect, it } from 'vitest'
import {
  minutesPayload, minutesPicksFromRow, minutesProblems, minutesState, minutesTyped, newMinutesDoc, newMinutesFromDraft, NO_MINUTES, NO_PIC, picFor,
  pickMinutes, picOnSubChange, picWho, type MinutesPick, type NewMinutes,
} from './task-minutes'
import type { TaskPicMinutes } from './task'

// 2026-10-25 — a task written with meeting minutes on New Project (②a-3; the user's answers 52–55), and the PIC approving
// them (②a-4 — answers 52, 53). The database's side is tests/member-sql/validate-marketing-task-minutes.mjs and
// validate-marketing-task-pic.mjs.

const ROW = {
  id: 't1', name: 'Kickoff', version: 3, rules: { sign: true, lock: true },
  fields: [
    { name: 'Project', type: 'Project link', lock: true }, { name: 'Attendees', type: 'People', lock: true },
    { name: 'Agenda', type: 'Long text', req: true, pic: true }, { name: 'Budget', type: 'Number' },
    { name: 'Run', type: 'Campaign period' }, { name: 'Plan', type: 'Table', cols: [{ name: 'Item', type: 'Text' }, { name: 'Due date', type: 'Text' }] },
    { name: 'Signatures', type: 'Signature' },
  ],
}
const [KICKOFF, INTAKE] = minutesPicksFromRow([ROW, { ...ROW, id: 't2', name: 'Client intake', rules: { sign: false, pic: true, picAll: true } }]) as [MinutesPick, MinutesPick]
const minutes = (m: Partial<NewMinutes>): NewMinutes => ({ ...NO_MINUTES, ...m })
const CAR = { pic: 'Kelvin Tan', whatsapp: '+60 12-345 6789', pic2: 'Hana Lee', whatsapp2: '+60 13-999 8888' }
const DOM = { pic: 'Siti', whatsapp: '019-222 3333', pic2: null, whatsapp2: null }

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
    expect(pickMinutes(minutes({ vals: { Attendees: ['s2'] } }), KICKOFF, 's1').vals.Attendees).toEqual(['s2'])
    expect(pickMinutes(NO_MINUTES, KICKOFF, null).vals).toEqual({})
  })

  it('drawn as minutes not made yet — only the template’s own fields, signed by whoever starts it once they say so', () => {
    const m = minutes({ template: 't1', vals: { Attendees: ['s1', 's2'], Agenda: 'Raya', Other: 'from another template' }, notes: 'n', sign: true })
    const doc = newMinutesDoc(KICKOFF, m, 's1')
    expect(doc).toMatchObject({ title: 'Kickoff', status: 'draft', locked: false, notes: 'n', signed: { s1: 'now' }, vals: { Attendees: ['s1', 's2'], Agenda: 'Raya' } })
    expect(doc.template).toEqual({ id: 't1', version: 3, name: 'Kickoff', fields: KICKOFF.fields, rules: KICKOFF.rules })
    // Not an attendee, or not said: no signature.
    expect(newMinutesDoc(KICKOFF, m, 's9').signed).toEqual({})
    expect(newMinutesDoc(KICKOFF, { ...m, sign: false }, 's1').signed).toEqual({})
  })

  it('sent: its own fields, an empty one left out, never the project link or the signatures — the notes, the signature asked, no PIC', () => {
    const m = minutes({
      template: 't1', notes: 'Ali sends drafts', sign: true,
      vals: { Project: 'x', Attendees: ['s1'], Agenda: 'Raya', Budget: '  ', Run: { from: '', to: '' }, Plan: { rows: [['', '']] }, Signatures: 'x', Old: 'gone' },
    })
    expect(minutesPayload(KICKOFF, m)).toEqual({ template: 't1', vals: { Attendees: ['s1'], Agenda: 'Raya' }, notes: 'Ali sends drafts', sign: true, pic: null })
  })

  it('what stops the task being made: none picked, a required field empty — the project link and signatures are not asked', () => {
    expect(minutesProblems(null, NO_MINUTES)).toEqual(['Pick the meeting minutes'])
    expect(minutesProblems(KICKOFF, minutes({ template: 't1' }))).toEqual(['Attendees is empty', 'Agenda is empty'])
    expect(minutesProblems(KICKOFF, minutes({ template: 't1', vals: { Attendees: ['s1'], Agenda: '  ' } }))).toEqual(['Agenda is empty'])
    expect(minutesProblems(KICKOFF, minutes({ template: 't1', vals: { Attendees: ['s1'], Agenda: 'Raya' } }))).toEqual([])
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

  it('a draft’s minutes put back — what a field cannot hold left out, the PIC as typed', () => {
    expect(newMinutesFromDraft({ template: 't1', notes: 'n', sign: true, vals: {
      Agenda: 'Raya', Attendees: ['s1', 7], Run: { from: '2026-11-01', to: 9 }, Plan: { rows: [['a', 1]], cols: ['A', null] }, Bad: 5, Worse: { x: 1 },
    }, pic: { on: true, name: 'Kelvin', whatsapp: 12, name2: 'Hana' } })).toEqual({ template: 't1', notes: 'n', sign: true, vals: {
      Agenda: 'Raya', Attendees: ['s1'], Run: { from: '2026-11-01', to: '' }, Plan: { rows: [['a', '']], cols: ['A', ''] },
    }, pic: { on: true, name: 'Kelvin', whatsapp: '', name2: 'Hana', whatsapp2: '' } })
    // A draft from before ②a-4: nobody asked.
    expect(newMinutesFromDraft({ template: 't1' }).pic).toEqual(NO_PIC)
    expect(newMinutesFromDraft('junk')).toBe(NO_MINUTES)
  })
})

describe('the PIC approving them (②a-4)', () => {
  it('a template picked: the PIC asked as its rule says — named as the subsidiary names its PICs; picked again, as it was', () => {
    expect(pickMinutes(NO_MINUTES, INTAKE, 's1', CAR).pic).toEqual({ on: true, name: 'Kelvin Tan', whatsapp: '+60 12-345 6789', name2: 'Hana Lee', whatsapp2: '+60 13-999 8888' })
    expect(pickMinutes(NO_MINUTES, KICKOFF, 's1', CAR).pic.on).toBe(false)
    // Turned off by hand, the same template picked again: still off.
    const off = { ...pickMinutes(NO_MINUTES, INTAKE, 's1', CAR), pic: { ...pickMinutes(NO_MINUTES, INTAKE, 's1', CAR).pic, on: false } }
    expect(pickMinutes(off, INTAKE, 's1', CAR).pic.on).toBe(false)
    // Another template whose rule asks it: on again — what was typed kept.
    expect(pickMinutes({ ...off, template: 't1' }, INTAKE, 's1', DOM).pic).toMatchObject({ on: true, name: 'Kelvin Tan' })
  })

  it('turned on: the subsidiary’s PICs — unless somebody is typed already', () => {
    expect(picFor(NO_PIC, DOM)).toEqual({ on: true, name: 'Siti', whatsapp: '019-222 3333', name2: '', whatsapp2: '' })
    expect(picFor({ ...NO_PIC, name: 'Mr Lim' }, DOM)).toEqual({ ...NO_PIC, on: true, name: 'Mr Lim' })
    expect(picFor(NO_PIC, null)).toEqual({ ...NO_PIC, on: true })
  })

  it('another subsidiary picked: its PICs — unless they were typed by hand', () => {
    const car = picFor(NO_PIC, CAR)
    expect(picOnSubChange(car, CAR, DOM)).toEqual({ on: true, name: 'Siti', whatsapp: '019-222 3333', name2: '', whatsapp2: '' })
    expect(picOnSubChange({ ...car, whatsapp: '012-000 0000' }, CAR, DOM).name).toBe('Kelvin Tan')
    expect(picOnSubChange({ ...NO_PIC, on: true }, CAR, DOM).name).toBe('Siti')
  })

  it('sent: the PIC and their WhatsApp, trimmed — a second PIC only when named; none when nobody approves', () => {
    const m = minutes({ template: 't2', vals: { Attendees: ['s1'], Agenda: 'Raya' }, pic: { on: true, name: ' Kelvin ', whatsapp: ' 012-345 6789 ', name2: ' ', whatsapp2: '013' } })
    expect(minutesPayload(INTAKE, m).pic).toEqual({ name: 'Kelvin', whatsapp: '012-345 6789' })
    expect(minutesPayload(INTAKE, { ...m, pic: { ...m.pic, name2: 'Hana', whatsapp2: ' 013-999 8888' } }).pic)
      .toEqual({ name: 'Kelvin', whatsapp: '012-345 6789', name2: 'Hana', whatsapp2: '013-999 8888' })
    expect(minutesPayload(INTAKE, { ...m, pic: { ...m.pic, on: false } }).pic).toBeNull()
  })

  it('what stops it: the PIC not named, their WhatsApp short of 8 digits, a second PIC named without one', () => {
    const m = minutes({ template: 't2', vals: { Attendees: ['s1'], Agenda: 'Raya' }, pic: { on: true, name: '', whatsapp: '012', name2: '', whatsapp2: '' } })
    expect(minutesProblems(INTAKE, m)).toEqual(['Name the PIC', 'Add the PIC’s WhatsApp'])
    expect(minutesProblems(INTAKE, { ...m, pic: { ...m.pic, name: 'Kelvin', whatsapp: '012-345 678', name2: 'Hana' } })).toEqual(['Add the second PIC’s WhatsApp'])
    expect(minutesProblems(INTAKE, { ...m, pic: { ...m.pic, name: 'Kelvin', whatsapp: '012-345 678' } })).toEqual([])
    expect(minutesProblems(INTAKE, { ...m, pic: NO_PIC })).toEqual([])
  })

  it('whom it waits for: one PIC, either of two, or both', () => {
    expect(picWho({ pic: 'Kelvin', pic2: '' })).toBe('Kelvin (PIC)')
    expect(picWho({ pic: 'Kelvin', pic2: 'Hana' })).toBe('Kelvin or Hana (PIC)')
    expect(picWho({ pic: 'Kelvin', pic2: 'Hana' }, true)).toBe('Kelvin and Hana (PIC)')
    expect(picWho({ pic: ' ', pic2: '' })).toBe('the PIC')
    expect(picWho({ pic: '', pic2: 'Hana' })).toBe('Hana (PIC)')
  })
})

describe('a task’s minutes on its page', () => {
  const doc = newMinutesDoc(KICKOFF, minutes({ template: 't1', vals: { Attendees: ['s1', 's2', 's3'], Agenda: 'x' }, sign: true }), 's1')
  const names: Record<string, string> = { s1: 'Mei', s2: 'Ali', s3: 'Siti' }
  it('where they stand: whom they wait for to sign, complete — locked when the template says', () => {
    expect(minutesState(doc, id => names[id])).toEqual({ label: 'Waiting for Ali, Siti to sign', done: false })
    expect(minutesState({ ...doc, status: 'completed', locked: true }, id => names[id])).toEqual({ label: 'Complete · locked', done: true })
    expect(minutesState({ ...doc, status: 'completed' }, id => names[id])).toEqual({ label: 'Complete', done: true })
    expect(minutesState({ ...doc, template: { ...doc.template, rules: { ...doc.template.rules, sign: false } } }, id => names[id]))
      .toEqual({ label: 'Draft', done: false })
  })

  it('the PIC approving them: not sent, waiting for them — or for the other of two — sent back, approved, started before', () => {
    const pm: TaskPicMinutes = { status: 'minutes', pic: 'Kelvin', whatsapp: '012-345 6789', pic2: '', whatsapp2: '', link: null, link2: null, sentAt: null,
      reply: null, override: null, ok: null, edited: null }
    const unsigned = { ...doc, template: { ...doc.template, rules: { ...doc.template.rules, sign: false } } }
    const both = { ...unsigned, template: { ...unsigned.template, rules: { ...unsigned.template.rules, picAll: true } } }
    const name = (id: string) => names[id]
    expect(minutesState(doc, name, pm)).toEqual({ label: 'Waiting for Ali, Siti to sign', done: false })
    expect(minutesState(unsigned, name, pm)).toEqual({ label: 'Not sent to the PIC yet', done: false })
    expect(minutesState({ ...unsigned, status: 'sent' }, name, { ...pm, status: 'waiting_pic' })).toEqual({ label: 'Waiting for Kelvin (PIC)', done: false })
    expect(minutesState({ ...both, status: 'sent' }, name, { ...pm, status: 'waiting_pic', pic2: 'Hana', ok: { 1: { name: 'Kelvin Tan', at: null } } }))
      .toEqual({ label: 'Waiting for Hana (PIC) · Kelvin Tan approved', done: false })
    expect(minutesState({ ...unsigned, status: 'sent' }, name, { ...pm, status: 'changes', reply: { decision: 'changes', name: 'Kelvin Tan', reason: 'x', at: null, pic: 1 } }))
      .toEqual({ label: 'Changes requested by Kelvin Tan (PIC)', done: false, red: true })
    expect(minutesState({ ...unsigned, status: 'completed', locked: true }, name, { ...pm, status: 'active', reply: { decision: 'approved', name: 'Kelvin Tan', reason: '', at: null, pic: 1 } }))
      .toEqual({ label: 'Approved by Kelvin Tan via link · locked', done: true })
    expect(minutesState({ ...unsigned, status: 'sent' }, name, { ...pm, status: 'active', override: { by: 'SIA', at: null, reason: 'phone' } }))
      .toEqual({ label: 'Started before PIC approval', done: false })
  })
})
