import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHANNEL } from '@/components/member/crm/sales/vm/common'

// The CRM on the phone (2026-10-14 — the user: "如果是分到你自己的 … 我希望它是能够跳得出 notification … 有人家的
// profile pic, then content"). public/sw.js runs here in a sandbox with a fake `self`, as service-worker.test.ts does:
// a CRM push names the customer, carries their words, draws their picture as the CRM's inbox does (initials on the
// peach circle, the channel's badge), gathers one chat's messages on one notice, and is not announced over the chat
// it belongs to when that chat is open on the screen.

const ROOT = resolve(__dirname, '../../..')
const SW = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8')
const ORIGIN = 'https://erp.houzsventure.com'

type Listener = (event: unknown) => void
type Shown = { title: string; data: { lines?: unknown[] }; close: () => void }
type Win = { visibilityState: string; postMessage: (msg: unknown, ports: MessagePort[]) => void }

function worker(opts: { shown?: Shown[]; windows?: Win[] } = {}) {
  const listeners: Record<string, Listener> = {}
  const showNotification = vi.fn(async (_title: string, _options: Record<string, unknown>) => undefined)
  const getNotifications = vi.fn(async (_filter: { tag?: string }) => opts.shown ?? [])
  const clients = { matchAll: vi.fn(async () => opts.windows ?? []), openWindow: vi.fn(async (_url: string) => null), claim: vi.fn() }
  const self = {
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn },
    registration: { showNotification, getNotifications },
    clients,
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
  }
  new Function('self', 'caches', SW)(self, {})
  return { listeners, showNotification, getNotifications, clients }
}

async function push(listeners: Record<string, Listener>, msg: unknown) {
  let work: Promise<unknown> = Promise.resolve()
  listeners.push({ data: { json: () => msg }, waitUntil: (p: Promise<unknown>) => { work = p } })
  await work
}

const LEAD = {
  title: 'New lead · Chrisss ❤️', body: '帅哥', url: '/member?page=account&view=crm&chat=c1', tag: 'crm:c1', id: 'n1',
  crm: { ch: 'whatsapp', name: 'Chrisss ❤️', line: 'New lead · 帅哥', at: '2026-10-14T00:06:00.000Z' },
}
const NEXT = {
  title: 'Chrisss ❤️', body: '爱我吗', url: '/member?page=account&view=crm&chat=c1', tag: 'crm:c1', id: 'n2',
  crm: { ch: 'whatsapp', name: 'Chrisss ❤️', line: '爱我吗', at: '2026-10-14T00:08:00.000Z' },
}

/** A drawing surface that writes down what was drawn on it. */
function fakeCanvas() {
  const drawn: Array<[string, unknown]> = []
  class Ctx {
    private style = ''
    set fillStyle(v: string) { this.style = v }
    get fillStyle() { return this.style }
    font = ''
    textAlign = ''
    textBaseline = ''
    beginPath() {}
    arc(x: number, y: number, r: number) { drawn.push(['arc', [x, y, r, this.style]]) }
    fill(path?: { d: string }) { drawn.push(['fill', path ? path.d : this.style]) }
    fillText(t: string) { drawn.push(['text', [t, this.style, this.font]]) }
    save() {}
    restore() {}
    translate() {}
    scale() {}
  }
  class OffscreenCanvas {
    constructor(public width: number, public height: number) { drawn.push(['size', [width, height]]) }
    getContext() { return new Ctx() }
    async convertToBlob() { return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) }
  }
  class Path2D { constructor(public d: string) {} }
  vi.stubGlobal('OffscreenCanvas', OffscreenCanvas)
  vi.stubGlobal('Path2D', Path2D)
  return drawn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a CRM notice on the phone', () => {
  it('names the customer, carries their words, alerts again, and opens the chat when tapped', async () => {
    const { listeners, showNotification, clients } = worker()
    await push(listeners, LEAD)
    expect(showNotification).toHaveBeenCalledWith('New lead · Chrisss ❤️', expect.objectContaining({
      body: '帅哥', tag: 'crm:c1', renotify: true, badge: '/icons/badge-tile-96.png', timestamp: Date.parse(LEAD.crm.at),
      data: { url: LEAD.url, lines: [{ id: 'n1', t: 'New lead · 帅哥', at: Date.parse(LEAD.crm.at) }] },
    }))
    // Nothing to draw with here: the app's tile stands in for the picture.
    expect(showNotification.mock.calls[0][1].icon).toBe('/icons/icon-192.png')
    let work: Promise<unknown> = Promise.resolve()
    listeners.notificationclick({ notification: { close: vi.fn(), data: { url: LEAD.url } }, waitUntil: (p: Promise<unknown>) => { work = p } })
    await work
    expect(clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}${LEAD.url}`)
  })

  it('draws the customer as the CRM’s inbox does: initials on the peach circle, the channel’s badge on its corner', async () => {
    const drawn = fakeCanvas()
    const { listeners, showNotification } = worker()
    await push(listeners, LEAD)
    expect(showNotification.mock.calls[0][1].icon).toBe('data:image/png;base64,iVBORw==')
    expect(drawn).toContainEqual(['size', [192, 192]])
    expect(drawn).toContainEqual(['arc', [86, 86, 78, '#FFF0E4']])
    expect(drawn).toContainEqual(['text', ['C', '#BD4A19', '600 50px sans-serif']])
    expect(drawn).toContainEqual(['arc', [138, 138, 27, CHANNEL.whatsapp.fg]])
    expect(drawn).toContainEqual(['fill', CHANNEL.whatsapp.icon])
  })

  it('takes two initials, letters and numbers only, whatever the script', async () => {
    const drawn = fakeCanvas()
    const { listeners } = worker()
    for (const [name, ch] of [['LOO WEN WEI', 'messenger'], ['陈美玲', 'whatsapp'], ['❤️', null]] as const) {
      await push(listeners, { ...NEXT, crm: { ...NEXT.crm, name, ch } })
    }
    expect(drawn.filter(d => d[0] === 'text').map(d => (d[1] as string[])[0])).toEqual(['LW', '陈', '?'])
    expect(drawn).toContainEqual(['fill', CHANNEL.messenger.icon])
  })

  it('gathers one chat’s messages on one notice, newest first, each line once', async () => {
    const earlier = { title: 'New lead · Chrisss ❤️', close: vi.fn(), data: { lines: [{ id: 'n1', t: 'New lead · 帅哥', at: Date.parse(LEAD.crm.at) }] } }
    const { listeners, showNotification, getNotifications } = worker({ shown: [earlier] })
    await push(listeners, NEXT)
    expect(getNotifications).toHaveBeenCalledWith({ tag: 'crm:c1' })
    expect(showNotification).toHaveBeenCalledWith('Chrisss ❤️', expect.objectContaining({ body: '爱我吗\nNew lead · 帅哥', tag: 'crm:c1', renotify: true }))
    // The same notice pushed again (a retry) is not a second line.
    showNotification.mockClear()
    await push(listeners, { ...LEAD })
    expect(showNotification.mock.calls[0][1].body).toBe('帅哥')
  })

  it('a chat open on the screen is shown silently and closed at once — never announced over itself', async () => {
    const earlier = { title: 'Chrisss ❤️', close: vi.fn(), data: { lines: [] } }
    const answer = (onScreen: boolean): Win => ({
      visibilityState: 'visible',
      postMessage: (msg, ports) => { expect(msg).toEqual({ type: 'vp-notice-on-screen?', tag: 'crm:c1' }); ports[0].postMessage({ onScreen }) },
    })
    const reading = worker({ shown: [earlier], windows: [answer(false), answer(true)] })
    await push(reading.listeners, NEXT)
    expect(reading.showNotification).toHaveBeenCalledWith('Chrisss ❤️', expect.objectContaining({ silent: true, renotify: false, tag: 'crm:c1' }))
    expect(earlier.close).toHaveBeenCalled()

    const elsewhere = worker({ windows: [answer(false), { visibilityState: 'hidden', postMessage: () => { throw new Error('a hidden window is not asked') } }] })
    await push(elsewhere.listeners, NEXT)
    expect(elsewhere.showNotification).toHaveBeenCalledWith('Chrisss ❤️', expect.objectContaining({ renotify: true }))
    expect(elsewhere.showNotification.mock.calls[0][1].silent).toBeUndefined()
  })

  it('a window that does not answer is not waited on for long', async () => {
    const silent: Win = { visibilityState: 'visible', postMessage: () => undefined }
    const { listeners, showNotification } = worker({ windows: [silent] })
    const t0 = Date.now()
    await push(listeners, NEXT)
    expect(Date.now() - t0).toBeLessThan(1500)
    expect(showNotification).toHaveBeenCalledWith('Chrisss ❤️', expect.objectContaining({ renotify: true }))
  })

  it('an invitation is a notice of its own', async () => {
    const { listeners, showNotification } = worker()
    await push(listeners, { title: 'ANN invited you to a chat', body: 'Chrisss ❤️', url: '/member?page=account&view=crm&crm=notifs', tag: 'n7', id: 'n7',
      crm: { ch: 'whatsapp', name: 'Chrisss ❤️', line: 'ANN invited you to a chat', at: '2026-10-14T01:00:00.000Z' } })
    expect(showNotification).toHaveBeenCalledWith('ANN invited you to a chat', expect.objectContaining({ body: 'Chrisss ❤️', tag: 'n7' }))
  })

  it('the badge glyphs are the CRM inbox’s own', () => {
    expect(SW).toContain(CHANNEL.whatsapp.icon)
    expect(SW).toContain(CHANNEL.messenger.icon)
    expect(SW).toContain(`fg: '${CHANNEL.whatsapp.fg}'`)
    expect(SW).toContain(`fg: '${CHANNEL.messenger.fg}'`)
  })
})
