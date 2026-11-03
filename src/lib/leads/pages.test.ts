import { describe, expect, it } from 'vitest'
import { adSlots, connectable, dayRange, followersLabel, holidayMode, pageName, pageState, routeRows, withAdSlots, type LeadPage, type ManagedPage } from './pages'

const page = (o: Partial<LeadPage>): LeadPage => ({ id: 'p', brandId: 'b1', channel: 'messenger', externalId: '11111', pageId: null, name: '', paused: false, connectedByName: '', connectedAt: '', ...o })
const managed: ManagedPage[] = [
  { id: '11111', name: '2990s Furniture', followers: 4100, ig: { id: '99999', username: '2990s.my', followers: 980 } },
  { id: '22222', name: 'Carress Malaysia', followers: 860, ig: null },
]

describe('pageState', () => {
  it('reads Receiving, Paused, and Reconnect when the system user no longer reaches it', () => {
    expect(pageState(page({}), managed)).toBe('receiving')
    expect(pageState(page({ paused: true }), managed)).toBe('paused')
    expect(pageState(page({ externalId: '33333' }), managed)).toBe('reconnect')
    expect(pageState(page({ channel: 'instagram', externalId: '99999' }), managed)).toBe('receiving')
  })
  it('says nothing is lost when Meta was not asked', () => {
    expect(pageState(page({ externalId: '33333' }), null)).toBe('receiving')
  })
})

describe('pageName', () => {
  it('takes Meta’s name, then the kept one, then its kind', () => {
    expect(pageName(page({}), managed)).toBe('2990s Furniture')
    expect(pageName(page({ channel: 'instagram', externalId: '99999' }), managed)).toBe('@2990s.my')
    expect(pageName(page({ externalId: '33333', name: 'Old page' }), managed)).toBe('Old page')
    expect(pageName(page({ externalId: '33333' }), null)).toBe('Facebook Page 33333')
  })
})

describe('connectable', () => {
  it('lists Pages, or the Pages’ Instagram accounts, and marks the connected ones', () => {
    const fb = connectable(managed, 'messenger', [page({})])
    expect(fb.map(r => [r.name, r.connected])).toEqual([['2990s Furniture', true], ['Carress Malaysia', false]])
    const ig = connectable(managed, 'instagram', [])
    expect(ig).toEqual([{ externalId: '99999', pageId: '11111', name: '@2990s.my', followers: 980, connected: false }])
  })
  it('writes followers as the window does', () => {
    expect(followersLabel(4100)).toBe('4.1k followers')
    expect(followersLabel(1000)).toBe('1k followers')
    expect(followersLabel(540)).toBe('540 followers')
    expect(followersLabel(null)).toBe('')
  })
})

describe('routeRows', () => {
  const brands = [{ id: 'b1', name: '2990s' }, { id: 'b2', name: '2990s mini' }, { id: 'b3', name: 'Carress' }]
  it('gives each receiving page its brand’s row, and the mini brand its parent’s', () => {
    const pages = [page({ id: 'a' }), page({ id: 'b', brandId: 'b3', externalId: '22222' })]
    expect(routeRows(brands, pages, managed)).toEqual([
      { brandId: 'b1', brand: '2990s', channels: ['messenger'] },
      { brandId: 'b2', brand: '2990s mini', channels: ['messenger'] },
      { brandId: 'b3', brand: 'Carress', channels: ['messenger'] },
    ])
  })
  it('leaves out paused and lost pages', () => {
    const pages = [page({ id: 'a', paused: true }), page({ id: 'b', brandId: 'b3', externalId: '44444' })]
    expect(routeRows(brands, pages, managed)).toEqual([])
  })
})

describe('ad slots', () => {
  const rules = [
    { id: 'r1', adId: 'ad1', when: 'any' as const, reply: 'cs' },
    { id: 'r2', adId: 'ad2', when: 'closed' as const, reply: 'tpl' },
    { id: 'r3', adId: 'ad3', when: 'any' as const, reply: 'ai' },
    { id: 'r4', adId: 'ad3', when: 'open' as const, reply: 'cs' },
  ]
  it('reads an ad’s two windows; the hours’ rule before an any-time one', () => {
    expect(adSlots(rules, 'ad1')).toEqual({ w: 'cs', a: 'cs' })
    expect(adSlots(rules, 'ad2')).toEqual({ w: 'follow', a: 'tpl' })
    expect(adSlots(rules, 'ad3')).toEqual({ w: 'cs', a: 'ai' })
    expect(adSlots(rules, 'none')).toEqual({ w: 'follow', a: 'follow' })
  })
  it('writes one any-time rule when both windows agree, one per window otherwise, none when both follow', () => {
    let n = 0
    const id = () => `new${++n}`
    expect(withAdSlots(rules, 'ad1', 'ai', 'ai', id).filter(r => r.adId === 'ad1')).toEqual([{ id: 'r1', adId: 'ad1', when: 'any', reply: 'ai' }])
    expect(withAdSlots(rules, 'ad1', 'cs', 'follow', id).filter(r => r.adId === 'ad1')).toEqual([{ id: 'new1', adId: 'ad1', when: 'open', reply: 'cs' }])
    expect(withAdSlots(rules, 'ad3', 'follow', 'follow', id).filter(r => r.adId === 'ad3')).toEqual([])
    expect(withAdSlots(rules, 'ad3', 'cs', 'ai', id).filter(r => r.adId === 'ad3')).toEqual([{ id: 'r4', adId: 'ad3', when: 'open', reply: 'cs' }, { id: 'new2', adId: 'ad3', when: 'closed', reply: 'ai' }])
    for (const ad of ['ad1', 'ad3']) for (const [w, a] of [['cs', 'ai'], ['ai', 'ai'], ['follow', 'cs']] as const) {
      expect(adSlots(withAdSlots(rules, ad, w, a, id), ad)).toEqual({ w, a })
    }
  })
})

describe('labels', () => {
  it('writes days as the cards do', () => {
    expect(dayRange('2026-11-08', '2026-11-08', 2026)).toBe('Sun 8 Nov')
    expect(dayRange('2026-11-02', '2026-11-04', 2026)).toBe('Mon 2 – Wed 4 Nov')
    expect(dayRange('2026-11-30', '2026-12-01', 2026)).toBe('Mon 30 Nov – Tue 1 Dec')
    expect(dayRange('2027-01-01', '2027-01-01', 2026)).toBe('Fri 1 Jan 2027')
  })
  it('says a holiday’s mode', () => {
    expect(holidayMode({ mode: 'closed', open: '10:00', close: '22:00' })).toBe('Closed all day')
    expect(holidayMode({ mode: 'custom', open: '10:00', close: '18:00' })).toBe('10:00 AM – 6:00 PM')
  })
})
