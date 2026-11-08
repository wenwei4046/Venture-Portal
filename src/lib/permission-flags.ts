/**
 * The per-template / per-person ticks that are not cells (`permission_template_flags`, `user_permission_flags`):
 * By management approve (`claims_review`, 2026-10-29) and CRM · Up next (`crm_up_next`, 2026-11-08).
 *
 * `permission_template_flags_set` and `permission_user_flags_set` each take the WHOLE list, so a save that moved
 * one tick must still send the other as it stands — or one save wipes the other. A tick the window did not move
 * (undefined) is taken from what is stored.
 */

export const CLAIMS_REVIEW = 'claims_review'
export const CRM_UP_NEXT = 'crm_up_next'

/** What a window sends: a tick that moved, or undefined. A person's null = back to the template's. */
export interface FlagTicks<T> {
  review?: T
  upNext?: T
}

const FLAG_OF = { review: CLAIMS_REVIEW, upNext: CRM_UP_NEXT } as const
const ORDER = ['review', 'upNext'] as const

/** Whether the save touches the flags at all. */
export const flagsMoved = (ticks: FlagTicks<unknown>): boolean => ticks.review !== undefined || ticks.upNext !== undefined

/** A template's whole list: each moved tick as sent, the other as stored. */
export function templateFlagList(ticks: FlagTicks<boolean>, stored: readonly string[]): string[] {
  return ORDER.filter(k => (ticks[k] !== undefined ? ticks[k] : stored.includes(FLAG_OF[k]))).map(k => FLAG_OF[k])
}

/** A person's whole list: each moved tick as sent (null: none — the template's), the other as stored. */
export function personFlagList(
  ticks: FlagTicks<boolean | null>,
  stored: ReadonlyArray<{ flag: string; granted: boolean }>,
): Array<{ flag: string; granted: boolean }> {
  const out: Array<{ flag: string; granted: boolean }> = []
  for (const k of ORDER) {
    const own = ticks[k] !== undefined ? ticks[k] : (stored.find(f => f.flag === FLAG_OF[k])?.granted ?? null)
    if (own !== null && own !== undefined) out.push({ flag: FLAG_OF[k], granted: own })
  }
  return out
}
