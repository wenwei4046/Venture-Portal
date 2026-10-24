import { describe, expect, it } from 'vitest'
import { missingWork, moveStage, removeStage, stageDates, stageProblems, stagesPayload, starterStages, type DraftStage } from './tasks'
import { defaultRule, periodText, recurDays, recurPreview, ruleFromRow, rulePayload, ruleText, type RecurRule } from './recur'

// The same days and the same needs the database reckons (tests/member-sql/validate-marketing-tasks.mjs holds
// mkt_stage_dates, mkt_recur_days and mkt_stage_missing to these answers too).

const none = new Set<string>()
const rows = (d: ReturnType<typeof stageDates>) => d.map(x => [x.idx, x.startsOn, x.dueOn])

describe('stage dates: working days after the one before', () => {
  it('a Friday start: a one-day stage is due Monday, the next starts Tuesday', () => {
    expect(rows(stageDates('2027-01-08', [1, 2], none))).toEqual([[0, '2027-01-08', '2027-01-11'], [1, '2027-01-12', '2027-01-13']])
  })
  it('steps over HR’s holidays', () => {
    expect(rows(stageDates('2027-01-08', [1, 2], new Set(['2027-01-11'])))).toEqual([[0, '2027-01-08', '2027-01-12'], [1, '2027-01-13', '2027-01-14']])
  })
  it('a Saturday start counts from Monday', () => {
    expect(rows(stageDates('2027-01-09', [3], new Set(['2027-01-11'])))).toEqual([[0, '2027-01-09', '2027-01-14']])
  })
})

describe('a recurring rule’s days', () => {
  const rule = (r: Partial<RecurRule>): RecurRule => ({ ...defaultRule('2026-11-02'), ...r })
  it('every 2 weeks on Monday and Wednesday, weeks counted from the start’s', () => {
    expect(recurDays(rule({ freq: 'weekly', days: [1, 3], every: 2, start: '2026-11-02', endMode: 'date', end: '2026-11-30' }), '2028-12-31'))
      .toEqual(['2026-11-02', '2026-11-04', '2026-11-16', '2026-11-18', '2026-11-30'])
  })
  it('every Friday, three runs', () => {
    expect(recurDays(rule({ freq: 'weekly', days: [5], every: 1, start: '2026-11-02', endMode: 'count', count: 3 }), '2028-12-31'))
      .toEqual(['2026-11-06', '2026-11-13', '2026-11-20'])
  })
  it('the last day of each month; the 15th after a start past it', () => {
    expect(recurDays(rule({ freq: 'monthly', mday: 'last', start: '2027-01-15', endMode: 'count', count: 3 }), '2028-12-31'))
      .toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
    expect(recurDays(rule({ freq: 'monthly', mday: '15', start: '2026-11-16', endMode: 'count', count: 2 }), '2028-12-31')).toEqual(['2026-12-15', '2027-01-15'])
  })
  it('every day, up to the day asked, at most so many', () => {
    expect(recurDays(rule({ freq: 'daily', start: '2026-11-01', endMode: 'never' }), '2026-11-10')).toHaveLength(10)
    expect(recurDays(rule({ freq: 'daily', start: '2026-11-01', endMode: 'date', end: '2026-11-03' }), '2026-11-10', 2)).toEqual(['2026-11-01', '2026-11-02'])
  })
  it('says itself in words', () => {
    expect(ruleText(rule({ freq: 'weekly', days: [3, 1], every: 1 }))).toBe('Every week on Monday, Wednesday')
    expect(ruleText(rule({ freq: 'weekly', days: [5], every: 2 }))).toBe('Every 2 weeks on Friday')
    expect(ruleText(rule({ freq: 'monthly', mday: 'last' }))).toBe('Every month on the last day')
    expect(ruleText(rule({ freq: 'daily' }))).toBe('Every day')
    expect(periodText(rule({ start: '2026-11-02', endMode: 'date', end: '2027-01-31' }))).toBe('2 Nov 2026 → 31 Jan 2027')
    expect(periodText(rule({ start: '2026-11-02', endMode: 'count', count: 12 }))).toBe('from 2 Nov 2026 · 12 runs')
    expect(periodText(rule({ start: '2026-11-02', endMode: 'never' }))).toBe('from 2 Nov 2026 · no end date')
  })
  it('previews six runs and what comes after', () => {
    const p = recurPreview(rule({ freq: 'weekly', days: [1], every: 1, start: '2026-11-02', endMode: 'count', count: 8 }))
    expect([p.ok, p.count, p.first.length, p.first[0], p.more]).toEqual([true, '8 runs', 6, 'Mon 2 Nov', '+2 more · last Mon 21 Dec'])
    expect(recurPreview(rule({ freq: 'weekly', days: [], start: '2026-11-02' })).ok).toBe(false)
    expect(recurPreview(rule({ freq: 'daily', endMode: 'never' })).count).toBe('Runs until you end it')
  })
  it('goes to the database as it takes it, and back', () => {
    const r = rule({ freq: 'weekly', days: [5, 1], every: 2, start: '2026-11-02', endMode: 'count', count: 4 })
    expect(rulePayload(r)).toEqual({ freq: 'weekly', start: '2026-11-02', endMode: 'count', days: [1, 5], every: 2, count: 4 })
    expect(ruleFromRow({ ...rulePayload(r), start: '2026-11-02' })).toMatchObject({ freq: 'weekly', days: [1, 5], every: 2, endMode: 'count', count: 4 })
    expect(ruleFromRow({ freq: 'hourly' })).toBeNull()
  })
  it('starts from today, every Monday, to the end of the third month on', () => {
    expect(defaultRule('2026-10-23')).toMatchObject({ freq: 'weekly', days: [1], start: '2026-10-23', endMode: 'date', end: '2026-12-31' })
  })
})

describe('what a stage still needs', () => {
  const FORM = [
    { label: 'Post link', type: 'Text' as const }, { label: 'Checked', type: 'Checkbox' as const },
    { label: 'Read me', type: 'Note' as const }, { label: 'Items', type: 'Table' as const, cols: [{ name: 'Item', type: 'Text' as const }] },
  ]
  it('each field not filled in — a note and a table not asked for', () => {
    expect(missingWork(FORM, { notes: '', links: [], vals: {}, files: [] })).toEqual(['Post link', 'Checked'])
    expect(missingWork(FORM, { notes: '', links: [], vals: { 'Post link': '  ', Checked: false }, files: [] })).toEqual(['Post link', 'Checked'])
    expect(missingWork(FORM, { notes: '', links: [], vals: { 'Post link': 'https://x', Checked: true }, files: [] })).toEqual([])
  })
  const FILE = (field: string | null) => ({ path: 'stage/x/a.png', name: 'a.png', size: 1, mime: 'image/png', field, by: 'Ali', at: null })
  it('a File field: a link or a file of its own (②b-2e)', () => {
    const form = [{ label: 'Final image', type: 'File' as const }]
    expect(missingWork(form, { notes: '', links: [], vals: {}, files: [] })).toEqual(['Final image'])
    expect(missingWork(form, { notes: '', links: [], vals: {}, files: [FILE(null)] })).toEqual(['Final image'])
    expect(missingWork(form, { notes: '', links: [], vals: {}, files: [FILE('Final image')] })).toEqual([])
    expect(missingWork(form, { notes: '', links: [], vals: { 'Final image': 'https://drive.google.com/x' }, files: [] })).toEqual([])
  })
  it('a stage with no field: a note, a file or a link', () => {
    expect(missingWork([], { notes: '', links: [], vals: {}, files: [] })).toEqual(['a note, a file or a link'])
    expect(missingWork([], { notes: '', links: [{ url: 'https://x', label: '' }], vals: {}, files: [] })).toEqual([])
    expect(missingWork([], { notes: '', links: [], vals: {}, files: [FILE(null)] })).toEqual([])
  })
})

describe('the stage form', () => {
  const ME = { id: 'me', group: 'SOCIAL MEDIA SPECIALIST' }
  const three = (): DraftStage[] => starterStages(ME, 'boss').map((s, i) => ({ ...s, who: s.who ?? `p${i}` }))

  it('starts from the handoff’s quick template: my first draft, a redesign I approve that comes back to it, the publishing', () => {
    const s = starterStages(ME, 'boss')
    expect(s.map(x => [x.name, x.who, x.appr, x.back])).toEqual([['First draft', 'me', [], null], ['Redesign', null, ['boss'], 0], ['Publish', null, [], null]])
    // Each stage's group is its person's People title (2026-10-24): mine for the first, none until somebody is picked.
    expect(s.map(x => x.dept)).toEqual(['SOCIAL MEDIA SPECIALIST', '', ''])
    expect(starterStages(null, null)[0]).toMatchObject({ who: null, dept: '' })
    expect(stageProblems(s)).toEqual(['A stage has no person'])
  })
  it('where changes go back to follows a move, and forgets a stage taken out', () => {
    const s = three()
    const moved = moveStage(s, 0, 2) // First draft to the end: Redesign's "back to First draft" is no longer earlier
    expect(moved.map(x => [x.name, x.back])).toEqual([['Redesign', null], ['Publish', null], ['First draft', null]])
    const kept = moveStage(s, 2, 0) // Publish to the front: Redesign still goes back to First draft, now the second
    expect(kept.map(x => [x.name, x.back])).toEqual([['Publish', null], ['First draft', null], ['Redesign', 1]])
    expect(removeStage(s, 0).map(x => [x.name, x.back])).toEqual([['Redesign', null], ['Publish', null]])
  })
  it('asks a name for each field, once', () => {
    const s = three()
    s[0].form = [{ label: 'A', type: 'Text' }, { label: 'A', type: 'Date' }]
    expect(stageProblems(s)).toEqual(['Each field needs its own name'])
  })
  it('goes to the database clean', () => {
    const s = three()
    s[0].name = '  First draft  '
    s[0].sla = 99
    expect(stagesPayload(s)[0]).toEqual({ name: 'First draft', dept: 'SOCIAL MEDIA SPECIALIST', who: 'me', sla: 30, appr: [],
      form: [{ label: 'Canva template link', type: 'Text' }, { label: 'Draft notes', type: 'Text' }], back: null })
  })
})
