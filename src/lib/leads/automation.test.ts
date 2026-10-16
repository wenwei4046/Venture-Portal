import { describe, expect, it } from 'vitest'
import { TEMPLATE_CARDS, compile, isAway, starterConfig, type TemplateConfig } from './automation'
import { flowProblem, sendFrom, answerStep } from './flow'

describe('every starter form makes a flow the database takes', () => {
  for (const card of TEMPLATE_CARDS.filter(c => !c.soon && c.template !== 'custom')) {
    it(card.key, () => {
      const start = starterConfig(card.key)
      // The ad's name is the one thing the starter cannot guess.
      const c = compile(start.template === 'ad' ? { ...start, ad: 'Sofa Week' } : start)
      expect(flowProblem(c.steps)).toBeNull()
    })
  }
})

describe('compile', () => {
  it('FAQ: a question per item, a Talk-to-us button, and the questions again after an answer', () => {
    const c = compile({ template: 'faq', intro: 'Help?', items: [{ q: 'Instalments?', a: 'Yes.' }, { q: ' ', a: 'skipped' }], handoffButton: true, repeat: true })
    expect(c.triggerKind).toBe('first')
    const first = sendFrom(c.steps, 's1')
    expect(first.sent[0].buttons).toEqual(['Instalments?', 'Talk to us'])
    const next = answerStep(c.steps, 's1', 'Instalments?')!
    const after = sendFrom(c.steps, next)
    expect(after.sent[0]).toEqual({ text: 'Yes.', buttons: ['Instalments?', 'Talk to us'] })
    expect(sendFrom(c.steps, answerStep(c.steps, 's1', 'Talk to us')!).end).toBe('handoff')
  })
  it('keyword: the words become the trigger; asking for a phone hands over after', () => {
    const c = compile({ template: 'keyword', keywords: [' 分期 ', 'installment', ''], reply: 'Yes', askPhone: true, phoneAsk: 'Phone?', after: 'Thanks' })
    expect(c.triggerValue).toBe('分期, installment')
    expect(sendFrom(c.steps, 's1').sent.map(m => m.text)).toEqual(['Yes', 'Phone?'])
  })
  it('ad: each question saves its answer, then the phone', () => {
    const c = compile({ template: 'ad', ad: 'Sofa Week', intro: 'Hi', questions: [{ text: 'Which?', options: ['L', 'Bed'], saveAs: 'interest' }], phoneAsk: 'Phone?', after: 'Thanks' })
    expect(c.steps[0]).toMatchObject({ kind: 'question', saveAs: 'interest', text: 'Hi\nWhich?' })
    expect(answerStep(c.steps, 'q0', 'Bed')).toBe('p')
    expect(c.triggerKind).toBe('ad')
  })
  it.each<[TemplateConfig, RegExp]>([
    [{ template: 'faq', intro: '', items: [], handoffButton: false, repeat: false }, /at least one question/],
    [{ template: 'keyword', keywords: [], reply: 'x', askPhone: false, phoneAsk: '', after: '' }, /at least one keyword/],
    [{ template: 'ad', ad: '', intro: '', questions: [], phoneAsk: '', after: '' }, /which ad/],
    [{ template: 'welcome', message: ' ', buttons: [] }, /welcome message/],
  ])('refuses an unfinished form', (c, want) => expect(() => compile(c)).toThrow(want))
})

describe('isAway — the twin of lead_is_away', () => {
  const hours = [{ day: 1, from: '10:00', to: '22:00', off: false }]
  it('reads the office clock', () => {
    expect(isAway(hours, new Date('2026-10-19T04:00:00Z'))).toBe(false)
    expect(isAway(hours, new Date('2026-10-19T15:00:00Z'))).toBe(true)
    expect(isAway(hours, new Date('2026-10-18T04:00:00Z'))).toBe(true)
  })
})
