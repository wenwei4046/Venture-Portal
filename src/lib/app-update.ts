/**
 * A release reaching an app that is already open (2026-10-06).
 *
 * An installed app on a phone is resumed from memory, not reloaded, so it can
 * run an old build for days; and Next recalculates every Server Action's id per
 * build, so that old copy's reads start failing as soon as a release lands.
 * The build's name is baked into the bundle and answered by the server on
 * `/sw.js` (next.config.ts); `components/pwa/UpdatePrompt` asks, and this is
 * what it decides with the answer.
 */

/** Away longer than this, a new version reloads the Revenue app on return — unless a form is being filled. */
export const AWAY_RELOAD_MS = 30 * 60_000
/** Typing this close to leaving counts as a form still being filled. */
export const TYPING_GRACE_MS = 10 * 60_000
/** While the app is in view, it asks again this often. */
export const CHECK_EVERY_MS = 5 * 60_000
/** Two reasons to ask arriving together (a return fires more than one event) make one question. */
export const CHECK_GAP_MS = 10_000

export type UpdateStep = 'none' | 'prompt' | 'reload'

/**
 * Where a long absence may end in a reload: the Revenue app (`/member`) only.
 * Its screens are read from the server and its quote is kept in the tab's
 * session storage, so a reload loses nothing. NOT the portal: a page like
 * HR › Payroll holds edits until *Save all* without guarding them, and they
 * may have been made long before anybody switched tabs — no check of typing or
 * focus can see those. There a new build is only ever offered — and so it is
 * on the Product List (`/member/products`, 2026-10-08), which holds its price
 * edits until Save in the same way.
 */
export function mayReloadOn(pathname: string): boolean {
  if (pathname === '/member/products' || pathname.startsWith('/member/products/')) return false
  return pathname === '/member' || pathname.startsWith('/member/')
}

/**
 * What to do once the server has answered: nothing (same build, no answer, or a
 * build that does not know its own name), offer the new version, or — in the
 * Revenue app, after a long time away with nothing half-typed — simply load it.
 */
export function updateStep(input: { built: string; live: string | null; awayMs: number; busy: boolean; mayReload: boolean }): UpdateStep {
  if (!input.built || !input.live || input.live === input.built) return 'none'
  return input.mayReload && input.awayMs >= AWAY_RELOAD_MS && !input.busy ? 'reload' : 'prompt'
}

const NOT_TYPED = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden'])

/** A field somebody types into: the one that had the focus when they left is their unfinished work. */
export function isTypingField(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NOT_TYPED.has(((el as HTMLInputElement).type || 'text').toLowerCase())
  return (el as HTMLElement).isContentEditable === true
}

/**
 * Was a form being filled when the app went away? Its focus was still in a
 * field, or something was typed or picked in the last ten minutes before it
 * did. Unsaved work is the one thing a reload must never cost; a prompt costs
 * nothing.
 */
export function wasBusy(input: { focused: Element | null; lastInputAt: number | null; hiddenAt: number }): boolean {
  if (isTypingField(input.focused)) return true
  return input.lastInputAt !== null && input.hiddenAt - input.lastInputAt < TYPING_GRACE_MS
}

/**
 * The live build's name, from the server — `null` when it cannot say (offline,
 * a deployment from before this existed). A plain HEAD request: it carries no
 * deployment pin, so with Vercel's Skew Protection on it still reaches the
 * newest deployment, not the one this page was loaded from.
 */
export async function readLiveVersion(): Promise<string | null> {
  try {
    const res = await fetch('/sw.js', { method: 'HEAD', cache: 'no-store' })
    return res.ok ? res.headers.get('x-app-version') : null
  } catch {
    return null
  }
}
