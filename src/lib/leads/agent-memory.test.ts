import { describe, expect, it } from 'vitest'
import { DEFAULT_ORDER, learnOf, linesFor, memoryMeta, moveSource, orderedPrompt, questionNotes, rateOf, readEntries, type MemoryLine } from './agent-memory'

const line = (p: Partial<MemoryLine>): MemoryLine => ({ id: 'x', kind: 'fixed', outletId: null, body: 'Rule', status: 'on', dir: null, source: '', cases: 0,
  addedByName: 'Mei Ling', createdAt: '2026-10-02T03:00:00Z', chats: 0, reached: 0, ...p })

// Lead View v3 § 5: Memory, the reading order, and what the AI is given in it.
describe('How it learns', () => {
  it('reads the saved settings safely: every source once, Fixed memory never off, the brand’s own after', () => {
    const l = learnOf({ order: ['col', 'fixed', 'nope'], off: { fixed: true, faq: true, nope: true }, custom: [{ id: 'cx1', name: 'Stock', text: 'Read today’s stock' }], min: 0, forget: '30' })
    expect(l.order).toEqual(['col', 'fixed', ...DEFAULT_ORDER.filter(k => k !== 'col' && k !== 'fixed'), 'cx1'])
    expect([l.off, l.min, l.forget, l.newL, l.share]).toEqual([{ faq: true }, 1, '30', 'ask', true])
    const e = readEntries(l)
    expect(e.find(x => x.id === 'faq')!.on).toBe(false)
    expect(e.at(-1)).toMatchObject({ id: 'cx1', title: 'Stock', mine: true, on: true })
  })
  it('moves a source one place, not past either end', () => {
    const l = learnOf({})
    expect(moveSource(l, 'how', -1).order.slice(0, 2)).toEqual(['how', 'fixed'])
    expect(moveSource(l, 'fixed', -1)).toBe(l)
  })
})

describe('the figures', () => {
  it('green from 45%, rust under 30%, measuring under the minimum', () => {
    expect(rateOf({ chats: 212, reached: 123 }, 5)).toEqual({ text: '58% reached · 212 chats', tone: 'pos' })
    expect(rateOf({ chats: 44, reached: 14 }, 5)).toEqual({ text: '32% reached · 44 chats', tone: 'mid' })
    expect(rateOf({ chats: 37, reached: 8 }, 5).tone).toBe('low')
    expect(rateOf({ chats: 4, reached: 4 }, 5)).toEqual({ text: 'New · measuring', tone: 'new' })
  })
  it('says who added a line, or where a lesson came from', () => {
    expect(memoryMeta(line({}))).toBe('Added by Mei Ling · 2 Oct')
    expect(memoryMeta(line({ kind: 'collected', source: 'Its own chats', cases: 12, createdAt: '2026-10-18T01:00:00Z' }))).toBe('Its own chats · based on 12 chats that reached the goal · 18 Oct')
  })
})

describe('what the AI is given', () => {
  const mem = [line({ id: 'f', body: 'Never discount' }), line({ id: 'g', kind: 'goal', body: 'Answer first' }), line({ id: 'o1', kind: 'outlet', outletId: 'kj', body: 'Free parking' }),
    line({ id: 'o2', kind: 'outlet', outletId: 'pj', body: 'Closed Mondays' }), line({ id: 'c1', kind: 'collected', status: 'on', dir: 'up', body: 'Ask seats first' }),
    line({ id: 'c2', kind: 'collected', status: 'review', body: 'Not yet' })]
  it('this chat’s outlet only; collected lessons in use only', () => {
    expect(linesFor(mem, 'kj').map(m => m.id)).toEqual(['f', 'g', 'o1', 'c1'])
    expect(linesFor(mem, null).map(m => m.id)).toEqual(['f', 'g', 'c1'])
  })
  it('every source in the brand’s order, numbered, one switched off left out, the higher one winning', () => {
    const l = learnOf({ order: ['how', 'fixed'], off: { col: true } })
    const p = orderedPrompt(l, { howGoal: 'Get the phone after two messages.', memory: mem, outletId: 'kj', outletName: 'Kelana Jaya', answers: '# Fixed answers\n…' })
    expect(p.indexOf('## 1. How to reach the goal')).toBeLessThan(p.indexOf('## 2. Fixed memory'))
    expect(p).toContain('when two disagree, the one higher in this list wins')
    expect(p).toContain('<rule id="mem-o1">Free parking</rule>')
    expect(p).not.toContain('Closed Mondays')
    expect(p).not.toContain('Ask seats first')
    expect(p).not.toContain('Earlier chats')
  })
  it('a file’s question instructions, its folders’ too', () => {
    const qs = [{ kind: 'file' as const, ref: 'a', question: 'In stock?', instruction: 'Say Kelana Jaya has it.', custom: false },
      { kind: 'folder' as const, ref: 'sofa', question: 'Warranty?', instruction: '5 years on the frame.', custom: true },
      { kind: 'file' as const, ref: 'b', question: 'Other', instruction: 'x', custom: false }]
    expect(questionNotes(qs, ['a', 'sofa'])).toEqual(['When asked "In stock?": Say Kelana Jaya has it.', 'When asked "Warranty?": 5 years on the frame.'])
  })
})
