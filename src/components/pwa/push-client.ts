import { VAPID_PUBLIC_KEY, type PushApp } from '@/lib/push/config'
import { fromB64url } from '@/lib/push/webpush'

/**
 * Turning a phone's notifications on and off (2026-10-11), in the browser.
 *
 * - `install`: an iPhone shows notifications only for an app added to the
 *   Home Screen (Safari, iOS 16.4+), so there the row says to add it first.
 * - `denied`: the phone's own settings block it; only the person can undo
 *   that there.
 * - The permission is asked only when they press the row — never on its own.
 */
export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on'

type Saved = { ok: true } | { ok: false; reason: string }

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration('/')) ?? null
}

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  if (!('PushManager' in window) || !('Notification' in window)) return isIos() && !standalone() ? 'install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unsupported'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

/** Ask, subscribe, and tell the server — the state it ends in, or why not. */
export async function turnPushOn(app: PushApp, save: (s: { endpoint: string; p256dh: string; auth: string; app: PushApp }) => Promise<Saved>): Promise<{ state: PushState; reason?: string }> {
  const before = await pushState()
  if (before === 'unsupported' || before === 'install' || before === 'denied') return { state: before }
  const answer = await Notification.requestPermission()
  if (answer !== 'granted') return { state: answer === 'denied' ? 'denied' : 'off' }
  const reg = await registration()
  if (!reg) return { state: 'unsupported' }
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(VAPID_PUBLIC_KEY) as BufferSource }))
  const j = sub.toJSON()
  const saved = await save({ endpoint: j.endpoint ?? '', p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', app })
  if (!saved.ok) {
    await sub.unsubscribe().catch(() => undefined)
    return { state: 'off', reason: saved.reason }
  }
  return { state: 'on' }
}

export async function turnPushOff(remove: (endpoint: string) => Promise<Saved>): Promise<{ state: PushState; reason?: string }> {
  const reg = await registration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (!sub) return { state: 'off' }
  const gone = await remove(sub.endpoint)
  if (!gone.ok) return { state: 'on', reason: gone.reason }
  await sub.unsubscribe().catch(() => undefined)
  return { state: 'off' }
}

/** The row's words for each state. */
export const PUSH_WORDS: Readonly<Record<PushState, string>> = {
  on: 'On — this phone shows new notifications',
  off: 'Off — tap to get them on this phone',
  install: 'Add the app to your Home Screen first',
  denied: 'Blocked in this phone’s settings',
  unsupported: 'This browser cannot show them',
}
