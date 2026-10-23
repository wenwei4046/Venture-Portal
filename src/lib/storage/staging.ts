/**
 * A file sent ahead of its Server Action (2026-10-23 — the owner: "make the size more bigger for all, let me know the
 * limit"). A Server Action's body stops at 4 MB (next.config.ts; a Vercel function takes 4.5 MB at most), so a page
 * that hands a file to one — Payments, Receipts, Invoice Financing, Reconciliation, the waiting list's forms, the
 * Revenue app's invoices — puts the file first in its sender's own folder of the private `uploads` bucket, straight
 * from the browser to R2 (lib/storage/stage.ts), and gives the action this line in its place. The action reads the
 * bytes back under the same session (lib/storage/staged.ts) and does with them what it did with the body's: looks at
 * them, hashes them, files them under the same policies as before — then takes the staged copy away. What no action
 * took is cleared by the hourly sweep a day later. Pure: the browser and the server both read it.
 */

export const STAGING_BUCKET = 'uploads'

/** The bucket's own limit (mig 20261024006800): what any of those pages may send. */
export const STAGED_MAX_BYTES = 100 * 1024 * 1024

/** The line a form carries for a staged file. `type` is what the browser said the file was, as `File.type` did. */
export interface StagedRef {
  staged: string
  name: string
  type: string
  size: number
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PATH = new RegExp(`^${UUID}/${UUID}/[A-Za-z0-9_.-]{1,120}$`)

/**
 * `<sender>/<a fresh key>/<the name made plain>` — a folder of its own each time, so two files never meet. The
 * ending is kept apart, so a name of other letters (报销单.pdf) is still `file.pdf`, never a bare `pdf`.
 */
export function stagedPath(owner: string, key: string, name: string): string {
  const found = /\.([A-Za-z0-9]{1,8})$/.exec(name || '')
  const ext = found && found.index > 0 ? found[1].toLowerCase() : ''
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name || '').normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '').slice(0, 110) || 'file'
  return `${owner}/${key}/${ext ? `${base}.${ext}` : base}`
}

/** Whose folder a staged file is in. */
export function stagedOwner(path: string): string {
  return path.split('/')[0] ?? ''
}

export function stagedRefText(ref: StagedRef): string {
  return JSON.stringify({ staged: ref.staged, name: ref.name, type: ref.type, size: ref.size })
}

/** A form field's staged file, or null when the field holds anything else. */
export function parseStagedRef(value: unknown): StagedRef | null {
  if (typeof value !== 'string' || value.length > 2000 || !value.startsWith('{')) return null
  let raw: unknown
  try {
    raw = JSON.parse(value)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.staged !== 'string' || !PATH.test(r.staged)) return null
  const size = Number(r.size)
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 200) : ''
  return {
    staged: r.staged,
    name: name || (r.staged.split('/').pop() ?? 'file'),
    type: typeof r.type === 'string' ? r.type.slice(0, 200) : '',
    size: Number.isSafeInteger(size) && size >= 0 ? size : 0,
  }
}
