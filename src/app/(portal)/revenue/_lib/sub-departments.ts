import 'server-only'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { subDeptSlug } from '@/lib/revenue'

/**
 * Reading the Revenue Department's sub-departments.
 *
 * Every page under `/revenue/[sub]` is scoped to exactly one of these, and so
 * is every rule row it renders: `comm_ranks`, `comm_item_groups`,
 * `comm_kpi_items`, `comm_kpi_thresholds`, `comm_open_bill_rules`,
 * `comm_brands`, `comm_margin_bands`, `comm_promotion_rules` and
 * `comm_hierarchy` all carry a `scheme_id`, and a scheme belongs to one
 * sub-department. Resolving the slug to its scheme once, here, is what keeps
 * Fair's ladder off IR's page when the second one is created.
 *
 * comm_* postdates the generated database.types.ts — untyped-client
 * convention, same as ba_* and bank_recon_*.
 */

export interface SubDepartment {
  id: string
  name: string
  slug: string
  /** The live scheme every rule row hangs off. Null only mid-setup. */
  schemeId: string | null
}

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** Active sub-departments, alphabetical — the order the sidebar lists them in. */
export async function listSubDepartments(): Promise<SubDepartment[]> {
  const supabase = await client()

  const [{ data: subs }, { data: schemes }] = await Promise.all([
    supabase
      .from('comm_sub_departments')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('comm_schemes')
      .select('id, sub_department_id')
      .eq('is_active', true)
      .is('effective_to', null),
  ])

  const schemeBySub = new Map(
    ((schemes ?? []) as Array<{ id: string; sub_department_id: string }>).map(s => [
      s.sub_department_id,
      s.id,
    ]),
  )

  return ((subs ?? []) as Array<{ id: string; name: string }>).map(s => ({
    id: s.id,
    name: s.name,
    slug: subDeptSlug(s.name),
    schemeId: schemeBySub.get(s.id) ?? null,
  }))
}

/**
 * The sub-department a `/revenue/[sub]` page is about, or a 404.
 *
 * Matching is done in TypeScript rather than SQL because the slug is derived
 * from the name — there is no column to filter on, and the table holds a
 * handful of rows.
 */
export async function requireSubDepartment(slug: string): Promise<SubDepartment> {
  const found = (await listSubDepartments()).find(s => s.slug === slug)
  if (!found) notFound()
  return found
}
