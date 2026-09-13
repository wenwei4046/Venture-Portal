/**
 * The address of the ERP, as a human types it and as the client needs it.
 *
 * The Houzs ERP is a Cloudflare Pages site whose `/api/*` is rewritten to the
 * Worker, so the address the staff use in the browser is the address the API
 * answers on. People paste it with or without a scheme, with a trailing slash,
 * sometimes with `/api` on the end — all of those mean the same server.
 */

export const DEFAULT_ERP_BASE_URL = 'https://erp.houzscentury.com'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * `https://erp.houzscentury.com` from whatever was typed, or an Error that
 * says what was wrong with it. Only https is accepted, except for a local
 * development server; the query, hash and a trailing `/api` are dropped.
 */
export function normaliseErpBaseUrl(input: string): string {
  const typed = (input ?? '').trim()
  if (typed === '') throw new Error('Enter the ERP address')

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`"${typed}" is not a web address`)
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase()
  const local = LOCAL_HOSTS.has(url.hostname.toLowerCase())
  if (scheme !== 'https' && !(scheme === 'http' && local)) {
    throw new Error('The ERP address must start with https://')
  }
  if (url.username || url.password) throw new Error('Do not put a login in the address')

  let path = url.pathname.replace(/\/+$/, '')
  path = path.replace(/\/api$/i, '')
  return `${url.protocol}//${url.host}${path}`
}

/** The hostname, for a label: `erp.houzscentury.com`. */
export function erpHostLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

/**
 * Enough of a key to tell which one is in, never enough to use: the last four
 * characters. A key too short to show four of stays fully hidden.
 */
export function keyHint(key: string): string {
  const k = (key ?? '').trim()
  if (k.length < 12) return '····'
  return `····${k.slice(-4)}`
}
