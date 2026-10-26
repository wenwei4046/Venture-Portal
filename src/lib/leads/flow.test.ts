import { describe, expect, it } from 'vitest'
import { answerStep, flowHomes, flowProblem, newStepId, removeBranch, sendFrom, starterSteps, strayStepIds, type FlowStep } from './flow'

// The same cases tests/member-sql/validate-leads.mjs holds lead_flow_problem / the runner to.
const sofa: FlowStep[] = [
  { id: 's1', kind: 'question', text: '你想看哪一種？', buttons: [{ label: '3 人座', next: 's2' }, { label: 'L 型', next: 's2' }] },
  { id: 's2', kind: 'message', text: '照片 👇', next: 's3' },
  { id: 's3', kind: 'phone', text: '留個電話？', next: 's4' },
  { id: 's4', kind: 'handoff', text: '同事會聯絡你' },
]

describe('flowProblem — the twin of lead_flow_problem', () => {
  it('takes a good flow and the starter', () => {
    expect(flowProblem(sofa)).toBeNull()
    expect(flowProblem(starterSteps())).toBeNull()
  })
  it.each<[string, FlowStep[], RegExp]>([
    ['no steps', [], /at least one step/],
    ['a shared id', [{ id: 's1', kind: 'handoff', text: 'a' }, { id: 's1', kind: 'handoff', text: 'b' }], /share the id/],
    ['a silent step', [{ id: 's1', kind: 'handoff', text: ' ' }], /says something/],
    ['a question without buttons', [{ id: 's1', kind: 'question', text: 'q', buttons: [] }], /at least one button/],
    ['a button to nowhere', [{ id: 's1', kind: 'question', text: 'q', buttons: [{ label: 'A', next: 's9' }] }], /leads to a step/],
    ['a long button', [{ id: 's1', kind: 'question', text: 'q', buttons: [{ label: 'x'.repeat(21), next: 's1' }] }], /1 to 20/],
    ['next to nowhere', [{ id: 's1', kind: 'message', text: 'm', next: 's2' }], /leads to a step/],
  ])('refuses %s', (_, steps, want) => expect(flowProblem(steps)).toMatch(want))
})

describe('running a flow', () => {
  it('sends a question and waits', () => {
    const r = sendFrom(sofa, 's1')
    expect(r).toEqual({ sent: [{ text: '你想看哪一種？', buttons: ['3 人座', 'L 型'] }], waiting: 's1', end: 'waiting' })
  })
  it('sends a message and goes straight on to the phone question', () => {
    const r = sendFrom(sofa, 's2')
    expect(r.sent.map(x => x.text)).toEqual(['照片 👇', '留個電話？'])
    expect(r.waiting).toBe('s3')
  })
  it('ends on a hand-over', () => expect(sendFrom(sofa, 's4').end).toBe('handoff'))
  it('a button moves on, whatever its case and spaces; anything else stops', () => {
    expect(answerStep(sofa, 's1', ' l 型 ')).toBe('s2')
    expect(answerStep(sofa, 's1', '我想問價錢')).toBeNull()
  })
  it('the phone question wants a number', () => {
    expect(answerStep(sofa, 's3', '012-338 4721')).toBe('s4')
    expect(answerStep(sofa, 's3', '不方便')).toBeNull()
  })
  it('names a new step', () => expect(newStepId(sofa)).toBe('s5'))
})

describe('the editor tree', () => {
  const tree: FlowStep[] = [
    { id: 's1', kind: 'question', text: 'q', buttons: [{ label: 'A', next: 's2' }, { label: 'B', next: 's3' }] },
    { id: 's2', kind: 'message', text: 'a', next: 's4' },
    { id: 's3', kind: 'question', text: 'b', buttons: [{ label: 'B1', next: 's4' }] },
    { id: 's4', kind: 'phone', text: 'p', next: null },
    { id: 's9', kind: 'handoff', text: 'stray' },
  ]
  it('places each step where it is first reached', () => {
    const { order, home } = flowHomes(tree)
    expect(order).toEqual(['s1', 's2', 's4', 's3'])
    expect(home.get('s4')).toBe('s2:next')
    expect(strayStepIds(tree)).toEqual(['s9'])
  })
  it('removes a branch with what only it reached, and leaves the button to be set', () => {
    const left = removeBranch(tree, 's3')
    expect(left.map(x => x.id)).toEqual(['s1', 's2', 's4', 's9'])
    expect(left[0].buttons?.[1]).toEqual({ label: 'B', next: '' })
    expect(flowProblem(left)).toMatch(/leads to a step/)
    // s4 is still reached through s2, so it stays.
    expect(removeBranch(tree, 's2').map(x => x.id)).toEqual(['s1', 's3', 's4', 's9'])
    expect(removeBranch(tree, 's1')).toBe(tree)
  })
})
