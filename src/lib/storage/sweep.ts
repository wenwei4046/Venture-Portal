import type { SupabaseClient } from '@supabase/supabase-js'
import { fileBuckets } from './buckets'

/**
 * The hourly sweep's file job (2026-10-23, the move to R2). A file in R2 and its row in `public.file_objects` are
 * written one after the other, never in one transaction, so two leftovers can happen and both are cleared here a DAY
 * later (nothing younger is touched — an upload may still be on its way):
 *
 *   - a row whose file never arrived — the browser closed between its row and its PUT, or a PUT refused;
 *   - a file nobody's row names — its row deleted while R2 would not delete the file just then, or a copy that
 *     failed half way.
 *
 * Only the buckets whose backend is R2. The member-queue cron hands in its service-role client (this module imports
 * nothing from admin.ts) — the same client its other sweeps use. Counts only; the names are people's files.
 */

export type FileSweep = { rowsWithoutFile: number; filesWithoutRow: number }

const DAY_MS = 24 * 60 * 60 * 1000

/** At most this many of each kind go in one run. */
export const FILE_SWEEP_PER_RUN = 200

const ROWS_PER_PAGE = 1000

export async function sweepFileObjects(db: SupabaseClient, now: number = Date.now()): Promise<FileSweep | null> {
  const r2 = await import('./r2')
  const settings = r2.r2Settings()
  if (!settings) return null
  let moved
  try {
    moved = [...(await fileBuckets(db)).values()].filter(b => b.backend === 'r2')
  } catch {
    return null
  }
  const out: FileSweep = { rowsWithoutFile: 0, filesWithoutRow: 0 }
  for (const bucket of moved) {
    const r2Bucket = bucket.public ? settings.publicBucket : settings.privateBucket
    const prefix = `${bucket.id}/`

    const files = new Map<string, number>()
    let token: string | null = null
    do {
      const page = await r2.r2List(r2Bucket, prefix, token)
      for (const o of page.objects) files.set(o.key.slice(prefix.length), Date.parse(o.lastModified) || now)
      token = page.next
    } while (token)

    const rows = new Map<string, number>()
    for (let from = 0; ; from += ROWS_PER_PAGE) {
      const { data, error } = await db.from('file_objects').select('name, created_at').eq('bucket_id', bucket.id).order('name').range(from, from + ROWS_PER_PAGE - 1)
      if (error) return null
      const page = (data ?? []) as Array<{ name: string; created_at: string }>
      for (const r of page) rows.set(r.name, Date.parse(r.created_at) || now)
      if (page.length < ROWS_PER_PAGE) break
    }

    const lostRows = [...rows].filter(([name, at]) => !files.has(name) && now - at > DAY_MS).map(([name]) => name).slice(0, FILE_SWEEP_PER_RUN)
    for (let i = 0; i < lostRows.length; i += 50) {
      const { data, error } = await db.from('file_objects').delete().eq('bucket_id', bucket.id).in('name', lostRows.slice(i, i + 50)).select('name')
      if (!error) out.rowsWithoutFile += (data ?? []).length
    }

    const strays = [...files].filter(([name, at]) => !rows.has(name) && now - at > DAY_MS).map(([name]) => name).slice(0, FILE_SWEEP_PER_RUN)
    if (strays.length) {
      const left = await r2.r2DeleteMany(strays.map(name => ({ r2Bucket, key: `${prefix}${name}` })))
      out.filesWithoutRow += strays.length - left.length
    }
  }
  return out
}
