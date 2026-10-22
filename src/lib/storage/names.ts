/**
 * The small rules every file follows on its way into a bucket, the same in the browser and on the server
 * (2026-10-23, the move to R2). The database holds the same rules (`file_objects_stamp`), so these only say no sooner.
 */

/** Why a path cannot name an object, or null when it can: no leading slash, no empty / `.` / `..` part, no control character. */
export function objectNameProblem(name: string): string | null {
  if (typeof name !== 'string' || name === '') return 'A file needs a name.'
  if (name.length > 1024) return 'That file name is too long.'
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(name)) return 'That file name has a character it cannot keep.'
  if (name.startsWith('/') || name.split('/').some(part => part === '' || part === '.' || part === '..')) return 'That file name is not a path the bucket keeps.'
  return null
}

/** The type a file goes up as: the one asked for, else the file's own — its bare media type, lower case. */
export function contentTypeOf(asked: string | null | undefined, body?: unknown): string {
  const own = typeof Blob !== 'undefined' && body instanceof Blob ? body.type : ''
  const type = (asked || own || 'application/octet-stream').split(';')[0].trim().toLowerCase()
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type) ? type : 'application/octet-stream'
}

/** How many bytes a body holds. */
export function uploadSize(body: Blob | Uint8Array): number {
  return body instanceof Uint8Array ? body.byteLength : body.size
}

/** What a browser may show in place; anything else (HTML, SVG, scripts, unknown) is only ever a download. */
const INLINE = /^(image\/(jpeg|png|webp|gif|heic|heif|avif|bmp)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|application\/pdf|text\/(plain|csv))$/

export function inlineSafe(mimetype: string | null | undefined): boolean {
  return !!mimetype && INLINE.test(mimetype.split(';')[0].trim().toLowerCase())
}

/** Does a bucket take this type? Its list may name a whole family (`image/*`); no list takes every type. */
export function typeAllowed(allowed: readonly string[] | null | undefined, mimetype: string): boolean {
  if (!allowed || allowed.length === 0) return true
  const type = mimetype.toLowerCase()
  return allowed.some(a => {
    const rule = a.toLowerCase()
    return rule === type || (rule.endsWith('/*') && type.startsWith(rule.slice(0, -1)))
  })
}
