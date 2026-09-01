import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revenuePath } from '@/lib/revenue'
import OrgChart, { type OrgPerson, type OrgRank } from './_components/OrgChart'
import { requireSubDepartment, type SubDepartment } from '../../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string }>
}

/**
 * Staff Hierarchy: who overrides whom, for one sub-department.
 *
 * Deliberately separate from `hr_staff_costs.department_id` and from any
 * app-role hierarchy — this exists only to answer "who is under who, at what
 * rank, in which month", and it is what the override differential is computed
 * from.
 *
 * `comm_hierarchy` allows one open position per person across every scheme, so
 * the chart shows this sub-department's people plus anyone not yet placed
 * anywhere. Somebody already sitting in another sub-department is not offered
 * here — moving them is a matter of ending that position, not drawing a
 * second one.
 */
export default async function StaffHierarchyPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { sub } = await params
  const subDept = await requireSubDepartment(sub)

  // Nothing can be charted against a sub-department with no scheme: a rank is
  // a scheme's row, and a position points at one.
  if (!subDept.schemeId) return <NoScheme subDept={subDept} />

  const supabase = (await createClient()) as unknown as SupabaseClient

  const [{ data: rankRows }, { data: staffRows }, { data: positions }] = await Promise.all([
    supabase
      .from('comm_ranks')
      .select('id, rank_key, label, product_rate, can_recruit, sort_order')
      .eq('scheme_id', subDept.schemeId)
      .order('sort_order'),
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, employee_code, departments!inner (payroll_source)')
      .eq('status', 'active')
      .eq('departments.payroll_source', 'commission')
      .order('employee_name'),
    supabase
      .from('comm_hierarchy')
      .select('staff_id, scheme_id, upline_staff_id, rank_id, rate_mode, effective_from')
      .is('effective_to', null),
  ])

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
  }>)
    .filter(s => {
      const pos = posByStaff.get(s.id)
      return !pos || pos.scheme_id === subDept.schemeId
    })
    .map(s => {
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

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()}
          </div>
          <h1 className="page-title">Staff Hierarchy</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            Drag somebody onto a team member to move them, or draw a line from a manager down to
            them. Every move writes a new dated position — a month already computed keeps the chart
            it was computed against.
          </p>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif text-2xl text-ink mb-3">Nobody to chart yet.</p>
          <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
            Add salespeople under HR → Staff with a commission department, then place them here.
          </p>
        </div>
      ) : (
        <OrgChart people={people} ranks={ranks} schemeId={subDept.schemeId} />
      )}
    </div>
  )
}

function NoScheme({ subDept }: { subDept: SubDepartment }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()}
          </div>
          <h1 className="page-title">Staff Hierarchy</h1>
        </div>
      </div>

      <div className="py-16 text-center border border-hairline rounded-card bg-surface">
        <p className="font-serif text-2xl text-ink mb-3">{subDept.name} has no scheme yet.</p>
        <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
          A rank belongs to a scheme and a position points at a rank, so there is nothing to place
          anyone into. Set the scheme up under{' '}
          <Link href={revenuePath(subDept.slug, 'rules')} className="text-accent hover:underline">
            Rules
          </Link>{' '}
          first.
        </p>
      </div>
    </div>
  )
}
