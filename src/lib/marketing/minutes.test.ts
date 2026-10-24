import { describe, expect, it } from 'vitest'
import {
  addMinutesField, colTypeOf, minutesFieldsPayload, minutesPatch, minutesProblems, minutesSummary, minutesTemplatesFromRow, minutesWarnings,
  newMinutesFields, newMinutesName, NEW_RULES, ONCE_TYPES, type MinutesField,
} from './minutes'

// 2026-10-23 — the Minutes Builder (`Minutes Builder.dc.html`, ③ of the handoff): what the builder reads, sums up,
// warns of and refuses, held to what mkt_minutes_check refuses on publishing (tests/member-sql/validate-marketing-minutes.mjs).

const row = {
  templates: [
    { id: 't1', name: 'Kickoff', rev: 3, version: 2, changed: false, publishedBy: 'Sia Josiah',
      fields: [
        { name: 'Project (from Projects)', type: 'Project link', req: true, pic: true, lock: true },
        { name: 'Attendees', type: 'People', req: true, pic: true, lock: true },
        { name: 'Shot list', type: 'Table', req: false, pic: false, cols: [{ name: 'Shot', type: 'Text' }, { name: 'Due', type: 'Nonsense' }] },
        { name: 'Odd', type: 'Video' },
      ],
      rules: { sign: true, pic: 'yes', project: true } },
  ],
}

const field = (over: Partial<MinutesField>): MinutesField => ({ key: 'k', name: 'Notes', type: 'Short text', req: false, pic: true, lock: false, ...over })

describe('what the builder reads', () => {
  const [t] = minutesTemplatesFromRow(row)

  it('each template with its fields, rules, version and draft', () => {
    expect([t.id, t.name, t.rev, t.version, t.changed, t.publishedBy]).toEqual(['t1', 'Kickoff', 3, 2, false, 'Sia Josiah'])
    expect(t.fields.map(f => f.name)).toEqual(['Project (from Projects)', 'Attendees', 'Shot list']) // a kind it cannot hold is left out
    expect(t.fields[2].cols).toEqual([{ name: 'Shot', type: 'Text' }, { name: 'Due', type: 'Date' }])
    expect(t.rules).toEqual({ sign: true, pic: false, picAll: false, project: true, file: false, lock: false })
    // Both PICs sign off only where a PIC signs off (②b-2d-2b — the user's answer 29).
    expect([minutesTemplatesFromRow({ templates: [{ id: 'a', rules: { pic: true, picAll: true } }] })[0].rules.picAll,
      minutesTemplatesFromRow({ templates: [{ id: 'b', rules: { pic: false, picAll: true } }] })[0].rules.picAll]).toEqual([true, false])
  })

  it('reads nothing as no templates', () => {
    expect(minutesTemplatesFromRow(null)).toEqual([])
  })
})

describe('making a template', () => {
  it('starts with the project, the meeting’s date, the attendees and the signatures — the project and the attendees locked', () => {
    const f = newMinutesFields()
    expect(f.map(x => [x.name, x.type, x.lock])).toEqual([
      ['Project (from Projects)', 'Project link', true], ['Meeting date', 'Date', false], ['Attendees', 'People', true], ['Signatures', 'Signature', false],
    ])
    expect(NEW_RULES).toEqual({ sign: false, pic: false, picAll: false, project: true, file: true, lock: true })
  })

  it('is named “New minutes”, then “New minutes 2”', () => {
    expect(newMinutesName([])).toBe('New minutes')
    expect(newMinutesName(['new minutes', 'New minutes 2'])).toBe('New minutes 3')
  })

  it('adds a field before the signatures; a table with three columns', () => {
    const f = addMinutesField(newMinutesFields(), ' Objective ', 'Long text')
    expect(f.map(x => x.name)).toEqual(['Project (from Projects)', 'Meeting date', 'Attendees', 'Objective', 'Signatures'])
    const t = addMinutesField(f, 'Plan', 'Table')
    expect(t[4].cols?.map(c => c.name)).toEqual(['Item', 'Details', 'Owner'])
  })

  it('a column named for a day is a date', () => {
    expect(colTypeOf(undefined, 'Due date')).toBe('Date')
    expect(colTypeOf(undefined, 'Owner')).toBe('Text')
    expect(colTypeOf('Person', 'Deadline')).toBe('Person')
  })
})

describe('the foot', () => {
  const base = newMinutesFields()

  it('sums up what it asks', () => {
    expect(minutesSummary(base)).toBe('4 fields · 4 required · 4 visible to PIC')
  })

  it('warns as the handoff does', () => {
    expect(minutesWarnings(base.filter(f => f.type !== 'Signature'), { ...NEW_RULES, sign: true })).toEqual(['“Every attendee signs” is on, but there is no Signatures field'])
    expect(minutesWarnings(base, { ...NEW_RULES, pic: true })).toEqual(['PIC signs off but can’t see any content field'])
    expect(minutesWarnings([...base, field({ name: 'Decisions', type: 'Long text' })], { ...NEW_RULES, pic: true })).toEqual([])
  })

  it('refuses to publish what the database would', () => {
    expect(minutesProblems(base)).toEqual([])
    expect(minutesProblems([...base, field({ name: ' ' })])).toEqual(['A field has no name'])
    expect(minutesProblems([...base, field({ name: 'Notes' }), field({ name: 'notes' })])).toEqual(['Two fields share a name'])
    expect(minutesProblems([...base, field({ name: 'Plan', type: 'Table', cols: [{ name: '', type: 'Text' }] })])).toEqual(['A table column has no name'])
    expect(minutesProblems(base.filter(f => f.type !== 'Project link'))).toEqual(['Minutes keep their project and attendees'])
  })
})

describe('only what changed is saved', () => {
  const now = { name: 'Kickoff', fields: newMinutesFields(), rules: NEW_RULES }

  it('nothing changed: nothing to send — the page’s keys are not the template', () => {
    expect(minutesPatch(now, { ...now, fields: now.fields.map(f => ({ ...f, key: 'other' })) })).toBeNull()
  })

  it('each part on its own', () => {
    expect(minutesPatch(now, { ...now, name: 'Kick-off' })).toEqual({ name: 'Kick-off' })
    expect(minutesPatch(now, { ...now, rules: { ...NEW_RULES, sign: true } })).toEqual({ rules: { ...NEW_RULES, sign: true } })
    const fields = now.fields.map((f, i) => (i === 1 ? { ...f, pic: false } : f))
    expect(minutesPatch(now, { ...now, fields })).toEqual({ fields: minutesFieldsPayload(fields) })
  })

  it('a locked field is sent required', () => {
    expect(minutesFieldsPayload([field({ type: 'People', lock: true, req: false })])[0]).toMatchObject({ req: true, lock: true })
  })
})

// 2026-10-24 — ④-2b: a campaign's run period, a kind of its own (the user's answer 13), kept once.
describe('a campaign period', () => {
  it('is added once, refused twice, and is no content for the PIC', () => {
    expect(ONCE_TYPES).toEqual(['Project link', 'Campaign period'])
    const base = newMinutesFields()
    const one = addMinutesField(base, 'Campaign period', 'Campaign period')
    expect(one.find(f => f.type === 'Campaign period')).toMatchObject({ name: 'Campaign period', req: false, pic: true })
    expect(minutesProblems(one)).toEqual([])
    expect(minutesProblems(addMinutesField(one, 'Another', 'Campaign period'))).toEqual(['Minutes keep one campaign period'])
    expect(minutesWarnings(one, { ...NEW_RULES, pic: true })).toEqual(['PIC signs off but can’t see any content field'])
    expect(minutesFieldsPayload(one).find(f => f.type === 'Campaign period')).toEqual({ name: 'Campaign period', type: 'Campaign period', req: false, pic: true, lock: false })
  })
})
