import { describe, expect, it } from 'vitest'
import { agentCards, answersPrompt, DEFAULT_SETTINGS, fileStatus, readable, settingsOf, settingsPrompt, sourcesSummary, topicOf, type DataFile } from './agent'

const file = (over: Partial<DataFile> = {}): DataFile => ({
  id: 'f1', brandId: 'b1', category: 'Catalogues', kind: 'file', name: 'Catalogue.pdf', path: 'files/x/Catalogue.pdf', url: null, mime: 'application/pdf',
  sizeBytes: 1000, ver: 1, validFrom: null, validUntil: null, status: 'active', updatedByName: 'Mei Ling', updatedAt: '2026-10-20T00:00:00Z', usedBy: [], ...over,
})
const today = '2026-10-23'

describe('the agent’s settings', () => {
  it('read safely, with the defaults where something is missing or wrong', () => {
    expect(settingsOf(null)).toEqual(DEFAULT_SETTINGS)
    const s = settingsOf({ tone: 'Shouty', length: 'Detailed', rules: ['No emoji', 'No emoji', 3], phone: { on: false, after: 99 } }, 'Book a visit')
    expect([s.tone, s.length, s.rules, s.phone.on, s.phone.after, s.goal]).toEqual(['Friendly', 'Detailed', ['No emoji'], false, 20, 'Book a visit'])
  })
  it('turn into the prompt’s instructions', () => {
    const p = settingsPrompt(settingsOf({ tone: 'Concise', rules: ['No emoji'], blocked: ['Competitor prices'], phone: { on: true, afterOn: true, after: 3, wordsOn: true, words: ['Price'] }, maxOn: true, maxReplies: 5 }))
    expect(p).toContain('Tone: Concise — Straight to the answer')
    expect(p).toContain('- Do not use emoji.')
    expect(p).toContain('- Competitor prices')
    expect(p).toContain('Ask for it after 3 of your replies, or straight away when the customer mentions Price')
    expect(p).toContain('- after 5 of your replies in one conversation')
    expect(settingsPrompt(settingsOf({ phone: { on: false } }))).toContain('Do not ask for it.')
  })
  it('word the fixed answers and only the active playbook situations', () => {
    const p = answersPrompt([{ id: 'a1', question: 'Penang?', answer: 'Klang Valley only.' }],
      [{ id: 'p1', active: true, name: 'Too expensive', words: 'mahal', approaches: ['Mention instalments'], reply: '0% instalments.' }, { id: 'p2', active: false, name: 'Off', words: '', approaches: [], reply: '' }])
    expect(p).toContain('<fixed id="answer-a1">')
    expect(p).toContain('<situation name="Too expensive">')
    expect(p).not.toContain('name="Off"')
  })
})

describe('the Data Center’s files', () => {
  it('say where they stand', () => {
    expect(fileStatus(file(), today)).toEqual({ label: 'No end date', tone: 'green', usable: true })
    expect(fileStatus(file({ validUntil: '2026-10-30' }), today)).toEqual({ label: 'Ends in 7 days', tone: 'amber', usable: true })
    expect(fileStatus(file({ validUntil: '2026-10-01' }), today).label).toBe('Expired')
    expect(fileStatus(file({ status: 'paused' }), today).usable).toBe(false)
  })
  it('know what the agent can read itself', () => {
    expect(readable(file())).toBe('pdf')
    expect(readable(file({ mime: 'image/png', name: 'a.png' }))).toBe('image')
    expect(readable(file({ mime: 'application/vnd.ms-excel', name: 'Price list.xlsx' }))).toBeNull()
    expect(readable(file({ kind: 'link', path: null, url: 'https://x', mime: '' }))).toBe('link')
  })
  it('sum up what an agent reads', () => {
    const s = sourcesSummary([{ fileId: 'f1', paused: false, file: file({ validUntil: '2026-10-01' }) }, { fileId: 'f2', paused: false, file: file({ id: 'f2', validUntil: '2026-10-25' }) }, { fileId: 'f3', paused: true, file: file({ id: 'f3' }) }], '2990s', today)
    expect(s).toEqual({ main: 'Reads 2 sources from the 2990s and Shared folders', warn: '1 expired · 1 ending soon' })
  })
  it('become cards the agent may cite, with General info of its brand only and in use', () => {
    const info = { cats: [], cards: [
      { id: 'i1', catId: 'c', brandId: 'b1', name: 'KL showroom', code: 'kl', status: 'on' as const, validFrom: null, validUntil: null, note: '', fields: [{ key: 'address' as const, label: 'Address', value: 'Jalan Klang Lama' }], uses: [] },
      { id: 'i2', catId: 'c', brandId: 'b2', name: 'Puchong', code: 'pu', status: 'on' as const, validFrom: null, validUntil: null, note: '', fields: [{ key: 'address' as const, label: 'Address', value: 'x' }], uses: [] },
    ] }
    const cards = agentCards([], info, 'b1', today, [{ id: 'a1', question: 'Penang?', answer: 'No.' }], [file()])
    expect(cards.map(c => c.id)).toEqual(['info-i1', 'answer-a1', 'file-f1'])
    expect(cards[0].body).toBe('Address: Jalan Klang Lama')
  })
})

describe('the corrections’ topics', () => {
  it('sort a question by what it is about', () => {
    expect(topicOf('Do you deliver to Penang?')).toBe('Delivery')
    expect(topicOf('可以分期付款嗎?')).toBe('Payment')
    expect(topicOf('Sofa bed got what colour?')).toBe('Product details')
    expect(topicOf('hello')).toBe('Other')
  })
})
