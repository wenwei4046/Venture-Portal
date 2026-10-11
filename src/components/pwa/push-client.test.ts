import { afterEach, describe, expect, it, vi } from 'vitest'
import { askedBefore, healPush, rememberAsked, turnPushOn } from './push-client'

// Turning a phone's notifications on (2026-10-11). On the user's phone the switch "turned on" three times and
// nothing ever reached the server: whatever goes wrong is now said, told to the server's log, and an open of the
// app signs up again a phone that already said yes.

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc'

function phone(opts: { permission?: NotificationPermission; answer?: NotificationPermission; existing?: boolean; subscribeError?: Error } = {}) {
  const sub = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'BPa1', auth: 'xyz2' } }),
    unsubscribe: vi.fn(async () => true),
  }
  let current: typeof sub | null = opts.existing ? sub : null
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      if (opts.subscribeError) throw opts.subscribeError
      current = sub
      return sub
    }),
  }
  const reg = { pushManager }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn(async () => reg), ready: Promise.resolve(reg) },
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  const N = {
    permission: opts.permission ?? 'default',
    requestPermission: vi.fn(async () => {
      N.permission = opts.answer ?? 'granted'
      return N.permission
    }),
  }
  vi.stubGlobal('Notification', N)
  return { sub, pushManager, N }
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
  window.localStorage.clear()
})

describe('turning them on', () => {
  it('asks, signs the phone up and tells the server', async () => {
    const { N } = phone()
    const save = vi.fn(async () => ({ ok: true as const }))
    expect(await turnPushOn('hr', save)).toEqual({ state: 'on' })
    expect(N.requestPermission).toHaveBeenCalled()
    expect(save).toHaveBeenCalledWith({ endpoint: ENDPOINT, p256dh: 'BPa1', auth: 'xyz2', app: 'hr' })
  })

  it('a sign-up the phone refuses is said on the screen and told to the server', async () => {
    phone({ subscribeError: Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError' }) })
    const save = vi.fn(async () => ({ ok: true as const }))
    const trouble = vi.fn()
    const res = await turnPushOn('hr', save, trouble)
    expect(res.state).toBe('off')
    expect(res.reason).toContain('AbortError: Registration failed - push service error')
    expect(trouble).toHaveBeenCalledWith({ app: 'hr', stage: 'subscribe', message: 'AbortError: Registration failed - push service error' })
    expect(save).not.toHaveBeenCalled()
  })

  it('a server that cannot be reached leaves nothing half done', async () => {
    const { sub } = phone()
    const trouble = vi.fn()
    const res = await turnPushOn('revenue', vi.fn(async () => { throw new Error('fetch failed') }), trouble)
    expect(res).toEqual({ state: 'off', reason: 'The server could not be reached. Please try again.' })
    expect(sub.unsubscribe).toHaveBeenCalled()
    expect(trouble).toHaveBeenCalledWith({ app: 'revenue', stage: 'save', message: 'Error: fetch failed' })
  })

  it('a server that refuses says why, and the phone lets go of its sign-up', async () => {
    const { sub } = phone()
    const trouble = vi.fn()
    const res = await turnPushOn('hr', vi.fn(async () => ({ ok: false as const, reason: 'Sign in with an active work account.' })), trouble)
    expect(res).toEqual({ state: 'off', reason: 'Sign in with an active work account.' })
    expect(sub.unsubscribe).toHaveBeenCalled()
    expect(trouble).toHaveBeenCalledWith({ app: 'hr', stage: 'save', message: 'Sign in with an active work account.' })
  })

  it('a no is a no: nothing is signed up', async () => {
    const { pushManager } = phone({ answer: 'denied' })
    expect(await turnPushOn('hr', vi.fn())).toEqual({ state: 'denied' })
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })
})

describe('opening the app', () => {
  it('signs up again a phone that already said yes — the server may never have heard of it', async () => {
    phone({ permission: 'granted', existing: true })
    const save = vi.fn(async () => ({ ok: true as const }))
    expect(await healPush('hr', save)).toBe('on')
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ endpoint: ENDPOINT, app: 'hr' }))
  })

  it('a phone that allowed them but has no sign-up is signed up without asking', async () => {
    const { N, pushManager } = phone({ permission: 'granted' })
    const save = vi.fn(async () => ({ ok: true as const }))
    expect(await healPush('revenue', save)).toBe('on')
    expect(N.requestPermission).not.toHaveBeenCalled()
    expect(pushManager.subscribe).toHaveBeenCalled()
  })

  it('a phone never asked is left to be asked', async () => {
    phone()
    const save = vi.fn()
    expect(await healPush('hr', save)).toBe('off')
    expect(save).not.toHaveBeenCalled()
  })

  it('a browser without notifications is left alone', async () => {
    expect(await healPush('hr', vi.fn())).toBe('unsupported')
  })
})

describe('the first open’s question is asked once per phone', () => {
  it('remembers it was asked', () => {
    expect(askedBefore()).toBe(false)
    rememberAsked()
    expect(askedBefore()).toBe(true)
  })

  it('a phone that cannot remember is not asked again and again', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(askedBefore()).toBe(true)
    spy.mockRestore()
  })
})
