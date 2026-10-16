import { describe, expect, it } from 'vitest'
import { answerStep, flowProblem, newStepId, sendFrom, starterSteps, type FlowStep } from './flow'

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
