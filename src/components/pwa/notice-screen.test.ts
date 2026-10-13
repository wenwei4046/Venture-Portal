import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerOnScreen, closeNotices } from './notice-screen'

// The CRM on the phone (2026-10-14): a chat open on the screen answers the service worker's question, so a customer's
// message is not announced over the chat it belongs to; and a chat opened in the app takes its notice off the shade.

function fakeWorker(shown: Array<{ close: () => void }> = []) {
  const listeners = new Set<(e: MessageEvent) => void>()
  const getNotifications = vi.fn(async (_f: { tag: string }) => shown)
  const sw = {
    addEventListener: vi.fn((_t: string, fn: (e: MessageEvent) => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_t: string, fn: (e: MessageEvent) => void) => listeners.delete(fn)),
    startMessages: vi.fn(),
    getRegistration: vi.fn(async () => ({ getNotifications })),
  }
  vi.stubGlobal('navigator', { ...navigator, serviceWorker: sw })
  /** The worker asks; the answer comes back on the port. */
  const ask = (tag: string) => {
    const reply = vi.fn()
    for (const fn of listeners) fn({ data: { type: 'vp-notice-on-screen?', tag }, ports: [{ postMessage: reply }] } as unknown as MessageEvent)
    return reply
  }
  return { sw, ask, listeners, getNotifications }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('what is on the screen', () => {
  it('answers for the chat open on it, and only that one', () => {
    const { sw, ask } = fakeWorker()
    const stop = answerOnScreen(tag => tag === 'crm:c1')
    expect(sw.startMessages).toHaveBeenCalled()
    expect(ask('crm:c1')).toHaveBeenCalledWith({ onScreen: true })
    expect(ask('crm:c2')).toHaveBeenCalledWith({ onScreen: false })
    stop()
    expect(ask('crm:c1')).not.toHaveBeenCalled()
  })

  it('a page in the background shows nothing', () => {
    const { ask } = fakeWorker()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    answerOnScreen(() => true)
    expect(ask('crm:c1')).toHaveBeenCalledWith({ onScreen: false })
    vi.restoreAllMocks()
  })

  it('other messages are not its to answer', () => {
    const { listeners } = fakeWorker()
    answerOnScreen(() => true)
    const reply = vi.fn()
    for (const fn of listeners) fn({ data: { type: 'something else' }, ports: [{ postMessage: reply }] } as unknown as MessageEvent)
    expect(reply).not.toHaveBeenCalled()
  })

  it('a chat opened in the app takes its notices off the shade', async () => {
    const a = { close: vi.fn() }, b = { close: vi.fn() }
    const { getNotifications } = fakeWorker([a, b])
    await closeNotices('crm:c1')
    expect(getNotifications).toHaveBeenCalledWith({ tag: 'crm:c1' })
    expect([a.close, b.close].every(c => c.mock.calls.length === 1)).toBe(true)
  })

  it('quiet where there is no service worker', async () => {
    vi.stubGlobal('navigator', {})
    expect(() => answerOnScreen(() => true)()).not.toThrow()
    await expect(closeNotices('crm:c1')).resolves.toBeUndefined()
  })
})
