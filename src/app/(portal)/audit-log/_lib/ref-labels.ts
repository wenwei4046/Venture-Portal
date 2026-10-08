import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REF_SOURCES, refKey, refsWanted } from '@/lib/audit/refs'
import type { AuditChange } from '@/lib/audit/changes'
import { fetchByKeys } from '@/lib/paginate'

/**
 * The names behind the ids on a page of changes, read with the reader's own
 * session: one query per kind of row, all at once. A name the reader may not
 * read (RLS, or a table they hold no grant on) simply stays a short id.
 */
export async function loadRefLabels(supabase: SupabaseClient, changes: readonly AuditChange[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const wanted = refsWanted(changes)
  await Promise.all(
    [...wanted].map(async ([kind, ids]) => {
      const source = REF_SOURCES[kind]
      try {
        const rows = await fetchByKeys(
          [...ids],
          chunk => supabase.from(source.table).select(source.select).in(source.key, chunk),
          `audit names (${kind})`,
        )
        // A select string built at runtime: supabase-js cannot type the rows.
        for (const row of rows as unknown as Record<string, unknown>[]) {
          const id = row[source.key]
          const label = source.label(row)
          if (typeof id === 'string' && label) labels.set(refKey(kind, id), label)
        }
      } catch {
        // Not readable by this reader: the id stands.
      }
    }),
  )
  return labels
}
