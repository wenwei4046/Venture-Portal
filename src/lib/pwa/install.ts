/**
 * Which "install this app" path a browser offers — pure, so it can be tested
 * without a phone.
 *
 * The portal is a PWA (manifest + service worker), and the two phone platforms
 * install one in different ways:
 *   - Android Chrome / Edge / Samsung fire `beforeinstallprompt`; the page keeps
 *     the event and calls `prompt()` from a button — a real install dialog.
 *   - iOS has no such event on any browser. Safari (and, since iOS 16.4, Chrome
 *     and Edge on iOS) install through Share → Add to Home Screen, so the most
 *     a page can do is show the steps.
 * Opened from the home screen already, there is nothing to offer.
 */

export type InstallPath =
  /** Running as the installed app — hide every install affordance. */
  | 'installed'
  /** The browser handed us a `beforeinstallprompt` — one tap installs. */
  | 'prompt'
  /** iOS: show the Share → Add to Home Screen steps. */
  | 'ios'
  /** WhatsApp / Facebook / WeChat's own browser: say "open in Chrome/Safari". */
  | 'in-app'
  /** Nothing we can drive (desktop Firefox, Android before the prompt fires…). */
  | 'unsupported'

export type InstallEnv = {
  userAgent: string
  /** `navigator.maxTouchPoints` — iPadOS reports a Mac user agent. */
  maxTouchPoints: number
  /** `display-mode: standalone` matched, or iOS `navigator.standalone`. */
  standalone: boolean
  /** A `beforeinstallprompt` event is being held. */
  hasPrompt: boolean
}

export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true
  // iPadOS 13+ asks for the desktop site by default and says "Macintosh"; a
  // Mac has no touch screen, an iPad does.
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1
}

/**
 * In-app browsers (WhatsApp, Facebook, Instagram, LINE, WeChat) can open the
 * link but cannot add it to the home screen — the user must open it in Safari
 * or Chrome first.
 */
export function isInAppBrowser(userAgent: string): boolean {
  return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|WhatsApp|; wv\)/i.test(userAgent)
}

export function installPath(env: InstallEnv): InstallPath {
  if (env.standalone) return 'installed'
  if (env.hasPrompt) return 'prompt'
  if (isInAppBrowser(env.userAgent)) return 'in-app'
  if (isIos(env.userAgent, env.maxTouchPoints)) return 'ios'
  return 'unsupported'
}
