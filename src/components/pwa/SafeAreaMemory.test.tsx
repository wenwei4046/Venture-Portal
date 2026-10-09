import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SAFE_BOTTOM_FLOOR_VAR, type SafeBottomMemory } from '@/lib/safe-area'
import SafeAreaMemory from './SafeAreaMemory'

// What the browser says the inset is (the probe's height), and the window it says it in.
let inset = 0
const measure = () => inset

function windowOf(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

function tab(remembered: SafeBottomMemory | null) {
  let raw = remembered ? JSON.stringify(remembered) : null
  return {
    read: () => raw,
    write: (memory: SafeBottomMemory) => { raw = JSON.stringify(memory) },
    get remembered(): SafeBottomMemory | null { return raw ? JSON.parse(raw) : null },
  }
}

const floor = () => document.documentElement.style.getPropertyValue(SAFE_BOTTOM_FLOOR_VAR)

/** The browser changes its mind; the page hears about it (here: a resize). */
function browserSays(px: number) {
  inset = px
  act(() => { window.dispatchEvent(new Event('resize')) })
}

beforeEach(() => {
  inset = 0
  windowOf(412, 915)
})
afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty(SAFE_BOTTOM_FLOOR_VAR)
})

describe('SafeAreaMemory', () => {
  it('a fresh launch: remembers the inset the browser gives, and adds nothing to it', () => {
    inset = 48
    const store = tab(null)
    render(<SafeAreaMemory store={store} measure={measure} />)
    expect(store.remembered).toEqual({ width: 412, height: 915, inset: 48 })
    expect(floor()).toBe('')
  })

  it('a reload that comes back with 0 in the same window stands the bars on the remembered inset', () => {
    const store = tab({ width: 412, height: 915, inset: 48 })
    render(<SafeAreaMemory store={store} measure={measure} />)
    expect(floor()).toBe('48px')
  })

  it('lets go the moment the browser speaks, and believes a later 0 (the keyboard)', () => {
    const store = tab({ width: 412, height: 915, inset: 48 })
    render(<SafeAreaMemory store={store} measure={measure} />)
    expect(floor()).toBe('48px')
    browserSays(48)
    expect(floor()).toBe('')
    browserSays(0)
    expect(floor()).toBe('')
  })

  it('keeps what the browser said last: gesture navigation after three buttons', () => {
    inset = 48
    const store = tab(null)
    render(<SafeAreaMemory store={store} measure={measure} />)
    browserSays(24)
    expect(store.remembered).toEqual({ width: 412, height: 915, inset: 24 })
  })

  it('leaves another window to the browser — and holds the bar again back in the remembered one', () => {
    const store = tab({ width: 412, height: 915, inset: 48 })
    windowOf(915, 412)
    render(<SafeAreaMemory store={store} measure={measure} />)
    expect(floor()).toBe('')
    windowOf(412, 915)
    browserSays(0)
    expect(floor()).toBe('48px')
  })

  it('lifts a floor the head script set for a window that is not the remembered one', () => {
    document.documentElement.style.setProperty(SAFE_BOTTOM_FLOOR_VAR, '48px')
    windowOf(412, 867)
    render(<SafeAreaMemory store={tab({ width: 412, height: 915, inset: 48 })} measure={measure} />)
    expect(floor()).toBe('')
  })

  it('draws only the probe, hidden from assistive tech', () => {
    const { container } = render(<SafeAreaMemory store={tab(null)} measure={measure} />)
    const probe = container.querySelector('.safe-bottom-probe')
    expect(probe).not.toBeNull()
    expect(probe).toHaveAttribute('aria-hidden', 'true')
  })
})
