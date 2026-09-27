import { describe, expect, it } from 'vitest'
import { previousEntryIs, previousEntryUrl, sameLocation } from './history-entry'

const BASE = 'https://portal.example/revenue/fair/2026-09-01/orders/o-1'

function fakeWindow(entries: string[], current: number, navigation = true): Window {
  return {
    location: { href: BASE },
    navigation: navigation
      ? {
          currentEntry: { url: entries[current], index: current },
          entries: () => entries.map((url, index) => ({ url, index })),
        }
      : undefined,
  } as unknown as Window
}

describe('sameLocation', () => {
  it('is the same page and query, whatever order the query is written in', () => {
    expect(sameLocation('/revenue/fair/2026-09-01?person=a&orders=deposit', 'https://portal.example/revenue/fair/2026-09-01?orders=deposit&person=a', BASE)).toBe(true)
  })

  it('differs on the path, the origin or any value', () => {
    expect(sameLocation('/revenue/fair/2026-09-01?person=a', '/revenue/fair/2026-09-01?person=b', BASE)).toBe(false)
    expect(sameLocation('/revenue/fair/2026-09-01?person=a', '/revenue/fair/2026-09-01', BASE)).toBe(false)
    expect(sameLocation('/revenue/fair/2026-09-01', '/revenue/fair/2026-08-01', BASE)).toBe(false)
    expect(sameLocation('https://elsewhere.example/revenue/fair/2026-09-01', '/revenue/fair/2026-09-01', BASE)).toBe(false)
  })
})

describe('previousEntryIs', () => {
  const ledger = 'https://portal.example/revenue/fair/2026-09-01?person=a'

  it('is true only when the entry before this one is that page', () => {
    const win = fakeWindow(['https://portal.example/revenue/fair/2026-09-01', ledger, BASE], 2)
    expect(previousEntryUrl(win)).toBe(ledger)
    expect(previousEntryIs('/revenue/fair/2026-09-01?person=a', win)).toBe(true)
    expect(previousEntryIs('/revenue/fair/2026-09-01', win)).toBe(false)
  })

  it('is false on the first entry of a tab — a bill opened in a new tab has nothing to go back to', () => {
    expect(previousEntryIs('/revenue/fair/2026-09-01?person=a', fakeWindow([BASE], 0))).toBe(false)
  })

  it('is false where the browser has no Navigation API', () => {
    expect(previousEntryIs('/revenue/fair/2026-09-01?person=a', fakeWindow([ledger, BASE], 1, false))).toBe(false)
  })
})
