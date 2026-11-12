import { describe, expect, it } from 'vitest'
import { answerPicks, asksForPerson, clampSide, doneOf, filesOf, langOf, tr, SIDE_W, fromLibrary, normDigits, rowsOf, runsOn, templateProblem, tidy, toLibrary, updateFromLibrary, walkAnswer, walkFrom, type TemplateStep } from './template'

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

describe('several replies to an option; picking more than one (2026-10-29, mig 20261029150010)', async () => {
  const { answerPicks, templateProblem, walkAnswer, walkFrom } = await import('./template')
  const PM = {
    endMsg: '',
    steps: [
      { id: 'q', kind: 'question', text: 'Which are you after?', saveAs: 'interest', multi: true, doneLabel: "That's all", next: 'ph',
        buttons: [{ label: 'Sofa', next: '', also: ['ms', 'mp'] }, { label: 'Mattress', next: '', also: ['mm'] }, { label: 'Bed frame', next: '' }] },
      { id: 'ms', kind: 'message', text: 'Our sofas: RM2,990', next: '' },
      { id: 'mp', kind: 'message', text: 'Sofa promo this month', next: '' },
      { id: 'mm', kind: 'message', text: 'Our mattresses: RM2,990', next: '' },
      { id: 'ph', kind: 'phone', text: 'Your phone number?', next: '' },
    ] as TemplateStep[],
  }
  const ONE = {
    endMsg: '',
    steps: [
      { id: 'q', kind: 'question', text: 'Sofa or mattress?', buttons: [{ label: 'Sofa', next: 'ph', also: ['ms'] }, { label: 'Mattress', next: '' }] },
      { id: 'ms', kind: 'message', text: 'Our sofas: RM2,990', next: '' },
      { id: 'ph', kind: 'phone', text: 'Your phone number?', next: '' },
    ] as TemplateStep[],
  }
  const bots = (w: { said: Array<{ from: string; text: string }> }, from = 0) => w.said.slice(from).filter(x => x.from === 'bot').map(x => x.text)

  it('reads words, the finish button and numbers as the database does', () => {
    const q = PM.steps[0]
    const shown = ['Sofa', 'Mattress', 'Bed frame']
    expect(answerPicks(q, ' sofa ', shown)).toEqual({ picks: [0], finish: false })
    expect(answerPicks(q, '1、2', shown)).toEqual({ picks: [0, 1], finish: false })
    expect(answerPicks(q, '１ 三', shown)).toEqual({ picks: [0, 2], finish: false })
    expect(answerPicks(q, "that's all", shown)).toEqual({ picks: [], finish: true })
    expect(answerPicks(q, '2', ['Bed frame', "That's all"])).toEqual({ picks: [], finish: true })
    expect(answerPicks(q, '123', shown)).toBeNull()
    expect(answerPicks(q, 'can I pay later?', shown)).toBeNull()
    expect(answerPicks(ONE.steps[0], '1,2', ['Sofa', 'Mattress'])).toEqual({ picks: [0], finish: false })
  })

  it('taps one, then another, then finishes', () => {
    let w = walkFrom(PM, 'q')
    expect(bots(w)).toEqual(['Which are you after?'])
    w = walkAnswer(PM, w, 'Sofa')
    expect(bots(w, 1)).toEqual(['Our sofas: RM2,990', 'Sofa promo this month', 'Anything else? Pick another, or tap "That\'s all".'])
    expect(w.said.at(-1)).toMatchObject({ buttons: ['Mattress', 'Bed frame', "That's all"] })
    expect([w.waiting, w.picked]).toEqual(['q', [0]])
    w = walkAnswer(PM, w, '1')
    expect(w.picked).toEqual([0, 1])
    expect(w.said.at(-1)).toMatchObject({ buttons: ['Bed frame', "That's all"] })
    w = walkAnswer(PM, w, '2')
    expect([w.waiting, bots(w).at(-1)]).toEqual(['ph', 'Your phone number?'])
  })

  it('a question that takes one: its other reply, then where it goes', () => {
    const w = walkAnswer(ONE, walkFrom(ONE, 'q'), '1')
    expect(bots(w, 1)).toEqual(['Our sofas: RM2,990', 'Your phone number?'])
    expect(walkAnswer(ONE, walkFrom(ONE, 'q'), 'hello?').ended).toBe('stopped')
  })

  it('checks as the database does', () => {
    expect(templateProblem(PM.steps)).toBeNull()
    expect(templateProblem(ONE.steps)).toBeNull()
    const bad = (patch: object) => PM.steps.map(s => (s.id === 'q' ? { ...s, ...patch } : s)) as TemplateStep[]
    expect(templateProblem(bad({ buttons: [{ label: 'Sofa', next: '', also: ['ph'] }] }))).toMatch(/"Send a message" steps/)
    expect(templateProblem(bad({ buttons: [{ label: 'Sofa', next: 'ms' }] }))).toMatch(/takes more than one/)
    expect(templateProblem(bad({ doneLabel: 'x'.repeat(21) }))).toMatch(/finish button/)
  })
})

describe('‹ Back to the question before (2026-11-02, mig 20261102180000)', () => {
  const t = {
    endMsg: '',
    steps: [
      { id: 'q1', kind: 'question', text: 'Sofa or bed?', back: true, buttons: [{ label: 'Sofa', next: 'q2' }, { label: 'Bed', next: 'q2' }] },
      { id: 'q2', kind: 'question', text: 'Budget?', back: true, buttons: [{ label: 'Under 3k', next: 'p' }] },
      { id: 'p', kind: 'phone', text: 'Your number?', back: true, next: '' },
    ] as TemplateStep[],
  }
  it('offers ‹ Back only after something was asked, never on the first step', () => {
    const w = walkFrom(t, 'q1')
    expect(w.said.at(-1)?.buttons).toEqual(['Sofa', 'Bed'])
    const w2 = walkAnswer(t, w, 'Sofa')
    expect(w2.said.at(-1)?.buttons).toEqual(['Under 3k', '‹ Back'])
    expect(w2.trail).toEqual(['q1', 'q2'])
  })
  it('goes back one question at a time, as typed or tapped', () => {
    let w = walkAnswer(t, walkAnswer(t, walkFrom(t, 'q1'), 'Sofa'), 'Under 3k')
    expect(w.waiting).toBe('p')
    w = walkAnswer(t, w, '返回')
    expect([w.waiting, w.trail]).toEqual(['q2', ['q1', 'q2']])
    w = walkAnswer(t, w, '‹ Back')
    expect([w.waiting, w.trail, w.said.at(-1)?.buttons]).toEqual(['q1', ['q1'], ['Sofa', 'Bed']])
  })
  it('a step without it takes "back" as its own answer', () => {
    const plain = { ...t, steps: t.steps.map(s => ({ ...s, back: false })) }
    const w = walkAnswer(plain, walkAnswer(plain, walkFrom(plain, 'q1'), 'Sofa'), 'back')
    expect(w.ended).toBe('stopped')
  })
})

describe('the customer asks for a person (2026-11-02, mig 20261102190000)', () => {
  it('knows the ways people ask, in English, Chinese and Malay', () => {
    for (const s of ['我要找客服', '转人工', '有真人吗', 'Customer service please', 'can I talk to a real person?', 'speak to someone', 'are you human?', 'nak cakap dengan orang', 'khidmat pelanggan'])
      expect(asksForPerson(s), s).toBe(true)
    for (const s of ['2 person sofa', 'how much', 'L-shape for 5 people', 'service centre?'])
      expect(asksForPerson(s), s).toBe(false)
  })
  it('stops the walk for a person', () => {
    const t = { endMsg: '', steps: [{ id: 'q', kind: 'question', text: 'Sofa?', buttons: [{ label: 'Yes', next: '' }] }] as TemplateStep[] }
    expect(walkAnswer(t, walkFrom(t, 'q'), 'customer service').ended).toBe('person')
  })
})

// 2026-11-11, the same template validate-leads.mjs runs through the bilingual runner (mig 20261111130000).
describe('English and Chinese, several files a step', () => {
  const F = (n: string) => ({ path: 'chat/tpl/00000000-0000-4000-8000-0000000b1001/' + n, name: n, mime: n.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf', size: 1 })
  const bi: TemplateStep[] = [
    { id: 'q1', kind: 'question', text: 'Sofa or bed?', textZh: '沙发还是床？', saveAs: 'interest', files: [F('sofa.jpg'), F('price.pdf')],
      buttons: [{ label: 'Sofa', labelZh: '沙发', next: 'q2' }, { label: 'Bed', labelZh: '', next: 'q2' }] },
    { id: 'q2', kind: 'question', text: 'Which ones?', multi: true, back: true, doneLabelZh: '好了', next: 'p',
      buttons: [{ label: 'Fabric', labelZh: '布', next: '' }, { label: 'Leather', labelZh: '皮', next: '' }] },
    { id: 'p', kind: 'phone', text: 'Your number?', textZh: '您的电话？', back: true, next: '' },
  ]
  const tb = { steps: bi, endMsg: 'Thanks!', endMsgZh: '谢谢！' }

  it('an empty box is filled by the other language', () => {
    expect([tr({ text: 'Hi', textZh: '' }, 'text', 'zh'), tr({ text: '', textZh: '你好' }, 'text', 'en'), tr({ text: 'Hi', textZh: '你好' }, 'text', 'zh')]).toEqual(['Hi', '你好', '你好'])
  })
  it('the language: the panel first, else the latest message with words in it', () => {
    expect(langOf(['hello', '你好', '1', '[Photo]'])).toBe('zh')
    expect(langOf(['你好', 'ok'])).toBe('en')
    expect(langOf(['你好'], 'English')).toBe('en')
    expect(langOf([])).toBe('en')
  })
  it('the files first, then the words in the customer’s language; ‹ 返回 in Chinese', () => {
    let w = walkFrom(tb, 'q1', [], [], 'zh')
    expect(w.said.map(x => x.file?.name ?? x.text)).toEqual(['sofa.jpg', 'price.pdf', '沙发还是床？'])
    expect(w.said.at(-1)!.buttons).toEqual(['沙发', 'Bed'])
    w = walkAnswer(tb, w, '沙发')
    expect(w.said.at(-1)).toMatchObject({ text: 'Which ones?', buttons: ['布', '皮', '‹ 返回'] })
    w = walkAnswer(tb, w, '1')
    expect(w.said.at(-1)).toMatchObject({ text: '还有别的吗？再选一个，或点“好了”。', buttons: ['皮', '好了'] })
    w = walkAnswer(tb, w, '好了')
    expect(w.said.at(-1)).toMatchObject({ text: '您的电话？', buttons: ['‹ 返回'] })
    w = walkAnswer(tb, w, '0123384721')
    expect(bot(w).at(-1)).toBe('谢谢！')
  })
  it('an option matches either language', () => {
    expect(answerPicks(bi[1], '皮', ['Fabric', 'Leather'])).toEqual({ picks: [1], finish: false })
    expect(answerPicks({ ...bi[1], doneLabelZh: undefined }, "that's all", [])).toEqual({ picks: [], finish: true })
    expect(answerPicks({ ...bi[1], doneLabelZh: undefined }, '就这些', [])).toEqual({ picks: [], finish: true })
    expect(answerPicks(bi[1], '好了', [])).toEqual({ picks: [], finish: true })
  })
  it('the finish button: an empty box takes the other language’s, then the default (2026-11-12)', () => {
    expect([doneOf({ doneLabel: 'Done' }, 'zh'), doneOf({ doneLabelZh: '好了' }, 'en'), doneOf({}, 'zh'), doneOf({}, 'en')]).toEqual(['Done', '好了', '就这些', "That's all"])
    expect(answerPicks({ id: 'q', kind: 'question', text: 'x', multi: true, doneLabel: 'Done', buttons: [{ label: 'A', next: '' }] }, '就这些', [])).toBeNull()
  })
  it('a step from before keeps its one file', () => {
    expect(filesOf({ file: F('a.jpg') }).map(f => f.name)).toEqual(['a.jpg'])
    expect(filesOf({ file: F('a.jpg'), files: [F('b.jpg')] }).map(f => f.name)).toEqual(['b.jpg'])
  })
  it('what a save takes', () => {
    expect(templateProblem([{ id: 'a', kind: 'question', text: '', textZh: '选一个', buttons: [{ label: '', labelZh: '沙发', next: '' }] }])).toBeNull()
    expect(templateProblem([{ id: 'a', kind: 'message', text: 'x', files: Array.from({ length: 11 }, () => F('a.jpg')), next: '' }])).toMatch(/10 files/)
    expect(templateProblem([{ id: 'a', kind: 'message', text: '', textZh: '', next: '' }])).toMatch(/says nothing/)
  })
  it('the library brings its Chinese words and files', () => {
    const own: TemplateStep = { id: 'x', kind: 'message', text: 'old', endMsgZh: '再见', next: '', lib: { id: 'L', ver: 1 } }
    const up = updateFromLibrary(own, { id: 'L', ver: 2, steps: [{ id: 's1', kind: 'message', text: 'Promo!', textZh: '优惠！', files: [F('a.jpg')], next: '' }] })
    expect([up.text, up.textZh, up.files?.length, up.endMsgZh, up.lib?.ver]).toEqual(['Promo!', '优惠！', 1, '再见', 2])
  })
})
