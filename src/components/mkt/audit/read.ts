import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { projectLogFromRow, type ProjectLog } from '@/lib/marketing/audit'

/** A project's formal log (`mkt_project_log`), read when it opens — as the bell reads its list. Null when it cannot be. */
export async function readProjectLog(project: string): Promise<ProjectLog | null> {
  try {
    const db = createClient() as unknown as SupabaseClient
    const { data, error } = await db.rpc('mkt_project_log', { p_project: project })
    return error ? null : projectLogFromRow(data)
  } catch {
    return null
  }
}
