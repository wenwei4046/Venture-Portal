import { describe, expect, it } from 'vitest'
import { findPhone, formatPhone, whatsAppLink } from './phone'
import { handedTo, handoffText, inboxState, SALES_GROUP, suggestedSales, visitDay } from './handoff'
import { leadInsight, rate } from './insight'
import type { LeadContact, LeadSales } from './types'

// The same examples as tests/member-sql/validate-leads.mjs holds lead_find_phone to.
describe('findPhone — the twin of lead_find_phone', () => {
  it.each([
    ['我的號碼 012-338 4721，週六可以去看', '0123384721'],
    ['0175520193', '0175520193'],
    ['call me +60 12-338 4721 ok', '0123384721'],
    ['6012-3384721', '0123384721'],
    ['011-2093 4471', '01120934471'],
    ['budget RM 1,500 to 3000', null],
    ['order 2026101612345678', null],
    ['03-7890 1234', null],
  ])('%s', (text, want) => expect(findPhone(text)).toBe(want))
})

describe('formatPhone / whatsAppLink', () => {
  it('writes the number the way Malaysians do', () => {
    expect(formatPhone('0123384721')).toBe('012-338 4721')
    expect(formatPhone('01120934471')).toBe('011-2093 4471')
  })
  it('links WhatsApp with the country code and the text', () => {
    expect(whatsAppLink('0120001101', 'Hi 你好')).toBe('https://wa.me/60120001101?text=Hi%20%E4%BD%A0%E5%A5%BD')
  })
})

const contact = (over: Partial<LeadContact> = {}): LeadContact => ({
  id: 'c', brandId: 'b1', channel: 'messenger', isTest: false, name: 'Aisyah', sourceAd: 'Oct Sofa Week', phone: '0123384721',
  phoneState: 'confirmed', phoneAt: null, interest: 'L 型沙發', budget: '', showroom: '', preferredTime: '週六', note: '',
  handedSalesId: null, handedSalesName: null, handedAt: null, handedByName: null, appt: 'unknown', shown: 'unknown',
  lastAt: '2026-10-16T06:00:00Z', lastDir: 'in', lastText: '', createdAt: '2026-10-16T06:00:00Z', ...over,
})
const sales = (name: string, week: number, sortOrder: number): LeadSales => ({ id: name, name, phone: '0120001101', showroom: '', week, sortOrder })

describe('handing a lead over', () => {
  it('suggests the fewest this week, then the list order', () => {
    expect(suggestedSales({ sales: [sales('A', 3, 1), sales('B', 1, 2), sales('C', 1, 3)] })?.name).toBe('B')
    expect(suggestedSales({ sales: [] })).toBeNull()
  })
  it('writes what the salesperson needs, and says what is missing', () => {
    const text = handoffText(contact(), '2990s', { name: 'Daniel' }, 'Mei Ling')
    // Inbox v2's message (2026-10-22): one line a field, "-" where nothing is known.
    expect(text.split('\n')).toEqual([
      'Hi Daniel, new lead from Lead View / 新客户',
      'Name 姓名: Aisyah',
      'Phone 电话: 012-338 4721',
      'Interest 兴趣: L 型沙發',
      'Budget 预算: -',
      'Showroom 门市: -',
      'Date 日期: 週六',
      'Source 来源: Ad · Oct Sofa Week',
      'Note 备注: -',
      'CS: Mei Ling',
    ])
  })
  it('says a picked day as a day, and leaves words typed before as they are', () => {
    expect(visitDay('2026-10-24')).toBe('Sat 24 Oct')
    expect(visitDay('Sunday afternoon')).toBe('Sunday afternoon')
    expect(visitDay(' ')).toBe('-')
  })
  it('says where a conversation stands', () => {
    expect(inboxState(contact())).toBe('waiting')
    expect(inboxState(contact({ lastDir: 'out' }))).toBe('answered')
    expect(inboxState(contact({ handedAt: '2026-10-16T07:00:00Z' }))).toBe('handed')
    // Opened since the customer wrote (unread 0): seen — no longer waiting; unknown (no count) stays waiting.
    expect(inboxState(contact({ unread: 0 }))).toBe('answered')
    expect(inboxState(contact({ unread: 2 }))).toBe('waiting')
    expect(inboxState(contact({ unread: undefined }))).toBe('waiting')
  })
})

describe('handing a lead to the sales group (no salesperson named)', () => {
  it('writes the message to the team', () => {
    expect(handoffText(contact(), '2990s', null, 'Mei Ling').split('\n')[0]).toBe('Hi team, new lead from Lead View / 新客户')
  })
  it('names who it went to: the salesperson, else the sales group once handed, else nobody', () => {
    expect(handedTo({ handedAt: '2026-10-27T02:00:00Z', handedSalesName: 'Daniel' })).toBe('Daniel')
    expect(handedTo({ handedAt: '2026-10-27T02:00:00Z', handedSalesName: null })).toBe(SALES_GROUP)
    expect(handedTo({ handedAt: null, handedSalesName: null })).toBeNull()
  })
})

describe('Insight', () => {
  const brands = [{ id: 'b1', name: '2990s' }, { id: 'b2', name: 'Carress' }]
  const rows = [
    contact(),
    contact({ id: 'd', phone: null, phoneState: 'none', sourceAd: '' }),
    contact({ id: 'e', brandId: 'b2', handedAt: 'x', handedByName: 'Mei Ling', appt: 'booked', shown: 'came' }),
    contact({ id: 't', isTest: true }),
  ]
  it('counts phones as the KPI and leaves tests out', () => {
    const i = leadInsight(rows, brands)
    expect(i.total).toEqual({ conversations: 3, phones: 2, handed: 1, booked: 1, came: 1 })
    expect(i.byBrand.map(r => [r.label, r.conversations])).toEqual([['2990s', 2], ['Carress', 1]])
    expect(i.byAd.map(r => r.label)).toEqual(['Oct Sofa Week', 'Organic'])
    expect(i.byPerson.map(r => [r.label, r.handed])).toEqual([['Mei Ling', 1]])
    expect(leadInsight(rows, brands, { withTests: true }).total.conversations).toBe(4)
  })
  it('rounds a rate and has none without conversations', () => {
    expect(rate(2, 3)).toBe(67)
    expect(rate(0, 0)).toBeNull()
  })
})
