import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import OrgChart, { type OrgPerson, type OrgRank } from './_components/OrgChart'
import CommissionTabs from '../_components/CommissionTabs'

/**
 * The payroll-purpose org chart: who overrides whom.
 *
 * Deliberately separate from `hr_staff_costs.department_id` and from any
 * app-role hierarchy — this exists only to answer "who is under who, at what
 * rank, in which month", and it is what the override differential is computed
 * from.
 */
export default async function OrgChartPage() {
  const user = await requireRole(['principal', 'hr'])
  const supabase = (await createClient()) as unknown as SupabaseClient

  const [{ data: subDepts }, { data: schemes }, { data: rankRows }] = await Promise.all([
    supabase.from('comm_sub_departments').select('id, name').order('name'),
    supabase.from('comm_schemes').select('id, sub_department_id').eq('is_active', true).is('effective_to', null),
    supabase.from('comm_ranks').select('id, rank_key, label, product_rate, can_recruit, sort_order').order('sort_order'),
  ])

  const { data: staffRows } = await supabase
    .from('hr_staff_costs')
    .select('id, employee_name, employee_code, departments!inner (payroll_source)')
    .eq('status', 'active')
    .eq('departments.payroll_source', 'commission')
    .order('employee_name')

  const { data: positions } = await supabase
    .from('comm_hierarchy')
    .select('staff_id, scheme_id, upline_staff_id, rank_id, rate_mode, effective_from')
    .is('effective_to', null)

  const posByStaff = new Map(
    ((positions ?? []) as Array<{
      staff_id: string
      scheme_id: string
      upline_staff_id: string | null
      rank_id: string
      rate_mode: 'fixed' | 'variable' | null
      effective_from: string
    }>).map(p => [p.staff_id, p]),
  )

  const ranks: OrgRank[] = ((rankRows ?? []) as Array<{
    id: string
    rank_key: string
    label: string
    product_rate: number | string
    can_recruit: boolean
    sort_order: number
  }>).map(r => ({
    id: r.id,
    rankKey: r.rank_key,
    label: r.label,
    productRate: Number(r.product_rate),
    canRecruit: r.can_recruit,
    sortOrder: r.sort_order,
  }))

  const rankById = new Map(ranks.map(r => [r.id, r]))

  const people: OrgPerson[] = ((staffRows ?? []) as Array<{
    id: string
    employee_name: string
    employee_code: string | null
  }>).map(s => {
    const pos = posByStaff.get(s.id)
    const rank = pos ? rankById.get(pos.rank_id) : undefined
    return {
      staffId: s.id,
      name: s.employee_name,
      code: s.employee_code,
      uplineStaffId: pos?.upline_staff_id ?? null,
      rankId: pos?.rank_id ?? null,
      rankLabel: rank?.label ?? null,
      productRate: rank?.productRate ?? null,
      canRecruit: rank?.canRecruit ?? false,
      rateMode: pos?.rate_mode ?? null,
      placedSince: pos?.effective_from ?? null,
    }
  })

  const defaultSchemeId =
    ((schemes ?? []) as Array<{ id: string; sub_department_id: string }>)[0]?.id ?? ''
  const subDeptName =
    ((subDepts ?? []) as Array<{ id: string; name: string }>)[0]?.name ?? 'Commission'

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · COMMISSION · ORG CHART
          </div>
          <h1 className="page-title">{subDeptName} org chart</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            Drag somebody onto a team member to move them, or draw a line from a manager down to
            them. Every move writes a new dated position — a month already computed keeps the chart
            it was computed against.
          </p>
        </div>
      </div>

      <CommissionTabs active="org-chart" canSeeProducts={user.role === 'principal'} />

      {people.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif text-2xl text-ink mb-3">Nobody to chart yet.</p>
          <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
            Add salespeople under HR → Staff with a commission department, then place them here.
          </p>
        </div>
      ) : (
        <OrgChart people={people} ranks={ranks} schemeId={defaultSchemeId} />
      )}
    </div>
  )
}
