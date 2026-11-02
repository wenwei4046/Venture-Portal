import { describe, expect, it } from 'vitest'
import type { TemplateStep } from './template'
import { NODE, edgePath, extOf, layoutColumns, mapPlaced, mapRows, nodeHeight, placesHold, rowPort, sizeLabel, typeOf } from './template-map'

const q = (id: string, nexts: string[]): TemplateStep => ({ id, kind: 'question', text: 'Pick', buttons: nexts.map((n, i) => ({ label: `O${i}`, next: n })) })
const m = (id: string, next = '', kind: TemplateStep['kind'] = 'message'): TemplateStep => ({ id, kind, text: 'Hi', next })

describe('the reference’s step types', () => {
  it('names the runner’s kinds as the reference does', () => {
    expect(['question', 'text', 'phone', 'message', 'handoff', 'ai'].map(k => typeOf(k as TemplateStep['kind']).label))
      .toEqual(['Buttons', 'Types an answer', 'Gives a phone', 'Send a file', 'Hand to a person', 'AI Agent'])
  })
  it('gives options rows to Buttons, none to a person or the AI, Then to the rest', () => {
    expect(mapRows(q('a', ['b', '']))).toEqual([{ slot: 0, label: 'O0', to: 'b', edit: true }, { slot: 1, label: 'O1', to: '', edit: true }])
    expect(mapRows(m('a', '', 'handoff'))).toEqual([])
    expect(mapRows(m('a', 'b', 'phone'))).toEqual([{ slot: 'next', label: 'Then', to: 'b', edit: false }])
  })
  it('sizes a node as nodeH does', () => {
    expect(nodeHeight(q('a', ['', '', '']))).toBe(2 + 40 + 62 + 3 * 30 + 30 + 6)
    expect(nodeHeight(m('a', '', 'ai'))).toBe(2 + 40 + 62 + 6)
    expect(nodeHeight(m('a'))).toBe(2 + 40 + 62 + 30 + 6)
  })
})

describe('the map’s columns', () => {
  const steps = [q('w', ['s', 't', 'p']), q('s', ['ph']), q('t', ['ph']), m('ph', 'cat', 'phone'), m('cat', 'p'), m('p', '', 'handoff')]
  it('puts each step in the column of its longest way from the first, stacked from the top', () => {
    const at = layoutColumns(steps)
    expect(at.w).toEqual({ x: 40, y: 40 })
    expect([at.s.x, at.t.x]).toEqual([360, 360])
    expect(at.t.y).toBe(40 + nodeHeight(steps[1]) + 40)
    expect(at.ph.x).toBe(680)
    expect(at.cat.x).toBe(1000)
    expect(at.p.x).toBe(1320)
  })
  it('keeps kept places only when every step has one and none overlap', () => {
    expect(placesHold(steps)).toBe(false)
    const laid = mapPlaced(steps)
    expect(placesHold(laid)).toBe(true)
    expect(mapPlaced(laid)).toBe(laid)
    const clash = laid.map((s, i) => (i === 1 ? { ...s, pos: { ...laid[0].pos! } } : s))
    expect(placesHold(clash)).toBe(false)
  })
  it('leaves a row from the node’s right, at the row’s middle', () => {
    const [w] = mapPlaced(steps)
    expect(rowPort(w, 1)).toEqual({ x: 40 + NODE.w, y: 40 + 1 + 40 + 62 + 30 + 15 })
  })
})

describe('the line', () => {
  it('goes out, turns with rounded corners and comes in', () => {
    expect(edgePath(0, 0, 100, 40)).toBe('M0,0 L20,0 Q28,0 28,8 L28,32 Q28,40 36,40 L100,40')
    // A straight line keeps the reference's flat corner at the turn point.
    expect(edgePath(0, 0, 100, 0)).toBe('M0,0 L20,0 Q28,0 36,0 L100,0')
  })
  it('goes round the back when the target is behind', () => {
    expect(edgePath(100, 0, 0, 100).startsWith('M100,0 L120,0 Q128,0 128,8')).toBe(true)
  })
})

describe('files', () => {
  it('writes the type and size as the tile does', () => {
    expect(extOf('2990s catalogue Oct 2026.pdf')).toBe('PDF')
    expect(extOf('price.xlsx')).toBe('XLSX')
    expect(sizeLabel(2_400_000)).toBe('2.3 MB')
    expect(sizeLabel(300)).toBe('1 KB')
  })
})
