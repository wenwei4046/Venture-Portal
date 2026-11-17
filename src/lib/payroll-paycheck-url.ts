/**
 * The paycheck open on HR › Payroll lives in the page's URL (`?paycheck=<row
 * id>`), so leaving for a payslip and pressing its *← Back to payroll grid*
 * opens the same paycheck again (user 2026-11-17: Back went to the bare grid,
 * not the LUIS TEO paycheck the payslip was opened from).
 */

export const PAYCHECK_PARAM = 'paycheck'

/** `href` (a path with its query) with the open paycheck set, or taken off for `null`. */
export function withPaycheck(href: string, rowId: string | null): string {
  const hashAt = href.indexOf('#')
  const hash = hashAt >= 0 ? href.slice(hashAt) : ''
  const bare = hashAt >= 0 ? href.slice(0, hashAt) : href
  const queryAt = bare.indexOf('?')
  const path = queryAt >= 0 ? bare.slice(0, queryAt) : bare
  const params = new URLSearchParams(queryAt >= 0 ? bare.slice(queryAt + 1) : '')
  if (rowId) params.set(PAYCHECK_PARAM, rowId)
  else params.delete(PAYCHECK_PARAM)
  const query = params.toString()
  return `${path}${query ? `?${query}` : ''}${hash}`
}

/** The payslip of one person, remembering the page it was opened from. */
export function payslipHref(period: string, staffId: string, back: string): string {
  return `/hr-costing/payroll/${period}/${staffId}/payslip?back=${encodeURIComponent(back)}`
}

/** Where the payslip's Back goes: a path on this site only — never another
 *  host (`//evil.com`, `https://…`, `/\evil.com`), whatever the link says. */
export function safeBack(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}
