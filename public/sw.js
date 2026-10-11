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
 * image's alpha: the H alone on transparent (badge-96.png). The app's tile
 * there showed as a solid white square.
 */
self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = {}
  }
  const title = typeof msg.title === 'string' && msg.title ? msg.title : 'HOUZS Venture'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof msg.body === 'string' ? msg.body : '',
      tag: typeof msg.tag === 'string' ? msg.tag : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: typeof msg.url === 'string' && msg.url.startsWith('/') ? msg.url : '/' },
    }),
  )
})

/*
 * A tap brings the app forward FIRST and only then takes it to the notice's
 * place: the right to bring a window forward lasts only a moment after the tap,
 * and the first version loaded the page before asking — on the user's phone the
 * moment had passed and the tap seemed to do nothing (2026-10-11). The window
 * used most recently comes forward (matchAll lists it first) — it is one app,
 * whichever face it shows; with none open, the app opens at the url.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const front = open.length ? await open[0].focus().catch(() => null) : null
      if (!front) return self.clients.openWindow(url)
      if (front.url !== url) await front.navigate(url).catch(() => undefined)
    })(),
  )
})

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
