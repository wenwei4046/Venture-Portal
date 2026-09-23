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
