import { afterEach, describe, expect, it, vi } from 'vitest'
import { AWAY_RELOAD_MS, TYPING_GRACE_MS, isTypingField, readLiveVersion, updateStep, wasBusy } from './app-update'

describe('updateStep', () => {
  const base = { built: 'dpl_old', live: 'dpl_new', awayMs: 0, busy: false }

  it('does nothing while the server runs the same build, cannot say, or the build has no name', () => {
    expect(updateStep({ ...base, live: 'dpl_old' })).toBe('none')
    expect(updateStep({ ...base, live: null })).toBe('none')
    expect(updateStep({ ...base, built: '' })).toBe('none')
  })

  it('offers a newer build while the app is in use', () => {
    expect(updateStep(base)).toBe('prompt')
    expect(updateStep({ ...base, awayMs: AWAY_RELOAD_MS - 1 })).toBe('prompt')
  })

  it('loads it on return after half an hour away — unless a form was being filled', () => {
    expect(updateStep({ ...base, awayMs: AWAY_RELOAD_MS })).toBe('reload')
    expect(updateStep({ ...base, awayMs: 8 * 60 * 60_000 })).toBe('reload')
    expect(updateStep({ ...base, awayMs: AWAY_RELOAD_MS, busy: true })).toBe('prompt')
  })
})

describe('what counts as a form being filled', () => {
  const el = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild
  }

  it('is a field you type or pick in, not a button or a tick box', () => {
    expect(isTypingField(el('<input>'))).toBe(true)
    expect(isTypingField(el('<input type="number">'))).toBe(true)
    expect(isTypingField(el('<textarea></textarea>'))).toBe(true)
    expect(isTypingField(el('<select></select>'))).toBe(true)
    expect(isTypingField(el('<input type="checkbox">'))).toBe(false)
    expect(isTypingField(el('<button>Save</button>'))).toBe(false)
    expect(isTypingField(document.body)).toBe(false)
    expect(isTypingField(null)).toBe(false)
  })

  it('is still the focused field, or typing in the ten minutes before leaving', () => {
    const left = 100 * 60_000
    expect(wasBusy({ focused: el('<textarea></textarea>'), lastInputAt: null, hiddenAt: left })).toBe(true)
    expect(wasBusy({ focused: null, lastInputAt: left - 2 * 60_000, hiddenAt: left })).toBe(true)
    expect(wasBusy({ focused: null, lastInputAt: left - TYPING_GRACE_MS, hiddenAt: left })).toBe(false)
    expect(wasBusy({ focused: null, lastInputAt: null, hiddenAt: left })).toBe(false)
  })
})

describe('readLiveVersion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it("reads the build's name off /sw.js without the browser's cache", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200, headers: { 'x-app-version': 'dpl_new' } }))
    vi.stubGlobal('fetch', fetch)
    await expect(readLiveVersion()).resolves.toBe('dpl_new')
    expect(fetch).toHaveBeenCalledWith('/sw.js', { method: 'HEAD', cache: 'no-store' })
  })

  it('cannot say when the request fails, the answer is not OK, or the header is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(readLiveVersion()).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    await expect(readLiveVersion()).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
    await expect(readLiveVersion()).resolves.toBeNull()
  })
})
