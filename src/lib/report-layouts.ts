import type { SupabaseClient } from '@supabase/supabase-js'

// A saved report layout: ordered categories, each holding ordered account codes.
// Shared by the custom Cash Flow and P&L reports.
export interface ReportCategory {
  id: string
  name: string
  accounts: string[]
}
export interface ReportLayout {
  categories: ReportCategory[]
}

// `report_layouts` is newer than the generated database.types.ts, so the typed
// query builder doesn't know it. Access it through a single localized
// structural cast here so every call site stays clean and typed.
interface ReportLayoutClient {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: string) => {
        maybeSingle: () => Promise<{ data: { layout: unknown } | null; error: unknown }>
      }
    }
    upsert: (
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>
  }
}

/** Read a saved report layout JSON (or null if none). */
export async function readReportLayout(supabase: SupabaseClient, key: string): Promise<unknown> {
  const client = supabase as unknown as ReportLayoutClient
  const { data } = await client.from('report_layouts').select('layout').eq('report_key', key).maybeSingle()
  return data?.layout ?? null
}

/** Upsert a report layout (company-wide, keyed by report_key). */
export async function writeReportLayout(
  supabase: SupabaseClient,
  key: string,
  layout: unknown,
  userId: string,
): Promise<void> {
  const client = supabase as unknown as ReportLayoutClient
  const { error } = await client.from('report_layouts').upsert(
    { report_key: key, layout, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: 'report_key' },
  )
  if (error) throw new Error(`Save layout failed: ${error.message}`)
}
