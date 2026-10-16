import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'

// Phone notifications in the service worker (2026-10-11). The first test push reached the user's phone, but its
// status-bar icon was a solid white square (Android keeps only a badge's alpha, and the badge was the opaque
// app tile), and a tap did not bring the app forward (the page was loaded before the window was focused, and the
// moment a tap allows for that had passed). The second focused the most recently used window first — a Chrome
// tab of the site, not the installed app. public/sw.js runs here in a sandbox with a fake `self`.

const ROOT = resolve(__dirname, '../../..')
const SW = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8')
const ORIGIN = 'https://erp.houzsventure.com'

type Listener = (event: unknown) => void
type Win = { url: string; focus: () => Promise<Win>; navigate: (url: string) => Promise<Win> }

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
// The user's iPhone, as it signed up for notifications (2026-10-17).
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15'
const CHROME_ON_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1'

function worker(open: Win[] = [], userAgent = ANDROID) {
  const listeners: Record<string, Listener> = {}
  const showNotification = vi.fn(async (_title: string, _options: unknown) => undefined)
  const clients = { matchAll: vi.fn(async (_opts?: unknown) => open), openWindow: vi.fn(async (_url: string) => null), claim: vi.fn() }
  const self = {
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn },
    registration: { showNotification },
    clients,
    location: { origin: ORIGIN },
    navigator: { userAgent },
    skipWaiting: vi.fn(),
  }
  new Function('self', 'caches', SW)(self, {})
  return { listeners, showNotification, clients }
}

function win(url: string): Win {
  const w: Win = {
    url,
    focus: vi.fn(async () => w),
    navigate: vi.fn(async (to: string) => {
      w.url = to
      return w
    }),
  }
  return w
}

async function tap(listeners: Record<string, Listener>, url: string) {
  let work: Promise<unknown> = Promise.resolve()
  const close = vi.fn()
  listeners.notificationclick({ notification: { close, data: { url } }, waitUntil: (p: Promise<unknown>) => { work = p } })
  await work
  return close
}

const NOTICE = '/hr-app?open=booking:abc'

describe('a push on the phone', () => {
  it('shows the tile with its H cut out as the status-bar badge, and the app tile as the icon', async () => {
    const { listeners, showNotification } = worker()
    let work: Promise<unknown> = Promise.resolve()
    listeners.push({
      data: { json: () => ({ title: 'Booked for you', body: 'Meeting Room 1 · 10:00', url: NOTICE, tag: 'n1' }) },
      waitUntil: (p: Promise<unknown>) => { work = p },
    })
    await work
    expect(showNotification).toHaveBeenCalledWith('Booked for you', expect.objectContaining({
      body: 'Meeting Room 1 · 10:00', tag: 'n1', icon: '/icons/icon-192.png', badge: '/icons/badge-tile-96.png', data: { url: NOTICE },
    }))
  })

  // 2026-10-17 (the user: "when i press the pop up notification, it wont jump direct to the chat screen" — an iPhone on
  // iOS 18.7): iOS 18.4+ opens a notice's `navigate` itself, where a tap reaches the worker only while the app's page
  // is alive. Whole, on this site; a notice with no place of its own, the app's start.
  it('carries its place whole as `navigate`, for an iPhone to open by itself', async () => {
    const { listeners, showNotification } = worker()
    let work: Promise<unknown> = Promise.resolve()
    listeners.push({ data: { json: () => ({ title: 'Booked for you', url: NOTICE, tag: 'n1' }) }, waitUntil: (p: Promise<unknown>) => { work = p } })
    await work
    expect(showNotification.mock.calls[0][1]).toMatchObject({ navigate: `${ORIGIN}${NOTICE}` })

    for (const url of [undefined, 'https://evil.example/x', '//evil.example/x']) {
      showNotification.mockClear()
      listeners.push({ data: { json: () => ({ title: 'x', url }) }, waitUntil: (p: Promise<unknown>) => { work = p } })
      await work
      expect(showNotification.mock.calls[0][1]).toMatchObject({ navigate: `${ORIGIN}/` })
    }
  })

  // The review of #520 (2026-10-17): the place is read before the notice is shown, and `new URL('//', origin)` throws —
  // a push that shows nothing is one an iPhone may take the app's notifications away for. An address no URL can be made
  // of is the app's start; the notice, a CRM chat's too, is shown all the same, and a tap on it opens the start.
  it('an address no URL can be made of still shows the notice, opening the app’s start', async () => {
    const back = String.fromCharCode(92)
    for (const url of ['//', '///', `/${back}`]) {
      const { listeners, showNotification, clients } = worker()
      let work: Promise<unknown> = Promise.resolve()
      listeners.push({ data: { json: () => ({ title: 'x', url }) }, waitUntil: (p: Promise<unknown>) => { work = p } })
      await work
      expect(showNotification).toHaveBeenCalledTimes(1)
      expect(showNotification.mock.calls[0][1]).toMatchObject({ navigate: `${ORIGIN}/` })

      listeners.push({
        data: { json: () => ({ title: 'Lww', body: 'Hi', url, tag: 'crm:c1', id: 'n1', crm: { ch: 'whatsapp', name: 'Lww', line: 'Hi', at: '2026-10-17T00:24:00Z' } }) },
        waitUntil: (p: Promise<unknown>) => { work = p },
      })
      await work
      expect(showNotification).toHaveBeenCalledTimes(2)
      expect(showNotification.mock.calls[1][1]).toMatchObject({ navigate: `${ORIGIN}/` })

      await tap(listeners, url)
      expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`)
    }
  })

  // Android keeps only a badge's alpha and paints it white: a bare H looked plain to the user (2026-10-11), so the
  // badge is the mark's tile, white, with the H cut out — a tile, the one shape that place can show.
  it('the badge is a white tile with the H cut out, 96px, on transparent', async () => {
    const { data, info } = await sharp(resolve(ROOT, 'public/icons/badge-tile-96.png')).raw().toBuffer({ resolveWithObject: true })
    const alpha = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3]
    expect([info.width, info.height, info.channels]).toEqual([96, 96, 4])
    expect([alpha(0, 0), alpha(95, 0), alpha(0, 95), alpha(95, 95)]).toEqual([0, 0, 0, 0])
    expect(alpha(48, 20)).toBe(255) // the tile, between the H's legs above its bar
    expect(alpha(12, 48)).toBe(255) // the tile, left of the H
    expect(alpha(48, 48)).toBe(0) // the H's bar, cut out
    expect(alpha(30, 40)).toBe(0) // its left leg, cut out
  })
})

describe('a tap on it opens the notice in the installed app', () => {
  it('through openWindow, which Android hands to the installed app — never by reusing an open window', async () => {
    // A Chrome tab of the site, used last, and the installed app: nothing tells them apart.
    const chromeTab = win(`${ORIGIN}/hr-app`)
    const app = win(`${ORIGIN}/hr-app`)
    const { listeners, clients } = worker([chromeTab, app])
    const close = await tap(listeners, NOTICE)
    expect(close).toHaveBeenCalled()
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}${NOTICE}`)
    for (const w of [chromeTab, app]) {
      expect(w.focus).not.toHaveBeenCalled()
      expect(w.navigate).not.toHaveBeenCalled()
    }
  })

  it('with nothing open, the same', async () => {
    const { listeners, clients } = worker([])
    await tap(listeners, NOTICE)
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}${NOTICE}`)
  })

  it('a notice with no place of its own opens the app at its start', async () => {
    const { listeners, clients } = worker([])
    let work: Promise<unknown> = Promise.resolve()
    listeners.notificationclick({ notification: { close: vi.fn(), data: {} }, waitUntil: (p: Promise<unknown>) => { work = p } })
    await work
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`)
  })
})

// An iPhone before iOS 18.4 reads no `navigate` and still taps through here (WebKit bug 263687): `openWindow` brings the
// open Home Screen app forward where it was, while the app's own window goes where it is sent.
describe('an iPhone’s tap sends the open app’s window to the notice', () => {
  it('focuses the window, then sends it — no second window', async () => {
    const app = win(`${ORIGIN}/dashboard`)
    const { listeners, clients } = worker([app], IPHONE)
    const close = await tap(listeners, NOTICE)
    expect(close).toHaveBeenCalled()
    expect(app.focus).toHaveBeenCalled()
    expect(app.navigate).toHaveBeenCalledWith(`${ORIGIN}${NOTICE}`)
    expect(app.url).toBe(`${ORIGIN}${NOTICE}`)
    expect(clients.openWindow).not.toHaveBeenCalled()
    // Only the windows this worker runs: those are the ones it may send.
    expect(clients.matchAll).toHaveBeenCalledWith({ type: 'window' })
  })

  it('an iPad, which calls itself a Mac, the same', async () => {
    const app = win(`${ORIGIN}/hr-app`)
    const { listeners, clients } = worker([app], IPAD)
    await tap(listeners, NOTICE)
    expect(app.navigate).toHaveBeenCalledWith(`${ORIGIN}${NOTICE}`)
    expect(clients.openWindow).not.toHaveBeenCalled()
  })

  it('with no window open, openWindow', async () => {
    const { listeners, clients } = worker([], IPHONE)
    await tap(listeners, NOTICE)
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}${NOTICE}`)
  })

  it('a window that cannot be sent, or cannot be focused, is passed over', async () => {
    const stuck = win(`${ORIGIN}/dashboard`)
    stuck.navigate = vi.fn(async () => { throw new TypeError('navigate failed') })
    const unfocused = win(`${ORIGIN}/member`)
    unfocused.focus = vi.fn(async () => { throw new Error('InvalidAccessError') })
    const { listeners, clients } = worker([stuck, unfocused], IPHONE)
    await tap(listeners, NOTICE)
    expect(unfocused.navigate).toHaveBeenCalledWith(`${ORIGIN}${NOTICE}`)
    expect(clients.openWindow).not.toHaveBeenCalled()

    const alone = win(`${ORIGIN}/dashboard`)
    alone.navigate = vi.fn(async () => { throw new TypeError('navigate failed') })
    const second = worker([alone], IPHONE)
    await tap(second.listeners, NOTICE)
    expect(second.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}${NOTICE}`)
  })

  it('Chrome on an iPhone is no Home Screen app: openWindow, as on Android', async () => {
    const tab = win(`${ORIGIN}/dashboard`)
    const { listeners, clients } = worker([tab], CHROME_ON_IPHONE)
    await tap(listeners, NOTICE)
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}${NOTICE}`)
    expect(tab.navigate).not.toHaveBeenCalled()
  })
})
