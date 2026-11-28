import { describe, expect, it } from 'vitest'
import { taskFromRow, type MktTaskPage } from '@/lib/marketing/task'
import type { AppMay } from './model'
import { labelOf, missingWords, taskScreenView, workValue } from './task-view'

// The Marketing app's task page (2026-11-28, `Marketing App iOS + Android.dc.html` › the task page): one banner for
// whoever looks, the stage's fields — the doer's to fill in, everybody else's to read — and the bar's steps, on the
// desktop task page's own rules (lib/marketing/flow.ts, task-flow-view.ts).

const MAY: AppMay = { create: true, edit: true, decide: true, manage: false, space: true }
// Mon 26 Oct 2026, 12:00 in the office.
const NOW = new Date('2026-10-26T04:00:00Z')

const page = (me: string, stage: Record<string, unknown> = {}, stages: Record<string, unknown>[] = []) => taskFromRow({
  today: '2026-10-26', me,
  team: [
    { id: 's-rachel', user: 'u1', full: 'RACHEL TAN', first: 'Rachel', title: 'MARKETING MANAGER' },
    { id: 's-siti', user: 'u2', full: 'SITI AMINAH', first: 'Siti', title: 'GRAPHIC' },
  ],
  sub: { id: 'sub', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, pic: 'Kelvin' },
  project: { id: 'p1', trackId: 'TSK-CAR-2610-001', kind: 'quick', sub: 'sub', title: 'Price update', status: 'active', qType: 'social', owner: 's-rachel', cur: 0,
    startsOn: '2026-10-23', dueOn: '2026-10-30', free: [] },
  stages: [
    { project: 'p1', idx: 0, name: 'Design', dept: 'design', owner: 's-siti', sla: 2, appr: [{ kind: 'person', staff: 's-rachel' }],
      spec: { form: [{ label: 'Caption', type: 'Text' }, { label: 'Size', type: 'Text', req: false }] },
      work: { vals: { Size: 'A4' } }, dueOn: '2026-10-28', status: 'accepted', apprIdx: 0, ver: 1, enteredAt: '2026-10-23T01:00:00Z', ...stage },
    ...stages,
  ],
  events: [], holidays: [],
}) as MktTaskPage

describe('the doer, working their stage', () => {
  it('their banner, the fields to fill, Submit for approval naming who approves', () => {
    const v = taskScreenView(page('s-siti'), MAY, NOW)
    expect([v.kind, v.banner.tone, v.mine, v.submit, v.decide]).toEqual(['doer', 'me', true, 'Submit for approval', false])
    expect(v.fields.map(f => [f.label, f.edit, f.req, f.display])).toEqual([['Caption', true, true, expect.any(String)], ['Size', true, false, 'A4']])
    expect(v.fill).toEqual({ text: '0 of 1 filled', done: false })
    expect(v.nextLine).toBe('Next up: Rachel approves · told when you submit')
    expect(v.facts.map(f => `${f.k}: ${f.v}`)).toEqual(['Now with: Siti (you)', 'Subsidiary: Carres', expect.stringMatching(/^Stage due: /), 'Stage: 1 of 1'])
    expect([v.doer, v.approvers]).toEqual(['Siti', ['Rachel']])
    // The strip names the viewer's own stage *You*; the approver sees the doer's name.
    expect(v.strip.map(c => c.who)).toEqual(['You'])
    expect(taskScreenView(page('s-rachel', { status: 'review' }), MAY, NOW).strip.map(c => c.who)).toEqual(['Siti'])
  })

  it('what they typed counts before it is saved — and the toast names what is still empty', () => {
    expect(taskScreenView(page('s-siti'), MAY, NOW, { '0:Caption': 'New price' }).fill).toEqual({ text: 'All filled', done: true })
    expect(missingWords(page('s-siti'), {})).toEqual({ ids: ['0:Caption'], text: 'Fill in Caption' })
    expect(missingWords(page('s-siti'), { '0:Caption': 'New price' })).toBeNull()
  })

  it('without Marketing · Edit they read it: no inputs, no Submit', () => {
    const v = taskScreenView(page('s-siti'), { ...MAY, edit: false }, NOW)
    expect([v.submit, v.mine, v.fields.some(f => f.edit)]).toEqual([null, false, false])
  })

  it('Complete stage when nobody approves it, the last stage finishing the task', () => {
    const v = taskScreenView(page('s-siti', { appr: [] }), MAY, NOW)
    expect([v.submit, v.nextLine]).toEqual(['Complete stage', 'Last stage — this finishes the task'])
  })

  it('after changes were asked: the approver’s own words, quoted', () => {
    const v = taskScreenView(page('s-siti', { status: 'changes', changes: { by: 'Rachel', reason: 'Logo bigger', from: null } }), MAY, NOW)
    expect(v.banner).toEqual({ icon: '↩️', title: 'Rachel asked for changes', text: '“Logo bigger”', tone: 'late' })
    expect(v.submit).toBe('Submit for approval')
  })
})

describe('the approver whose turn it is', () => {
  it('Request changes + Approve; the doer is told either way; nothing to type', () => {
    const v = taskScreenView(page('s-rachel', { status: 'review' }), MAY, NOW)
    expect([v.kind, v.decide, v.submit, v.fields.some(f => f.edit)]).toEqual(['approver', true, null, false])
    expect(v.nextLine).toBe('Siti is told either way')
  })

  it('cannot decide without Approve or Edit', () => {
    expect(taskScreenView(page('s-rachel', { status: 'review' }), { ...MAY, decide: false }, NOW).decide).toBe(false)
  })
})

describe('a field’s value as the save takes it', () => {
  it('only what was typed; an emptied one as null', () => {
    expect([workValue('  '), workValue('x'), workValue([]), workValue(['a']), workValue(false), workValue(true)]).toEqual([null, 'x', null, ['a'], false, true])
    expect([labelOf('0:Caption'), labelOf('2:Size: W')]).toEqual(['Caption', 'Size: W'])
  })
})
