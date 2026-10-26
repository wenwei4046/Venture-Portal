import { describe, expect, it } from 'vitest'
import { adoptionRate, conversationPrompt, DEFAULT_GOAL, inDate, outcomeOf, readDraft, systemPrompt, turnsOf, type KnowledgeCard, type Persona } from './ai'

const persona = (over: Partial<Persona> = {}): Persona => ({
  brandId: 'b1', brandName: '2990s', agentName: '', personality: '', tone: 'warm', goal: '', dos: '', donts: '', examples: '',
  mode: 'copilot', saved: true, updatedByName: '', updatedAt: null, ...over,
})
const card = (id: string, over: Partial<KnowledgeCard> = {}): KnowledgeCard => ({
  id, brandId: null, kind: 'faq', title: `Card ${id}`, body: `Body ${id}`, startsOn: null, endsOn: null, active: true,
  updatedByName: '', updatedAt: '', ...over,
})

describe('the system prompt', () => {
  it('speaks as the brand, with its cards and the rules', () => {
    const p = systemPrompt(persona({ agentName: 'Mia', donts: 'No price over chat' }), [card('k1', { kind: 'promo', title: 'Sofa <week>', endsOn: '2026-10-31' })], '2026-10-16')
    expect(p).toContain('2990s')
    expect(p).toContain('You write as Mia')
    expect(p).toContain('# Never\nNo price over chat')
    expect(p).toContain('<card id="k1" kind="promo" title="Sofa ‹week›" until="2026-10-31">')
    expect(p).toContain('today 2026-10-16')
    expect(p).toContain('come ONLY from the cards')
  })
  it('falls back to the brand team, the phone goal, and says when there are no cards', () => {
    const p = systemPrompt(persona(), [], '2026-10-16')
    expect(p).toContain('the 2990s team')
    expect(p).toContain(DEFAULT_GOAL)
    expect(p).toContain('(No cards yet.)')
    expect(p).not.toContain('# Always')
  })
})

describe('the conversation', () => {
  const customer = { name: 'Ivy', channel: 'messenger', sourceAd: 'Oct Sofa Week', phone: null, interest: 'L-shape', budget: '', showroom: '', preferredTime: '' }
  it('says what we know and asks for the next reply', () => {
    const turns = turnsOf([
      { direction: 'in', sender: 'customer', body: 'L型沙发多少钱？' },
      { direction: 'out', sender: 'flow', body: '哪一种？' },
      { direction: 'in', sender: 'customer', body: '布的' },
    ])
    const p = conversationPrompt(customer, turns)
    expect(p).toContain('from the ad "Oct Sofa Week"')
    expect(p).toContain('Mobile number: not yet')
    expect(p).toContain('Interested in: L-shape')
    expect(p).not.toContain('Budget')
    expect(p).toContain('[Us · automation] 哪一种？')
    expect(p.endsWith('Draft our next reply.')).toBe(true)
  })
  it('asks only for a useful follow-up when we wrote last, and never for the phone twice', () => {
    const p = conversationPrompt({ ...customer, phone: '0123384721' }, [{ who: 'us', by: 'customer service', text: 'Hi' }])
    expect(p).toContain('we have it already')
    expect(p).toContain('We wrote last')
  })
})

describe('reading the answer', () => {
  const cards = [card('k1'), card('k2')]
  it('keeps a usable draft and only the cards it was given', () => {
    const d = readDraft(JSON.stringify({ reply: '  Hi! 你好 ', usedCardIds: ['k2', 'zz'], handoff: true, note: 'Check stock' }), cards)
    expect(d).toEqual({ reply: 'Hi! 你好', used: [{ id: 'k2', title: 'Card k2' }], handoff: true, note: 'Check stock' })
  })
  it('refuses what is not JSON or says nothing', () => {
    expect(readDraft('Sure! Here is a reply', cards)).toBeNull()
    expect(readDraft(JSON.stringify({ reply: '  ', usedCardIds: [], handoff: false, note: '' }), cards)).toBeNull()
  })
  it('cuts a reply to the message limit', () => {
    expect(readDraft(JSON.stringify({ reply: 'x'.repeat(3000), usedCardIds: [], handoff: false, note: '' }), cards)!.reply).toHaveLength(2000)
  })
})

describe('dates, outcomes, adoption', () => {
  it('a card is in date between its days, and only switched on', () => {
    expect(inDate({ startsOn: '2026-10-16', endsOn: '2026-10-16', active: true }, '2026-10-16')).toBe(true)
    expect(inDate({ startsOn: '2026-10-17', endsOn: null, active: true }, '2026-10-16')).toBe(false)
    expect(inDate({ startsOn: null, endsOn: '2026-10-15', active: true }, '2026-10-16')).toBe(false)
    expect(inDate({ startsOn: null, endsOn: null, active: false }, '2026-10-16')).toBe(false)
  })
  it('a draft sent as written, spaces aside, is sent; anything else edited', () => {
    expect(outcomeOf('Hi  there\n', 'Hi there')).toBe('sent')
    expect(outcomeOf('Hi there', 'Hi there!')).toBe('edited')
  })
  it('adoption is the share used of those decided', () => {
    expect(adoptionRate({ sent: 2, edited: 1, dismissed: 1 })).toBe(75)
    expect(adoptionRate({ sent: 0, edited: 0, dismissed: 0 })).toBeNull()
  })
})
