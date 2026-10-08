import { describe, expect, it } from 'vitest'
import { FRESH_ENOUGH_MS, cameFromMemory, forgetReads, markRead, markWarmed, rscPath, staleInMemory } from './route-freshen'

// 2026-10-08 (user: switching to another tab is very slow): pages stay in the router's memory for five
// minutes and a page shown from memory is read again behind itself. Only from memory — a page the server
// just rendered for the click is already current, and refreshing it would render it twice.
describe('a page shown from memory is told from one the server just rendered', () => {
  const base = { startedAt: 1000, skeletonAt: null, fetches: [], path: '/payments' }

  it('no skeleton and no fetch of its payload since the click: from memory', () => {
    expect(cameFromMemory(base)).toBe(true)
    // A fetch of it BEFORE the click is the warm or the earlier visit it is being shown from.
    expect(cameFromMemory({ ...base, fetches: [{ path: '/payments', start: 400 }] })).toBe(true)
    // Another page's payload says nothing about this one.
    expect(cameFromMemory({ ...base, fetches: [{ path: '/receipts', start: 1100 }] })).toBe(true)
  })

  it('streamed in behind a route skeleton: from the server', () => {
    expect(cameFromMemory({ ...base, skeletonAt: 1020 })).toBe(false)
    // A skeleton from an earlier navigation does not count.
    expect(cameFromMemory({ ...base, skeletonAt: 900 })).toBe(true)
  })

  it('its payload was fetched after the click: from the server', () => {
    expect(cameFromMemory({ ...base, fetches: [{ path: '/payments', start: 1003 }] })).toBe(false)
  })

  it('the hard load was rendered for the request itself', () => {
    expect(cameFromMemory({ ...base, startedAt: null })).toBe(false)
  })
})

// Next 15's router.refresh() throws the router's whole memory away, so a page shown from memory is refreshed
// only when what memory held is more than a minute old — otherwise every revisit would make the next tab cold.
describe('how old the page in memory is', () => {
  it('a page read less than a minute ago is left alone; older, or never on record, is read again', () => {
    markRead('/a', 10_000)
    expect(staleInMemory('/a', 10_000 + FRESH_ENOUGH_MS - 1)).toBe(false)
    expect(staleInMemory('/a', 10_000 + FRESH_ENOUGH_MS)).toBe(true)
    expect(staleInMemory('/never-seen', 0)).toBe(true)
  })

  it('a warm counts only when nothing was on record (it may have found the page still in memory)', () => {
    markWarmed('/w', 5_000)
    expect(staleInMemory('/w', 5_000 + 1_000)).toBe(false)
    markRead('/w2', 1_000)
    markWarmed('/w2', 90_000)
    expect(staleInMemory('/w2', 90_000)).toBe(true)
  })

  it('after a refresh only the page on screen is on record — the router forgot the rest', () => {
    markRead('/x', 1_000)
    markRead('/y', 1_000)
    forgetReads('/y', 2_000)
    expect(staleInMemory('/x', 2_001)).toBe(true)
    expect(staleInMemory('/y', 2_001)).toBe(false)
  })
})

describe('RSC payloads', () => {
  it('reads the page an RSC payload was for', () => {
    expect(rscPath('https://venture-portal-chi.vercel.app/payments?_rsc=1x2y')).toBe('/payments')
    expect(rscPath('/reports/ledger?from=2026-09-01&_rsc=abc')).toBe('/reports/ledger')
    expect(rscPath('https://venture-portal-chi.vercel.app/_next/static/chunks/app.js')).toBeNull()
    expect(rscPath('/payments')).toBeNull()
  })
})
