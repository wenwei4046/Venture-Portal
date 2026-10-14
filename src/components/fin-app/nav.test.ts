import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { canStepBack, keepScroll, notePop, peekIntent, pushIntent, resetNav, scrollOf, setIntent, takeIntent, useStep } from './nav'

// How the Finance app moves (2026-10-15, README › Motion): a move says which way
// before it happens, the next screen takes it once; Back is a pop, heard once
// whoever hears it first; a page's own screens are history steps.

afterEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/')
})

describe('the move into the next screen', () => {
  it('is read without being used up, then used up once', () => {
    setIntent('push')
    expect(peekIntent()).toBe('push')
    expect(peekIntent()).toBe('push')
    expect(takeIntent()).toBe('push')
    expect(takeIntent()).toBeNull()
  })

  it('is a pop on the browser’s Back, counted once however many listeners hear it', () => {
    pushIntent()
    pushIntent()
    expect(canStepBack()).toBe(true)
    takeIntent()
    const e = new PopStateEvent('popstate')
    notePop(e)
    notePop(e)
    expect(takeIntent()).toBe('pop')
    expect(canStepBack()).toBe(true)
    notePop(new PopStateEvent('popstate'))
    expect(canStepBack()).toBe(false)
  })

  it('keeps where each screen was left', () => {
    keepScroll('payments?f=all', 640)
    expect(scrollOf('payments?f=all')).toBe(640)
    expect(scrollOf('payments?f=draft')).toBe(0)
  })
})

describe('a page’s own screens', () => {
  const read = (q: URLSearchParams) => q.get('f') ?? 'hub'

  it('opens a screen as a history step, and Back steps back to it', async () => {
    window.history.replaceState(null, '', '/fin-app/daily/payments')
    const { result } = renderHook(() => useStep(read, ''))
    expect(result.current[0]).toBe('hub')
    act(() => result.current[1]('f=all'))
    expect(result.current[0]).toBe('all')
    expect(window.location.search).toBe('?f=all')
    expect(takeIntent()).toBe('push')
    expect(canStepBack()).toBe(true)
  })

  it('goes straight up to the screen above when there is no step to go back to (a link, a refresh)', () => {
    window.history.replaceState(null, '', '/fin-app/daily/payments?id=v1&from=all')
    const { result } = renderHook(() => useStep(read, 'id=v1&from=all'))
    act(() => result.current[2]('f=all'))
    expect(window.location.search).toBe('?f=all')
    expect(result.current[0]).toBe('all')
    expect(takeIntent()).toBe('pop')
  })
})
