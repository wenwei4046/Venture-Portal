import type { SupabaseClient } from '@supabase/supabase-js'
import { HIRING_BUCKET } from './files'

/**
 * One sweep in numbers: what the Talent Bank's Bin let go (null when that call failed), the leftovers listed, and how
 * many the bucket deleted.
 */
export type LeftoverSweep = { expired: number | null; listed: number; deleted: number }

/** At most this many leftovers go in one hourly run. */
export const LEFTOVERS_PER_RUN = 200
/** At most this many of the Bin's items go in one hourly run. */
export const BIN_PER_RUN = 200

/**
 * The hourly sweep's Hiring job (the user, 2026-10-11: "每小时自动清"): objects
 * in `hiring-files` that no record names and that went in over a day ago — a
 * guest's upload never sent, a window closed before Save, a refused delete —
 * listed by `hiring_leftovers` (mig 20261011210000, the service role's alone)
 * and deleted through the Storage API, a bounded batch a run. HR's own file
 * writes still clear them too (`sweep`, actions.ts).
 *
 * First, the Talent Bank's Bin (2026-10-13, the user: "that bin will last for
 * 30 days. file that last for more than 30days in bin, will auto delete"):
 * `hiring_bank_bin_purge` (mig 20261013061500, the service role's alone) lets
 * go what has waited there 30 days — its rows now; the objects they named are
 * leftovers from then on, so the listing below deletes them in this same run.
 * A failed purge never stops the leftovers.
 *
 * The member-queue cron hands in its service-role client — this module imports
 * nothing from admin.ts. It answers counts only (the names are people's files),
 * or null when the list could not be read.
 */
export async function sweepHiringLeftovers(db: SupabaseClient): Promise<LeftoverSweep | null> {
  const bin = await db.rpc('hiring_bank_bin_purge', { p_limit: BIN_PER_RUN }).then(r => r, () => null)
  const expired = bin && !bin.error ? Number(bin.data) || 0 : null
  const { data, error } = await db.rpc('hiring_leftovers', { p_limit: LEFTOVERS_PER_RUN })
  if (error || !Array.isArray(data)) return null
  const paths = data.filter((p): p is string => typeof p === 'string')
  if (paths.length === 0) return { expired, listed: 0, deleted: 0 }
  const res = await db.storage
    .from(HIRING_BUCKET)
    .remove(paths)
    .then(r => r, () => null)
  return { expired, listed: paths.length, deleted: res && !res.error ? (res.data?.length ?? 0) : 0 }
}
