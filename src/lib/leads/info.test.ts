import { describe, expect, it } from 'vitest'
import { HALF_HOURS, cardStatus, hoursProblem, infoEntries, isLive, resolveTokens, slug, tokenOf, type InfoCard, type LeadInfo } from './info'

const card = (over: Partial<InfoCard> = {}): InfoCard => ({
  id: 'k', catId: 'shop', brandId: 'b1', name: 'KL showroom', code: 'kl', status: 'on', validFrom: null, validUntil: null, note: '',
  fields: [{ key: 'address', label: 'Address', value: 'Jalan Klang Lama' }, { key: 'phone', label: 'Phone', value: '' }], uses: [], ...over,
})
const today = '2026-10-22'

describe('a General info card', () => {
  it('names its fields as tokens', () => {
    expect(slug('Instal Plan!')).toBe('instal-plan')
    expect(tokenOf(card(), { key: 'address', label: 'Address' })).toBe('{kl.address}')
    expect(tokenOf(card({ code: '' , name: 'Mid Valley' }), { key: null, label: 'Delivery time' })).toBe('{mid-valley.delivery-time}')
  })
  it('says where it stands', () => {
    expect(cardStatus(card({ status: 'draft' }), today).label).toBe('Draft')
    expect(cardStatus(card({ validFrom: '2026-11-08' }), today)).toEqual({ label: 'Starts 8 Nov', tone: 'none', keys: ['Scheduled'] })
    expect(cardStatus(card({ validUntil: '2026-10-20' }), today)).toEqual({ label: 'Expired', tone: 'red', keys: ['Expired', 'In use'] })
    expect(cardStatus(card({ validUntil: '2026-10-26' }), today)).toEqual({ label: 'Ends in 4 days', tone: 'amber', keys: ['Ending soon', 'In use'] })
    expect(cardStatus(card({ status: 'off' }), today).label).toBe('Off')
    expect(cardStatus(card(), today)).toEqual({ label: 'In use', tone: 'green', keys: ['In use'] })
  })
  it('is live only in use and inside its dates', () => {
    expect(isLive(card(), today)).toBe(true)
    expect(isLive(card({ status: 'off' }), today)).toBe(false)
    expect(isLive(card({ validUntil: '2026-10-21' }), today)).toBe(false)
    expect(isLive(card({ validFrom: '2026-10-22', validUntil: '2026-10-22' }), today)).toBe(true)
  })
})

describe('the Inbox’s menu and the tokens', () => {
  const info: LeadInfo = {
    cats: [{ id: 'shop', kind: 'showroom', label: 'Showrooms', icon: 'store', custom: false }],
    cards: [card(), card({ id: 'p', brandId: null, code: 'instal', name: 'Instalment', fields: [{ key: null, label: 'Plan', value: '0% 12 months' }], note: 'Min RM 1,000' }),
      card({ id: 'c', brandId: 'b2', code: 'puchong' }), card({ id: 'd', code: 'draft-one', status: 'draft' })],
  }
  it('offers the brand’s live cards and every brand’s, filled fields only, the note last', () => {
    const e = infoEntries(info, 'b1', today)
    expect(e.map(x => x.card.code)).toEqual(['kl', 'instal'])
    expect(e[0].fields).toEqual([{ label: 'Address', value: 'Jalan Klang Lama', token: '{kl.address}' }])
    expect(e[1].fields.map(f => f.token)).toEqual(['{instal.plan}', '{instal.notes}'])
  })
  it('fills tokens from live cards and leaves the rest as written', () => {
    expect(resolveTokens('Visit {kl.address} · {instal.plan} · {instal.notes} · {kl.phone} · {draft-one.address}', info, today))
      .toBe('Visit Jalan Klang Lama · 0% 12 months · Min RM 1,000 · {kl.phone} · {draft-one.address}')
  })
})

describe('business hours', () => {
  const week = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, on: i < 5, from: '10:00', to: '22:00' }))
  it('lists every half hour as the handoff writes it', () => {
    expect(HALF_HOURS).toHaveLength(48)
    expect([HALF_HOURS[0].l, HALF_HOURS[1].l, HALF_HOURS[24].l, HALF_HOURS[47].l]).toEqual(['12:00 AM', '12:30 AM', '12:00 PM', '11:30 PM'])
  })
  it('says what the save would refuse', () => {
    expect(hoursProblem({ week, specials: [] })).toBeNull()
    expect(hoursProblem({ week: week.map(d => (d.day === 2 ? { ...d, to: '09:00' } : d)), specials: [] })).toBe('Tuesday closes before it opens.')
    expect(hoursProblem({ week: week.map(d => (d.day === 2 ? { ...d, to: '00:00' } : d)), specials: [] })).toBeNull()
    expect(hoursProblem({ week, specials: [{ id: 's', name: 'Deepavali', from: '2026-11-09', to: '2026-11-08', mode: 'closed', open: '10:00', close: '18:00' }] }))
      .toBe('Deepavali ends before it starts.')
  })
})

describe('a showroom’s map links from its address (2026-10-29)', () => {
  it('makes Google Maps’ and Waze’s links, and follows the address only while a link is its own', async () => {
    const { followAddress, mapsLinkOf, wazeLinkOf } = await import('./info')
    const addr = '51, Jln Utara, Pjs 12, 46200 Petaling Jaya'
    expect(mapsLinkOf(addr)).toBe('https://www.google.com/maps/search/?api=1&query=51%2C%20Jln%20Utara%2C%20Pjs%2012%2C%2046200%20Petaling%20Jaya')
    expect(wazeLinkOf(addr)).toBe('https://waze.com/ul?q=51%2C%20Jln%20Utara%2C%20Pjs%2012%2C%2046200%20Petaling%20Jaya&navigate=yes')
    expect(mapsLinkOf('  ')).toBe('')
    const fields = [{ key: 'address', label: 'Address', value: addr }, { key: 'maps', label: 'Google Maps', value: '' }, { key: 'waze', label: 'Waze', value: 'https://waze.com/ul/hw2838' }] as never
    const after = followAddress(fields, '', addr) as Array<{ value: string }>
    expect(after[1].value).toBe(mapsLinkOf(addr))
    expect(after[2].value).toBe('https://waze.com/ul/hw2838')
    const moved = followAddress(after as never, addr, 'Mid Valley') as Array<{ value: string }>
    expect(moved[1].value).toBe(mapsLinkOf('Mid Valley'))
  })
})
