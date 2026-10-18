/*
 * Venture Portal service worker — deliberately small.
 *
 * It exists so the portal can be installed like an app and so a phone with no
 * signal gets a clear "you're offline" page instead of the browser's dinosaur.
 * It does NOT cache pages or data: every page is a signed-in, per-person view
 * of money (salaries, commission, loans), and a copy left on a shared or lost
 * phone would outlive the session that was allowed to see it. Only the offline
 * page and its icon are stored.
 *
 * Bump VERSION whenever offline.html or the precache list changes.
 */
const VERSION = 'vp-shell-v1'
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))
      // Start the page's network request while the worker boots, so being
      // installed never makes a page slower.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
      await self.clients.claim()
    })(),
  )
})

/*
 * Phone notifications (2026-10-11): the server sends one encrypted message per
 * notice ({ title, body, url, tag }, lib/push/outbox.ts); the browser hands it
 * here decrypted. Shown at once — a push must always show something — and a
 * tap opens the app at its url, in a window already open if there is one.
 *
 * `badge` is the small icon in Android's status bar, which keeps only the
 * image's alpha and paints it white: the mark's tile with its H cut out
 * (badge-tile-96.png). The opaque tile there showed as a solid white square,
 * and a bare H looked plain to the user.
 *
 * `navigate` (2026-10-17 — the user: "when i press the pop up notification, it
 * wont jump direct to the chat screen", an iPhone on iOS 18.7): the notice's
 * place, whole, for iOS 18.4+ to open by itself. Such a notice never reaches
 * `notificationclick` there — WebKit hands the tap and the address to the Home
 * Screen app (WKWebsiteDataStore _processWebCorePersistentNotificationClick),
 * which is what goes wrong on an iPhone: a tap reaches a worker only while the
 * app's page is alive, and `openWindow` then brought the app forward where it
 * was. Chrome reads no `navigate` and keeps `notificationclick` below.
 *
 * `placeOf` never throws (2026-10-17 review of #520): it runs before the
 * notice is shown, and `new URL('//', origin)` throws — a push that shows
 * nothing is one an iPhone may take the app's notifications away for.
 */
function placeOf(url) {
  const start = new URL('/', self.location.origin).href
  try {
    const place = new URL(typeof url === 'string' && url.startsWith('/') ? url : '/', self.location.origin)
    return place.origin === self.location.origin ? place.href : start
  } catch {
    return start
  }
}

self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = {}
  }
  if (msg && msg.crm && typeof msg.crm === 'object') {
    event.waitUntil(showCrm(msg))
    return
  }
  const title = typeof msg.title === 'string' && msg.title ? msg.title : 'HOUZS Venture'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof msg.body === 'string' ? msg.body : '',
      tag: typeof msg.tag === 'string' ? msg.tag : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-tile-96.png',
      navigate: placeOf(msg.url),
      data: { url: typeof msg.url === 'string' && msg.url.startsWith('/') ? msg.url : '/' },
    }),
  )
})

/*
 * A CRM notice (2026-10-14 — the user: "如果是分到你自己的 … 我希望它是能够跳得出 notification … 有人家的 profile
 * pic, then content"): a customer's message, a new lead, a visit, a reminder, an invitation (lib/push/notices.ts).
 *
 * - The customer is the title and their words the text; their picture is the large icon, drawn here as the CRM's
 *   inbox draws it — their initials on the peach circle, the WhatsApp or Messenger badge on its corner. Neither
 *   WhatsApp's API nor Messenger's (without Meta's profile review) hands over a customer's own photo.
 * - One chat is one notice (its tag, `crm:<contact>`): each message joins it, newest line first, the latest 6, and
 *   alerts again (`renotify`). A notice swiped away is read — the next starts afresh.
 * - A chat already open on the screen is not announced over itself: the CRM answers a visible window's question,
 *   and the notice is shown silently and closed at once (every push must show something).
 * - Whether it POPS UP is the phone's to decide: Android gives an installed web app's notifications Default
 *   importance (sound, no pop-up) until the person turns on "Pop on screen" for it (components/pwa/PopUpGuide).
 */
const BADGE = '/icons/badge-tile-96.png'
const CHANNELS = {
  whatsapp: { fg: '#25D366', icon: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4Z' },
  messenger: { fg: '#0A7CFF', icon: 'M12 2C6.5 2 2 6.2 2 11.4c0 2.9 1.4 5.5 3.6 7.2V22l3.3-1.8c1 .3 2 .4 3.1.4 5.5 0 10-4.2 10-9.4S17.5 2 12 2Zm1 12.6-2.5-2.7-4.9 2.7 5.4-5.7 2.6 2.7 4.8-2.7-5.4 5.7Z' },
}
const text = (v) => (typeof v === 'string' ? v : '')

/** Up to two initials, letters and numbers only (an emoji in a name is not one). */
function initials(name) {
  const out = []
  for (const word of text(name).trim().split(/\s+/)) {
    const first = word.match(/[\p{L}\p{N}]/u)
    if (first) out.push(first[0])
    if (out.length === 2) break
  }
  return (out.join('') || '?').toUpperCase()
}

function base64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const avatars = new Map()
/**
 * The customer's picture as a PNG data URL, 192px: a phone may crop a large icon to a circle, so everything stays
 * inside the 96px one around its middle. Null where the browser cannot draw it — the app's tile is shown instead.
 */
async function crmAvatar(name, ch) {
  const key = `${ch}|${name}`
  if (avatars.has(key)) return avatars.get(key)
  let url = null
  try {
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(192, 192)
      const g = canvas.getContext('2d')
      g.fillStyle = '#FFF0E4'
      g.beginPath()
      g.arc(86, 86, 78, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#BD4A19'
      g.font = '600 50px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(initials(name), 86, 89)
      const badge = CHANNELS[ch]
      if (badge) {
        g.fillStyle = '#FFFFFF'
        g.beginPath()
        g.arc(138, 138, 32, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = badge.fg
        g.beginPath()
        g.arc(138, 138, 27, 0, Math.PI * 2)
        g.fill()
        if (typeof Path2D === 'function') {
          g.save()
          g.translate(120, 120)
          g.scale(1.5, 1.5)
          g.fillStyle = '#FFFFFF'
          g.fill(new Path2D(badge.icon))
          g.restore()
        }
      }
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      url = `data:image/png;base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`
    }
  } catch {
    url = null
  }
  if (avatars.size > 50) avatars.clear()
  avatars.set(key, url)
  return url
}

/** The chat's lines so far (the notice still in the shade), this one added — newest first, the latest 6. */
async function gathered(tag, line) {
  const lines = [line]
  try {
    for (const shown of await self.registration.getNotifications({ tag })) {
      const old = shown.data && Array.isArray(shown.data.lines) ? shown.data.lines : []
      for (const l of old) if (l && typeof l.t === 'string' && typeof l.at === 'number' && l.id !== line.id) lines.push(l)
    }
  } catch {
    // Nothing to gather with.
  }
  return lines.sort((a, b) => b.at - a.at).slice(0, 6)
}

/** Is this chat open on a screen right now? Each visible window of the app is asked; the CRM answers for its open chat. */
async function onScreen(tag) {
  if (typeof MessageChannel !== 'function') return false
  let windows = []
  try {
    windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  } catch {
    return false
  }
  const asks = windows.filter((w) => w.visibilityState === 'visible').map((w) => new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(false), 400)
    channel.port1.onmessage = (e) => {
      clearTimeout(timer)
      resolve(!!(e.data && e.data.onScreen))
    }
    try {
      w.postMessage({ type: 'vp-notice-on-screen?', tag }, [channel.port2])
    } catch {
      clearTimeout(timer)
      resolve(false)
    }
  }))
  return (await Promise.all(asks)).some(Boolean)
}

async function showCrm(msg) {
  const crm = msg.crm
  const name = text(crm.name) || 'Customer'
  const tag = text(msg.tag) || undefined
  const at = Date.parse(text(crm.at)) || Date.now()
  const line = { id: text(msg.id) || String(at), t: text(crm.line) || text(msg.body), at }
  const lines = tag ? await gathered(tag, line) : [line]
  const one = lines.length === 1
  const options = {
    body: one ? text(msg.body) : lines.map((l) => l.t).join('\n'),
    tag,
    renotify: !!tag,
    icon: (await crmAvatar(name, crm.ch)) || '/icons/icon-192.png',
    badge: BADGE,
    timestamp: at,
    navigate: placeOf(msg.url),
    data: { url: text(msg.url).startsWith('/') ? msg.url : '/', lines },
  }
  const title = one ? text(msg.title) || name : name
  if (tag && (await onScreen(tag))) {
    await self.registration.showNotification(title, { ...options, renotify: false, silent: true })
    for (const shown of await self.registration.getNotifications({ tag }).catch(() => [])) shown.close()
    return
  }
  await self.registration.showNotification(title, options)
}

/*
 * Make them pop up (components/pwa/PopUpGuide): *Send a test* asks the worker to show a customer's message as it
 * will arrive — the same picture, words and alert — so the person sees whether it pops up and can press and hold it
 * for its settings. Nothing reaches the server.
 */
self.addEventListener('message', (event) => {
  const d = event.data
  if (!d || d.type !== 'vp-test-notice') return
  const at = new Date().toISOString()
  event.waitUntil(showCrm({
    title: 'Test customer',
    body: 'This is how a customer’s message arrives.',
    url: text(d.url).startsWith('/') ? d.url : '/',
    tag: 'vp-test',
    id: 'vp-test',
    crm: { ch: 'whatsapp', name: 'Test customer', line: 'This is how a customer’s message arrives.', at },
  }))
})

/*
 * A tap opens the notice's place in the installed app (2026-10-11), on Android
 * always through openWindow: Chrome hands a url inside an installed app's
 * scope to that app and makes it go there even when it is already open
 * (ServiceTabLauncher: findFirstWebApkPackage, forceNavigation = true). An
 * iPhone on iOS 18.4+ never comes here — it opens `navigate` itself (above).
 *
 * Twice the same day a tap went wrong by reusing an open window instead:
 * loading the page before focusing it let the moment a tap allows for focusing
 * pass (the tap seemed to do nothing), and focusing the most recently used
 * window brought a Chrome TAB forward — clients.matchAll lists the browser's
 * tabs of this site too, and nothing tells a tab from the installed app.
 *
 * An iPhone before iOS 18.4 (no `navigate`, above) is the other way round
 * (2026-10-17, WebKit bug 263687): `openWindow` brings the open Home Screen app
 * forward where it was, or a closed one at its start, while the open app's own
 * window does go where it is sent. Its worker sees that app's windows alone —
 * Safari's tabs keep their own — so the window is focused, then sent; with no
 * window, or one that cannot be sent, `openWindow`.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = placeOf(event.notification.data && event.notification.data.url)
  event.waitUntil(onAnIphone() ? intoTheOpenApp(url) : self.clients.openWindow(url))
})

/** Safari's engine on an iPhone or an iPad (which may call itself a Mac) — never Chrome, wherever it runs. */
function onAnIphone() {
  const ua = (self.navigator && self.navigator.userAgent) || ''
  return /iPhone|iPad|iPod|Macintosh/.test(ua) && /AppleWebKit/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Android/.test(ua)
}

async function intoTheOpenApp(url) {
  let windows = []
  try {
    windows = await self.clients.matchAll({ type: 'window' })
  } catch {
    windows = []
  }
  for (const w of windows) {
    try {
      await w.focus()
    } catch {
      // Already in front, or the tap's moment has passed: sent all the same.
    }
    try {
      await w.navigate(url)
      return
    } catch {
      // Not this window's to be sent (WebKit bug 252544): the next, or a new one.
    }
  }
  await self.clients.openWindow(url)
}

self.addEventListener('fetch', (event) => {
  // Only page loads. Server Actions, RSC payloads, Supabase calls and assets go
  // straight to the network exactly as they would without a worker.
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse
        if (preloaded) return preloaded
        return await fetch(event.request)
      } catch {
        const cache = await caches.open(VERSION)
        return (await cache.match(OFFLINE_URL)) ?? Response.error()
      }
    })(),
  )
})
