import type { SupabaseClient } from '@supabase/supabase-js'
import { HIRING_BUCKET } from './files'

/** One sweep in numbers: the leftovers listed, and how many the bucket deleted. */
export type LeftoverSweep = { listed: number; deleted: number }

/** At most this many leftovers go in one hourly run. */
export const LEFTOVERS_PER_RUN = 200

/**
 * The hourly sweep's Hiring job (the user, 2026-10-11: "每小时自动清"): objects
 * in `hiring-files` that no record names and that went in over a day ago — a
 * guest's upload never sent, a window closed before Save, a refused delete —
 * listed by `hiring_leftovers` (mig 20261011210000, the service role's alone)
 * and deleted through the Storage API, a bounded batch a run. HR's own file
 * writes still clear them too (`sweep`, actions.ts).
 *
 * The member-queue cron hands in its service-role client — this module imports
 * nothing from admin.ts. It answers counts only (the names are people's files),
 * or null when the list could not be read.
 */
export async function sweepHiringLeftovers(db: SupabaseClient): Promise<LeftoverSweep | null> {
  const { data, error } = await db.rpc('hiring_leftovers', { p_limit: LEFTOVERS_PER_RUN })
  if (error || !Array.isArray(data)) return null
  const paths = data.filter((p): p is string => typeof p === 'string')
  if (paths.length === 0) return { listed: 0, deleted: 0 }
  const res = await db.storage
    .from(HIRING_BUCKET)
    .remove(paths)
    .then(r => r, () => null)
  return { listed: paths.length, deleted: res && !res.error ? (res.data?.length ?? 0) : 0 }
}
