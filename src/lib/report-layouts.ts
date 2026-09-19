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

// ─── Parent codes in a layout (2026-09-18) ───────────────────────────────────
// A category may list a COA PARENT code (e.g. 3020 Loans Receivable) instead
// of — or as well as — leaves. Every leaf under it then follows the parent
// unless the leaf itself is listed somewhere: an explicit leaf wins, then the
// NEAREST listed ancestor. Before this a layout only knew leaves, so the ten
// loan debtors had to be dragged one by one and any new debtor fell into 其他
// — which is exactly how Loans Receivable / Fund Sources Payable ended up
// split across two sections of the Cash Flow (user 2026-09-18).

export interface LayoutPlacement {
  /** category id → leaf codes; category order preserved, leaf order as given. */
  byCategory: Map<string, string[]>
  /** Leaves no category claims, explicitly or through an ancestor. */
  leftovers: string[]
}

export function placeLeavesInLayout(
  leafCodes: readonly string[],
  categories: readonly { id: string; accounts?: string[] }[],
  ancestorsNearestFirst: (code: string) => readonly string[],
): LayoutPlacement {
  // First category to list a code owns it — same rule a duplicate leaf had.
  const owner = new Map<string, string>()
  const byCategory = new Map<string, string[]>()
  for (const c of categories) {
    byCategory.set(c.id, [])
    for (const code of c.accounts ?? []) if (!owner.has(code)) owner.set(code, c.id)
  }

  const leftovers: string[] = []
  for (const code of leafCodes) {
    let cat = owner.get(code)
    if (cat === undefined) {
      for (const anc of ancestorsNearestFirst(code)) {
        cat = owner.get(anc)
        if (cat !== undefined) break
      }
    }
    if (cat === undefined) leftovers.push(code)
    else byCategory.get(cat)!.push(code)
  }
  return { byCategory, leftovers }
}

/** Nearest-first ancestor chain from a COA parent_code map. Cycles / unknown
 *  parents stop the walk instead of looping. */
export function ancestorChain(
  code: string,
  parentOf: (code: string) => string | null | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>([code])
  let cur = parentOf(code)
  while (cur && !seen.has(cur)) {
    out.push(cur)
    seen.add(cur)
    cur = parentOf(cur)
  }
  return out
}
