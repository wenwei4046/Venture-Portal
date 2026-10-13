/**
 * The phone's notices and what is on the screen (2026-10-14, the CRM's chats on the phone — public/sw.js › showCrm).
 *
 * - `answerOnScreen`: before announcing a customer's message, the service worker asks each visible window whether
 *   that chat is open on it (`vp-notice-on-screen?`, a reply port); a chat being read is not announced over itself.
 * - `closeNotices`: a chat opened in the app is being read — its notice leaves the phone's shade, as a chat app's does.
 *
 * Both are quiet where the browser has no service worker or no notifications: nothing to answer, nothing to close.
 */
export function answerOnScreen(isOnScreen: (tag: string) => boolean): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const sw = navigator.serviceWorker
  const onMessage = (e: MessageEvent) => {
    const d = e.data as { type?: unknown; tag?: unknown } | null
    if (!d || d.type !== 'vp-notice-on-screen?' || typeof d.tag !== 'string') return
    e.ports[0]?.postMessage({ onScreen: document.visibilityState === 'visible' && isOnScreen(d.tag) })
  }
  sw.addEventListener('message', onMessage)
  // Messages from the worker wait until the page says it listens.
  sw.startMessages?.()
  return () => sw.removeEventListener('message', onMessage)
}

export async function closeNotices(tag: string): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const reg = await navigator.serviceWorker.getRegistration('/')
    for (const n of (await reg?.getNotifications({ tag })) ?? []) n.close()
  } catch {
    // Nothing shown, or nothing to show them with.
  }
}
