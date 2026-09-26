/**
 * Which shape a route's skeleton takes while its content is on the way
 * (2026-09-26).
 *
 * Every loading.tsx renders the same RouteSkeleton. By the time a fallback is
 * on screen the router has already committed the DESTINATION, so the skeleton
 * reads that pathname and draws the page that is coming — the content then
 * lands where the eye already is instead of replacing a generic block. Four
 * shapes cover the portal:
 *
 *   ledger — a list or a report: header, a strip of figures, a table.
 *   detail — one record: header, a key/value panel beside a card, a short table.
 *   form   — new / edit / import / invite: header and a column of fields.
 *   board  — a chart canvas (the two hierarchy charts): header, one surface.
 */
export type SkeletonVariant = 'ledger' | 'detail' | 'form' | 'board'

const FORM_TAILS = new Set(['new', 'edit', 'import', 'invite'])

const BOARD_PATHS = [/^\/team\/hierarchy$/, /^\/revenue\/[^/]+\/hierarchy$/]

// A record's own page carries its id in the path: a uuid, or a number.
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i

export function skeletonVariantFor(pathname: string): SkeletonVariant {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? ''

  if (FORM_TAILS.has(last)) return 'form'
  if (BOARD_PATHS.some((pattern) => pattern.test(path))) return 'board'
  if (segments.some((segment) => ID_SEGMENT.test(segment))) return 'detail'
  return 'ledger'
}
