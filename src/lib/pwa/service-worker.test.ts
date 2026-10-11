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

function worker(open: Win[] = []) {
  const listeners: Record<string, Listener> = {}
  const showNotification = vi.fn(async (_title: string, _options: unknown) => undefined)
  const clients = { matchAll: vi.fn(async () => open), openWindow: vi.fn(async (_url: string) => null), claim: vi.fn() }
  const self = {
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn },
    registration: { showNotification },
    clients,
    location: { origin: ORIGIN },
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
