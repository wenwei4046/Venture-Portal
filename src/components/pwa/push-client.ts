import { VAPID_PUBLIC_KEY, type PushApp } from '@/lib/push/config'
import { fromB64url } from '@/lib/push/webpush'

/**
 * Turning a phone's notifications on and off (2026-10-11), in the browser.
 *
 * - `install`: an iPhone shows notifications only for an app added to the
 *   Home Screen (Safari, iOS 16.4+), so there the row says to add it first.
 * - `denied`: the phone's own settings block it; only the person can undo
 *   that there.
 * - The permission is asked only when they press — the row, or the first
 *   open's question (PushAsk) — never on its own.
 * - Whatever goes wrong is said on the screen AND told to the server
 *   (`trouble`, kept in Vercel's runtime log): a phone that "turned it on"
 *   while nothing reached the server once looked exactly like one that did.
 */
export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on'

type Saved = { ok: true } | { ok: false; reason: string }
type Save = (s: { endpoint: string; p256dh: string; auth: string; app: PushApp }) => Promise<Saved>
/** Tells the server what went wrong on this phone, and where. */
export type PushTrouble = (t: { app: PushApp; stage: 'permission' | 'worker' | 'subscribe' | 'save' | 'heal'; message: string }) => void | Promise<void>
type Result = { state: PushState; reason?: string }

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 300)

/**
 * What may be asked right now, read without waiting on anything — so the phone's question can be the very first
 * thing a tap does (`turnPushOn`).
 */
function askable(): PushState | 'ask' {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  if (!('PushManager' in window) || !('Notification' in window)) return isIos() && !standalone() ? 'install' : 'unsupported'
  return Notification.permission === 'denied' ? 'denied' : 'ask'
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration('/')) ?? null
}

/**
 * The app's service worker once it is ACTIVE. Subscribing before that fails
 * ("no active Service Worker") — the first open of a freshly installed app is
 * exactly when that happens. Gives up after a while: none was registered.
 */
async function activeRegistration(waitMs = 8000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const timeout = new Promise<null>(done => setTimeout(() => done(null), waitMs))
  return (await Promise.race([navigator.serviceWorker.ready, timeout])) ?? null
}

export async function pushState(): Promise<PushState> {
  const now = askable()
  if (now !== 'ask') return now
  const reg = await registration()
  if (!reg) return 'unsupported'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

/** Sign this phone up (or take its sign-up as it is) and tell the server — never throws. */
async function signUp(app: PushApp, save: Save, trouble: PushTrouble | undefined, stage: 'subscribe' | 'heal'): Promise<Result> {
  const reg = await activeRegistration()
  if (!reg) {
    void trouble?.({ app, stage: 'worker', message: 'no active service worker' })
    return { state: 'off', reason: 'The app is still starting. Close it, open it again and try once more.' }
  }
  let sub: PushSubscription
  try {
    sub = (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(VAPID_PUBLIC_KEY) as BufferSource }))
  } catch (e) {
    void trouble?.({ app, stage, message: errText(e) })
    return { state: 'off', reason: `This phone could not sign up for notifications (${errText(e)}).` }
  }
  const j = sub.toJSON()
  let saved: Saved
  try {
    saved = await save({ endpoint: j.endpoint ?? '', p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', app })
  } catch (e) {
    void trouble?.({ app, stage: 'save', message: errText(e) })
    saved = { ok: false, reason: 'The server could not be reached. Please try again.' }
  }
  if (!saved.ok) {
    if (stage !== 'heal') void trouble?.({ app, stage: 'save', message: saved.reason })
    await sub.unsubscribe().catch(() => undefined)
    return { state: 'off', reason: saved.reason }
  }
  return { state: 'on' }
}

/**
 * Ask, subscribe, and tell the server — the state it ends in, or why not.
 *
 * The phone's question comes FIRST, before anything is awaited (2026-10-16 — the user's iPhone never showed the app
 * in Settings › Notifications): Safari asks only within the tap's own moment — WebKit spends the tap's activation on
 * the question, and without one answers "denied" without asking anything. Subscribing after a yes needs no tap.
 */
export async function turnPushOn(app: PushApp, save: Save, trouble?: PushTrouble): Promise<Result> {
  const now = askable()
  if (now !== 'ask') return { state: now }
  let answer: NotificationPermission
  try {
    answer = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  } catch (e) {
    void trouble?.({ app, stage: 'permission', message: errText(e) })
    return { state: 'off', reason: `This phone did not ask for permission (${errText(e)}).` }
  }
  if (answer !== 'granted') {
    // "Denied" while the phone's own setting is still unset: it would not ask (no tap to answer to) — not a no.
    if (answer === 'denied' && Notification.permission === 'default') {
      void trouble?.({ app, stage: 'permission', message: 'denied without asking' })
      return { state: 'off', reason: 'This phone did not ask. Tap once more.' }
    }
    return { state: answer === 'denied' ? 'denied' : 'off' }
  }
  return signUp(app, save, trouble, 'subscribe')
}

/**
 * Opening the app (2026-10-11): a phone that already said yes is signed up
 * again without asking — a sign-up the server never heard of is told now, and
 * one that failed is tried again. The server keeps one row per address
 * (`push_subscribe` upserts it), so this costs nothing when all is well.
 */
export async function healPush(app: PushApp, save: Save, trouble?: PushTrouble): Promise<PushState> {
  const state = await pushState().catch(() => 'unsupported' as PushState)
  if (state === 'on' || (state === 'off' && Notification.permission === 'granted')) return (await signUp(app, save, trouble, 'heal')).state
  return state
}

export async function turnPushOff(remove: (endpoint: string) => Promise<Saved>): Promise<Result> {
  const reg = await registration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (!sub) return { state: 'off' }
  const gone = await remove(sub.endpoint)
  if (!gone.ok) return { state: 'on', reason: gone.reason }
  await sub.unsubscribe().catch(() => undefined)
  return { state: 'off' }
}

/**
 * An Android phone: its notifications pop up only once the person turns that on for the app (PopUpGuide) — an
 * installed web app's are Default importance there. An iPhone shows them as banners already.
 */
export const popUpNeedsTurningOn = () => typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

/**
 * Show a customer's message as it will arrive (public/sw.js › `vp-test-notice`): the same picture, words and alert,
 * on this phone only — nothing is sent anywhere. False when the phone cannot show it.
 */
export async function sendTestNotice(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
    const reg = await activeRegistration(4000)
    if (!reg?.active) return false
    reg.active.postMessage({ type: 'vp-test-notice', url: window.location.pathname + window.location.search })
    return true
  } catch {
    return false
  }
}

/** What the rows say. */
export const PUSH_WORDS: Readonly<Record<PushState, string>> = {
  on: 'On — this phone shows new notifications',
  off: 'Off — tap to get them on this phone',
  install: 'Add the app to your Home Screen first',
  denied: 'Blocked in this phone’s settings',
  unsupported: 'This browser cannot show them',
}

// ── The first open's question (PushAsk) ──────────────────────────────────────

const ASKED = 'vp-push-asked'

/** Was this phone asked already (or can it not remember — then it is not asked again and again)? */
export function askedBefore(): boolean {
  try {
    return window.localStorage.getItem(ASKED) === '1'
  } catch {
    return true
  }
}

export function rememberAsked(): void {
  try {
    window.localStorage.setItem(ASKED, '1')
  } catch {
    // Nothing to remember it in: the question was answered all the same.
  }
}
