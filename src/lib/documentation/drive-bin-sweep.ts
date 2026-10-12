import type { SupabaseClient } from '@supabase/supabase-js'
import { DOC_BUCKET } from './bucket'

/** One sweep in numbers: what the Data center's Bin let go, and how many of their files the bucket deleted. */
export type DataCenterBinSweep = { expired: number; deleted: number }

/** At most this many of the Bin's items go in one hourly run. */
export const DATA_CENTER_BIN_PER_RUN = 200

/**
 * The hourly sweep's Data center job (2026-10-13 — the user: "Data center 也加 Bin", as the Talent Bank's: a file or
 * a folder HR deleted waits 30 days, then goes by itself). `hr_drive_bin_purge` (mig 20261013183000, the service
 * role's alone) deletes what has waited 30 days — a file greyed under "Show deleted" as a delete always left it — and
 * answers the files nobody holds any more; the Storage API removes them; `hr_drive_bin_files_gone` writes "File
 * deleted" on their trail. The session-side pair (`hr_documentation_leftovers`, `hr_documentation_files_removed`)
 * asks Documentation · Edit, which the cron has not got.
 *
 * The member-queue cron hands in its service-role client — this module imports nothing from admin.ts. It answers
 * counts only (the names are people's files), or null when the purge could not run. A file the bucket would not
 * delete stays a leftover that HR's next Data center write clears.
 */
export async function sweepDataCenterBin(db: SupabaseClient): Promise<DataCenterBinSweep | null> {
  const purged = await db.rpc('hr_drive_bin_purge', { p_limit: DATA_CENTER_BIN_PER_RUN }).then(r => r, () => null)
  if (!purged || purged.error || !purged.data || typeof purged.data !== 'object') return null
  const answer = purged.data as { count?: unknown; paths?: unknown }
  const expired = Number(answer.count) || 0
  const paths = Array.isArray(answer.paths) ? answer.paths.filter((p): p is string => typeof p === 'string' && p !== '') : []
  if (paths.length === 0) return { expired, deleted: 0 }
  const res = await db.storage
    .from(DOC_BUCKET)
    .remove(paths)
    .then(r => r, () => null)
  const deleted = res && !res.error ? (res.data?.length ?? 0) : 0
  if (deleted) await db.rpc('hr_drive_bin_files_gone', { p_paths: paths }).then(() => undefined, () => undefined)
  return { expired, deleted }
}
