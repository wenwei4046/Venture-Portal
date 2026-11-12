import { describe, expect, it } from 'vitest'
import { picPageFromRow, type PicPage } from './pic'
import { picFlowView, picSimple } from './pic-flow'

// 2026-11-13 — the PIC's link for a task (Workflow Builder 2a › PIC link view): the simpler page from mkt_pic_page.

const page = (work: Record<string, unknown>, over: Record<string, unknown> = {}) => picPageFromRow({
  today: '2026-11-12', sub: 'Carres', product: '', kind: 'quick', title: 'Raya visual', track: 'TSK-CAR-2611-007', status: 'active', minutes: null,
  work: [{ id: 't1', title: 'Raya visual', status: 'active', stages: 3, done: 1, dueOn: '2026-11-20', ...work }], ...over,
}) as PicPage

describe('the PIC’s simpler page', () => {
  it('is a task’s one piece of work with no minutes of theirs', () => {
    expect(picSimple(page({}))).toBe(true)
    expect(picSimple(page({}, { kind: 'product' }))).toBe(false)
  })
  it('waiting for them: their approval, the stage’s words; the steps; Coming soon where empty', () => {
    const p = page({ stage: { idx: 1, name: 'Design', status: 'review', ver: 2, waiting: true, note: 'Check the logo', fields: [{ name: 'Art', type: 'File', value: null }, { name: 'Size', type: 'Text', value: 'A4' }], links: [] } })
    const v = picFlowView(p, p.work[0])
    expect([v.tone, v.title, v.text, v.answer]).toEqual(['wait', 'Your approval is needed', 'Check the logo. Approve, or tell us what to change.', true])
    expect(v.steps.map(s => [s.name, s.state])).toEqual([['Step 1', 'done'], ['Design', 'cur'], ['Step 3', 'next']])
    expect(v.eta).toBe('Expected by 20 Nov')
    expect(v.secs[0].fields.map(f => f.text)).toEqual(['Coming soon', 'A4'])
  })
  it('not theirs yet: the stage’s words, no answer; done: ready', () => {
    const p = page({ stage: { idx: 1, name: 'Design', status: 'accepted', ver: 1, waiting: false, note: 'Design team is on it', fields: [], links: [] } })
    expect(picFlowView(p, p.work[0])).toMatchObject({ tone: 'calm', title: 'Design team is on it', answer: false })
    const d = page({ status: 'done', done: 3, stage: null })
    expect(picFlowView(d, d.work[0])).toMatchObject({ tone: 'done', eta: 'All steps done.' })
  })
})

// 2026-11-13 — what mkt_pic_page now gives: the stages' names, the finish (its words, the feedback window), the 👁 tables.
describe('the simpler page with the reader’s new parts', () => {
  it('names each step; shows a table they may see, Coming soon in an empty cell; done in the template’s words', () => {
    const p = page({ stageNames: ['Brief', 'Design', 'Final'], stage: { idx: 1, name: 'Design', status: 'accepted', ver: 1, waiting: false, note: 'Designing',
      fields: [{ name: 'Sizes', type: 'Table', value: { cols: ['Format', 'Done'], rows: [['Story', 'true'], ['Post', '']] } }], links: [] } })
    const v = picFlowView(p, p.work[0])
    expect(v.steps.map(s => s.name)).toEqual(['Brief', 'Design', 'Final'])
    expect(v.secs).toEqual([{ id: 't0', emoji: '▤', title: 'Sizes', fields: [], table: { cols: ['Format', 'Done'], cells: [
      [{ text: 'Story', filled: true }, { text: '✓', filled: true }], [{ text: 'Post', filled: true }, { text: 'Coming soon', filled: false }],
    ] } }])
    const d = page({ status: 'done', done: 3, stage: null, finish: { picText: 'Your raya visual is ready', celebration: 'confetti', feedbackUntil: '2026-11-18' } })
    expect(picFlowView(d, d.work[0])).toMatchObject({ title: 'Your raya visual is ready', text: 'All steps done. Send us your comments until 18 Nov.' })
  })
})
