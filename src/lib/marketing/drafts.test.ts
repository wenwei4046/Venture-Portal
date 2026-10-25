import { describe, expect, it } from 'vitest'
import { draftHref, draftLine, draftOf, draftsFromRow, formFromDraft, openDraftFromRow, rowOf, worthKeeping, type NewForm } from './drafts'
import { defaultRule } from './recur'

// 2026-10-25 — New Project kept as a draft while it is typed (mig 20261025211000; the user: "一有输入就会自动进 draft（草稿）
// 那边，这样的话内容就不会丢了"). The database's side is tests/member-sql/validate-marketing-new-drafts.mjs.

const STAGES = [
  { key: 'a', name: 'First draft', dept: 'GRAPHIC DESIGNER', who: 's1', sla: 1, appr: [], back: null, form: [{ label: 'Canva link', type: 'Text' as const }] },
  { key: 'b', name: 'Publish', dept: '', who: null, sla: 2, appr: ['s9'], back: 0, form: [] },
]
const BLANK: NewForm = {
  sub: 'sub-car', mode: 'task', product: 'pr-a', amounts: {}, title: '', type: 'social', req: 'write', brief: '',
  minutes: { template: '', vals: {}, notes: '', sign: false, pic: { on: false, name: '', whatsapp: '', name2: '', whatsapp2: '' } }, rule: defaultRule('2026-10-25'),
  stages: STAGES, source: null,
}

describe('a draft read back', () => {
  it('the list: each draft’s kind, title, subsidiary, product, count and when — what it cannot read left out', () => {
    expect(draftsFromRow([
      { id: 'd1', rev: 3, mode: 'recurring', title: ' Weekly reel ', sub: 'sub-car', product: null, updatedAt: '2026-10-25T05:00:00Z' },
      { id: 'd2', rev: 'x', mode: 'nonsense', title: null, sub: '', product: 'pr-a' },
      { rev: 1 },
      'junk',
    ])).toEqual([
      { id: 'd1', rev: 3, mode: 'recurring', title: 'Weekly reel', sub: 'sub-car', product: null, updatedAt: '2026-10-25T05:00:00Z' },
      { id: 'd2', rev: 1, mode: null, title: '', sub: null, product: 'pr-a', updatedAt: '' },
    ])
    expect(draftsFromRow(null)).toEqual([])
  })

  it('one opened: its id, count, form and when — none when it is not there', () => {
    expect(openDraftFromRow({ id: 'd1', rev: 2, data: { title: 'x' }, updatedAt: '2026-10-25T05:00:00Z' }))
      .toEqual({ id: 'd1', rev: 2, data: { title: 'x' }, at: '2026-10-25T05:00:00Z' })
    expect(openDraftFromRow(null)).toBeNull()
    expect(openDraftFromRow({ rev: 2 })).toBeNull()
  })
})

describe('the form a draft keeps', () => {
  it('kept whole and put back as it was', () => {
    const form: NewForm = { ...BLANK, mode: 'recurring', title: 'Weekly reel', brief: 'Every Monday', type: 'content', amounts: { 'pr-a': 2500 },
      rule: { ...BLANK.rule, freq: 'monthly', mday: '15' }, source: { id: 'p0', trackId: 'TSK-CAR-2610-004', title: 'Banner' } }
    const back = formFromDraft(JSON.parse(JSON.stringify(draftOf(form))), BLANK)
    expect({ ...back, stages: back.stages.map(({ key: _k, ...x }) => x) }).toEqual({ ...form, stages: form.stages.map(({ key: _k, ...x }) => x) })
    expect(draftOf(form).v).toBe(1)
  })

  it('what it does not hold, or holds in a shape it cannot take, stays as the blank form has it', () => {
    const back = formFromDraft({ mode: 'nonsense', sub: 7, type: 'poetry', rule: { freq: 'hourly' }, stages: 'none', amounts: { a: -5, b: 'x', c: null, d: 120 } }, BLANK)
    expect(back.mode).toBe('task')
    expect(back.sub).toBe('sub-car')
    expect(back.type).toBe('social')
    expect(back.rule).toEqual(BLANK.rule)
    expect(back.stages).toBe(BLANK.stages)
    expect(back.amounts).toEqual({ c: null, d: 120 })
    expect(formFromDraft('junk', BLANK)).toBe(BLANK)
  })

  it('a stage put back: its days 1–30, three approvers at most, where changes go back to always an earlier stage', () => {
    const back = formFromDraft({ stages: [
      { name: 'Design', who: 's1', sla: 99, appr: ['a', 'b', 'c', 'd'], back: 0, form: [{ label: 'Link', type: 'Text' }, { label: 'x', type: 'Nonsense' }] },
      { name: 'Post', who: '', sla: 0, back: 1 },
      { name: 'Check', sla: 2, back: 0 },
    ] }, BLANK)
    expect(back.stages.map(({ key: _k, ...x }) => x)).toEqual([
      { name: 'Design', dept: '', who: 's1', sla: 30, appr: ['a', 'b', 'c'], back: null, form: [{ label: 'Link', type: 'Text' }] },
      { name: 'Post', dept: '', who: null, sla: 1, appr: [], back: null, form: [] },
      { name: 'Check', dept: '', who: null, sla: 2, appr: [], back: 0, form: [] },
    ])
    expect(new Set(back.stages.map(x => x.key)).size).toBe(3)
  })

  it('where it was opened from: kept, taken off (× — null), or the page’s own when the draft says nothing', () => {
    const from = { id: 'p0', trackId: 'TSK-CAR-2610-004', title: 'Banner' }
    expect(formFromDraft({ source: from }, BLANK).source).toEqual(from)
    expect(formFromDraft({ source: null }, { ...BLANK, source: from }).source).toBeNull()
    expect(formFromDraft({}, { ...BLANK, source: from }).source).toEqual(from)
    expect(formFromDraft({ source: { id: 'p0' } }, BLANK).source).toBeNull()
  })
})

describe('whether there is anything to keep', () => {
  it('nothing typed: picking who it is for, what is being started or a product keeps nothing', () => {
    expect(worthKeeping(BLANK, BLANK)).toBe(false)
    expect(worthKeeping({ ...BLANK, sub: 'sub-mvs', mode: 'product', product: 'pr-b', type: 'ads' }, BLANK)).toBe(false)
    expect(worthKeeping({ ...BLANK, title: '   ' }, BLANK)).toBe(false)
    // The starter stages as they came, under fresh keys.
    expect(worthKeeping({ ...BLANK, stages: STAGES.map(x => ({ ...x, key: `${x.key}2` })) }, BLANK)).toBe(false)
    // A repeat changed counts only on a recurring task.
    expect(worthKeeping({ ...BLANK, rule: { ...BLANK.rule, freq: 'daily' } }, BLANK)).toBe(false)
  })

  it('a title, what needs to be done, an amount, the repeat on a recurring task, the stages changed', () => {
    expect(worthKeeping({ ...BLANK, title: 'R' }, BLANK)).toBe(true)
    expect(worthKeeping({ ...BLANK, brief: 'x' }, BLANK)).toBe(true)
    expect(worthKeeping({ ...BLANK, mode: 'product', amounts: { 'pr-a': null } }, BLANK)).toBe(true)
    expect(worthKeeping({ ...BLANK, mode: 'recurring', rule: { ...BLANK.rule, freq: 'daily' } }, BLANK)).toBe(true)
    expect(worthKeeping({ ...BLANK, stages: [{ ...STAGES[0], sla: 3 }, STAGES[1]] }, BLANK)).toBe(true)
    expect(worthKeeping({ ...BLANK, stages: [STAGES[0]] }, BLANK)).toBe(true)
  })
})

describe('a draft on the list', () => {
  const subs = [{ id: 'sub-car', name: 'Carres' }]
  const products = [{ id: 'pr-a', name: 'Social Media Package A' }]
  const row = { id: 'd1', rev: 1, mode: 'task' as const, title: 'Raya banner', sub: 'sub-car', product: null, updatedAt: '2026-10-25T05:07:00Z' }

  it('its kind’s icon, its title, for whom and when it was kept (the office’s time)', () => {
    expect(draftLine(row, subs, products)).toEqual({ icon: '⚡', name: 'Raya banner', meta: 'Carres · saved 25 Oct 13:07' })
  })

  it('no title: a product project’s product, else the kind’s Untitled', () => {
    expect(draftLine({ ...row, mode: 'product', title: '', product: 'pr-a' }, subs, products).name).toBe('Social Media Package A')
    expect(draftLine({ ...row, mode: 'product', title: '', product: 'pr-x' }, subs, products).name).toBe('Untitled product project')
    expect(draftLine({ ...row, mode: 'recurring', title: '' }, subs, null)).toMatchObject({ icon: '🔁', name: 'Untitled recurring task' })
    expect(draftLine({ ...row, mode: null, title: '', sub: 'gone', updatedAt: '' }, subs, products)).toEqual({ icon: '📝', name: 'Untitled', meta: '' })
  })

  it('the one open, put back on the list as its form stands', () => {
    expect(rowOf('d1', 4, { ...BLANK, title: ' Raya ' }, '2026-10-25T05:07:00Z'))
      .toEqual({ id: 'd1', rev: 4, mode: 'task', title: 'Raya', sub: 'sub-car', product: 'pr-a', updatedAt: '2026-10-25T05:07:00Z' })
  })
})

describe('the address of a draft', () => {
  it('names it — the rest of the query kept — or names none', () => {
    expect(draftHref('', 'd1')).toBe('/marketing/new?draft=d1')
    expect(draftHref('?from=TSK-CAR-2610-004&sub=CAR', 'd1')).toBe('/marketing/new?from=TSK-CAR-2610-004&sub=CAR&draft=d1')
    expect(draftHref('?draft=d0&add=1', 'd1')).toBe('/marketing/new?draft=d1&add=1')
    expect(draftHref('?draft=d1&add=1', null)).toBe('/marketing/new?add=1')
    expect(draftHref('?draft=d1', null)).toBe('/marketing/new')
  })
})
