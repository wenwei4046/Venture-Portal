import { describe, expect, it } from 'vitest'
import { adRowsOf, byReplyOf, dropOf, funnelOf, insightRange, speedOf } from './insight'
import type { LeadContact } from './types'

const c = (o: Partial<LeadContact>): LeadContact => ({
  id: Math.random().toString(36), brandId: 'b1', channel: 'messenger', name: 'X', phone: null, sourceAd: '', adId: null, shown: null, handedAt: null,
  ...o,
} as unknown as LeadContact)

describe('Insight v2', () => {
  it('reads the range from the address, office days, today included', () => {
    expect(insightRange(undefined, '2026-10-23')).toMatchObject({ key: '30', from: '2026-09-24', to: '2026-10-23', label: 'Last 30 days' })
    expect(insightRange('7', '2026-10-23')).toMatchObject({ from: '2026-10-17', to: '2026-10-23' })
    expect(insightRange('q', '2026-10-23')).toMatchObject({ from: '2026-10-01', label: '1 Oct – 23 Oct 2026' })
    expect(insightRange('q', '2026-12-05').from).toBe('2026-10-01')
  })

  it('counts from message to sale, each step against the one before', () => {
    const rows = [c({ phone: '0123' , handedAt: 'x', shown: 'came' as never, closedAt: 'y' }), c({ phone: '0124' }), c({}), c({})]
    expect(funnelOf(rows).map(f => [f.label, f.n, f.rate])).toEqual([
      ['Conversations', 4, 'all chats'], ['Gave a phone', 2, '50% of previous'], ['Handed to sales', 1, '50% of previous'],
      ['Came to showroom', 1, '100% of previous'], ['Bought', 1, '100% of previous'],
    ])
  })

  it('puts ads on their own rows and the rest under Organic per brand', () => {
    const rows = adRowsOf([c({ adId: '123456', adName: 'Sofa Week' }), c({ adId: '123456', adName: 'Sofa Week', phone: '0123' }), c({})], [{ id: 'b1', name: '2990s' }])
    expect(rows.map(r => [r.name, r.chats, r.phones, r.organic])).toEqual([['Sofa Week', 2, 1, false], ['Organic · 2990s', 1, 0, true]])
  })

  it('says who answered first and how fast', () => {
    expect(speedOf([])).toBe('—')
    expect(speedOf([3, 5, 2])).toBe('instant')
    expect(speedOf([60, 400, 9000])).toBe('7 min')
    const r = byReplyOf([
      { brandId: 'b1', test: false, phone: true, by: 'cs', secs: 300 },
      { brandId: 'b1', test: false, phone: false, by: 'cs', secs: 600 },
      { brandId: 'b1', test: false, phone: true, by: 'template', secs: 1 },
      { brandId: 'b1', test: false, phone: false, by: null, secs: null },
    ])
    expect(r.map(x => [x.label, x.chats, x.rate, x.speed])).toEqual([['Person', 2, 50, '5 min'], ['Template', 1, 100, 'instant'], ['AI Agent', 0, null, '—']])
  })

  it('shows how far a template got, as a share of its first step', () => {
    const flow = { id: 'f', steps: [{ id: 's1', text: 'Welcome' }, { id: 's2', text: 'Which sofa?' }, { id: 's3', text: 'Phone?' }] } as never
    const d = dropOf(flow, [{ flowId: 'f', brandId: 'b1', test: false, stepId: 's1', n: 10 }, { flowId: 'f', brandId: 'b2', test: false, stepId: 's2', n: 4 }, { flowId: 'g', brandId: 'b1', test: false, stepId: 's3', n: 9 }])
    expect(d.map(x => [x.label, x.n, x.pct])).toEqual([['Welcome', 10, 100], ['Which sofa?', 4, 40]])
  })
})
