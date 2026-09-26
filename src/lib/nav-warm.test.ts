import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INTENT_MS,
  RAIL_SETTLE_MS,
  canWarm,
  cancelWarmIntent,
  isAuditedRoute,
  railEntered,
  warmOnIntent,
  warmRoute,
} from './nav-warm'

// Vitest runs from the repository root.
const APP_DIR = resolve(process.cwd(), 'src/app')

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return pageFiles(path)
    return name === 'page.tsx' ? [path] : []
  })
}

/** src/app/(portal)/director-salary/[directorId]/page.tsx → /director-salary/x1 */
function sampleRoute(file: string): string {
  const segments = relative(APP_DIR, file)
    .split(/[\\/]/)
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => (/^\[.*\]$/.test(segment) ? 'x1' : segment))
  return '/' + segments.join('/')
}

describe('audited routes are never warmed', () => {
  // A warm is a full prefetch, and the server cannot tell it from a visit. A
  // page that writes access_log while it renders would record a view every
  // time somebody's pointer rested on its link. Every such page must be on
  // AUDITED_ROUTES — this fails the day one is added without it.
  const audited = pageFiles(APP_DIR).filter((file) => readFileSync(file, 'utf8').includes('log_data_access'))

  it('finds the pages that log on render (the scan itself works)', () => {
    expect(audited.map(sampleRoute).sort()).toEqual(
      ['/director-salary/x1', '/director-salary/x1/print', '/team/people'].sort(),
    )
  })

  it.each(audited.map((file) => [sampleRoute(file)]))('%s is on AUDITED_ROUTES', (route) => {
    expect(isAuditedRoute(route)).toBe(true)
  })

  it('does not over-reach onto the pages around them', () => {
    expect(isAuditedRoute('/team/hierarchy')).toBe(false)
    expect(isAuditedRoute('/team/people/new')).toBe(false)
    expect(isAuditedRoute('/director-salary')).toBe(false)
    expect(isAuditedRoute('/fund-in')).toBe(false)
  })
})

describe('canWarm', () => {
  const here = 'https://portal.example/hr-costing/payroll'

  it('warms another page of the portal', () => {
    expect(canWarm('/fund-in', here)).toBe(true)
    expect(canWarm('/settings?tab=banks', here)).toBe(true)
  })

  it('never warms the page being read, another origin, or an audited page', () => {
    expect(canWarm('/hr-costing/payroll', here)).toBe(false)
    expect(canWarm('https://elsewhere.example/fund-in', here)).toBe(false)
    expect(canWarm('/team/people', here)).toBe(false)
  })

  it('respects a data-saver connection', () => {
    const nav = navigator as Navigator & { connection?: unknown }
    const had = Object.getOwnPropertyDescriptor(nav, 'connection')
    Object.defineProperty(nav, 'connection', { value: { saveData: true }, configurable: true })
    try {
      expect(canWarm('/fund-in', here)).toBe(false)
    } finally {
      if (had) Object.defineProperty(nav, 'connection', had)
      else delete (nav as { connection?: unknown }).connection
    }
  })
})

describe('warmOnIntent', () => {
  const prefetch = vi.fn()
  const router = { prefetch }

  beforeEach(() => {
    vi.useFakeTimers()
    prefetch.mockReset()
    window.history.replaceState(null, '', '/hr-costing/payroll')
    railEntered(0)
  })
  afterEach(() => {
    cancelWarmIntent()
    vi.useRealTimers()
  })

  it('warms the link once the pointer has rested on it', () => {
    warmOnIntent(router, '/fund-in')
    vi.advanceTimersByTime(INTENT_MS - 1)
    expect(prefetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(prefetch).toHaveBeenCalledWith('/fund-in')
  })

  it('warms nothing when the pointer moves on first', () => {
    warmOnIntent(router, '/fund-in')
    vi.advanceTimersByTime(INTENT_MS / 2)
    cancelWarmIntent()
    vi.advanceTimersByTime(INTENT_MS * 4)
    expect(prefetch).not.toHaveBeenCalled()
  })

  it('resolves a sweep to the link it stops on', () => {
    warmOnIntent(router, '/fund-in')
    vi.advanceTimersByTime(40)
    warmOnIntent(router, '/fund-out')
    vi.advanceTimersByTime(40)
    warmOnIntent(router, '/overdue')
    vi.advanceTimersByTime(INTENT_MS)
    expect(prefetch.mock.calls).toEqual([['/overdue']])
  })

  it('waits for a rail that is still sliding open', () => {
    const now = Date.now()
    railEntered(now)
    warmOnIntent(router, '/fund-in', now)
    vi.advanceTimersByTime(INTENT_MS)
    expect(prefetch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(RAIL_SETTLE_MS - INTENT_MS)
    expect(prefetch).toHaveBeenCalledWith('/fund-in')
  })

  it('never warms an audited page, however long the pointer rests', () => {
    warmOnIntent(router, '/team/people')
    vi.advanceTimersByTime(INTENT_MS * 10)
    expect(prefetch).not.toHaveBeenCalled()
  })

  it('swallows a prefetch that throws', () => {
    prefetch.mockImplementation(() => {
      throw new Error('Invalid href')
    })
    expect(() => warmRoute(router, '/fund-in')).not.toThrow()
  })
})
