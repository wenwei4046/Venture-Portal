import { describe, expect, it } from 'vitest'
import { clampSide, SIDE_W, fromLibrary, normDigits, rowsOf, runsOn, templateProblem, tidy, toLibrary, updateFromLibrary, walkAnswer, walkFrom, type TemplateStep } from './template'

// The same template tests/member-sql/validate-leads.mjs runs through the database's runner.
const steps: TemplateStep[] = [
  { id: 's1', name: 'Welcome', kind: 'question', text: 'What are you looking for?', saveAs: 'interest',
    buttons: [{ label: 'Sofa', next: 's2' }, { label: 'Just looking', next: '', endMsg: 'No problem, browse away!' }] },
  { id: 's2', name: 'Ask for phone', kind: 'phone', text: 'Your mobile number?', retryText: 'Numbers only please.', retryMax: '1', failNext: 'person', next: 's3' },
  { id: 's3', name: 'Anything else', kind: 'text', text: 'Anything we should know?', saveAs: 'note', next: '' },
]
const t = { steps, endMsg: 'Thanks! We’ll be in touch soon 😊' }
const bot = (w: { said: Array<{ from: string; text: string }> }) => w.said.filter(x => x.from === 'bot').map(x => x.text)

describe('a template’s steps', () => {
  it('are checked as the database checks them', () => {
    expect(templateProblem(steps)).toBeNull()
    expect(templateProblem([])).toBe('A template needs at least one step.')
    expect(templateProblem([{ ...steps[0], buttons: [{ label: 'x', next: 'nope' }] }])).toBe('Welcome: every option goes to a step, or ends.')
    expect(templateProblem([{ ...steps[1], next: '', retryMax: '9' }])).toBe('Ask for phone: ask again 1 to 5 times, or without a limit.')
    expect(templateProblem([{ id: 's1', kind: 'handoff', text: '' }])).toBeNull()
    expect(templateProblem([{ id: 's1', kind: 'message', text: ' ', name: 'Catalogue' }])).toBe('Catalogue says nothing yet — write its message.')
  })
  it('draw a row an option, or one line saying what the customer does', () => {
    expect(rowsOf(steps[0]).map(r => [r.label, r.next])).toEqual([['Sofa', 's2'], ['Just looking', '']])
    expect(rowsOf(steps[1])).toEqual([{ i: -1, label: 'Gives a phone number', next: 's3' }])
    expect(rowsOf({ id: 'x', kind: 'handoff', text: '' })).toEqual([])
  })
  it('tidy into columns by how far they are from the start', () => {
    const xs = tidy(steps).map(s => s.pos!.x)
    expect(xs[0] < xs[1] && xs[1] < xs[2]).toBe(true)
  })
})

describe('Test as customer — the runner’s twin', () => {
  it('walks options, a wrong phone, a right one, an answer and the closing message', () => {
    let w = walkFrom(t, 's1')
    expect(bot(w)).toEqual(['What are you looking for?'])
    w = walkAnswer(t, w, 'sofa')
    w = walkAnswer(t, w, 'later')
    expect(bot(w).slice(-1)).toEqual(['Numbers only please.'])
    w = walkAnswer(t, w, '〇一二三三八四九九九')
    w = walkAnswer(t, w, 'Prefer olive green')
    expect(bot(w).slice(-2)).toEqual(['Anything we should know?', 'Thanks! We’ll be in touch soon 😊'])
    expect(w.ended).toBe('done')
  })
  it('hands to a person when the phone is still wrong, and stops when the customer types their own', () => {
    let w = walkAnswer(t, walkFrom(t, 's1'), 'Sofa')
    w = walkAnswer(t, walkAnswer(t, w, 'no'), 'still no')
    expect(w.ended).toBe('person')
    expect(walkAnswer(t, walkFrom(t, 's1'), 'a bed?').ended).toBe('stopped')
    expect(bot(walkAnswer(t, walkFrom(t, 's1'), 'Just looking')).slice(-1)).toEqual(['No problem, browse away!'])
  })
  it('reads Chinese numerals and full-width digits as a phone', () => {
    expect(normDigits('〇一二-三三八 ４７２１')).toBe('012-338 4721')
  })
})

describe('the library', () => {
  it('keeps a step, or the chain after it, as its own s1, s2 …', () => {
    expect(toLibrary(steps, 's2', false)).toEqual([{ ...steps[1], id: 's1', next: '', failNext: 'person' }])
    const chain = toLibrary(steps, 's1', true)
    expect(chain.map(s => s.id)).toEqual(['s1', 's2', 's3'])
    expect(chain[0].buttons!.map(b => b.next)).toEqual(['s2', ''])
  })
  it('copies an item in with fresh ids, linked, and brings a step up to a new version keeping its ways on', () => {
    const item = { id: 'L1', ver: 2, steps: toLibrary(steps, 's1', true) }
    const copy = fromLibrary(steps, item, { x: 600, y: 40 })
    expect(copy.map(s => s.id)).toEqual(['s4', 's5', 's6'])
    expect(copy[0].buttons![0].next).toBe('s5')
    expect(copy.every(s => s.lib?.id === 'L1' && s.lib.ver === 2)).toBe(true)
    const old = { ...steps[0], lib: { id: 'L9', ver: 1 } }
    const up = updateFromLibrary(old, { id: 'L9', ver: 3, steps: [{ ...steps[0], text: 'New words', buttons: [{ label: 'Sofa!', next: '' }, { label: 'Bed', next: '' }] }] })
    expect([up.text, up.buttons!.map(b => [b.label, b.next]), up.lib]).toEqual(['New words', [['Sofa!', 's2'], ['Bed', '']], { id: 'L9', ver: 3 }])
  })
})

describe('where the rules run a template', () => {
  it('says it in words', () => {
    const rules = { ads: [{ id: 'r', adId: '1201', when: 'closed' as const, reply: 'T' }], pages: [{ brandId: 'b', channel: 'messenger' as const, work: 'T', after: 'T' }, { brandId: 'b', channel: 'instagram' as const, work: 'cs', after: 'T' }] }
    expect(runsOn('T', rules, () => '2990s', () => 'Oct Sofa Week')).toBe('Runs on 2990s Messenger, 2990s Instagram · after hours, ad “Oct Sofa Week” · after hours')
    expect(runsOn('X', rules, () => '', () => '')).toBe('Not used by any reply rule yet')
  })
})

describe('the right panel’s width', () => {
  it('keeps a dragged width between 300 and 720, whole pixels; nonsense is the start', () => {
    expect(clampSide(250)).toBe(SIDE_W.min)
    expect(clampSide(900)).toBe(SIDE_W.max)
    expect(clampSide(480.6)).toBe(481)
    expect(clampSide(Number.NaN)).toBe(SIDE_W.start)
  })
})

describe('cards grow with their words; options move (2026-10-29)', () => {
  it('counts the whole message and every wrapped option in a card’s height', async () => {
    const { cardHeight } = await import('./template')
    const short = cardHeight({ id: 'a', kind: 'question', text: 'Hi', buttons: [{ label: 'Sofa', next: '' }] } as never)
    const long = cardHeight({ id: 'a', kind: 'question', text: 'Hi {name}! Thank you for contacting 2990s.\nWe have received your message and will reply shortly.\nCustomer Care: Mon–Sun 9AM–6PM', buttons: [{ label: 'Would like to know more about our sofa, mattress or bedframe?', next: '' }, { label: 'Talk to person', next: '' }] } as never)
    expect(long).toBeGreaterThan(short + 80)
  })
  it('moves an option from one place to another', async () => {
    const { moveItem } = await import('./template')
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })
})
