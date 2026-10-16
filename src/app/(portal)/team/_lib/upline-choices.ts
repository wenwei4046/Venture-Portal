import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { uplineChoices, type UplineGroup, type UplinePerson } from '@/lib/upline-choices'

interface RosterRow {
  id: string
  employee_name: string
  employee_code: string | null
  status: string | null
  reports_to: string | null
  title_id: string | null
  titles: { name: string; level_id: string | null; is_department_head: boolean | null } | null
  departments: { name: string; payroll_source: string | null } | null
}

/**
 * The uplines a person's page offers (2026-10-16), read for whoever may edit
 * them. Every row of the roster, inactive ones too: a line that runs through
 * somebody inactive still makes the people under it theirs.
 *
 * Inside a commission department the recruit rule is asked the way the
 * database asks it — each colleague's title on THEIR base's ladder
 * (`comm_staff_can_recruit`, as `loadLineFacts` does) — and only there:
 * outside one, a title says nothing about who may lead.
 */
export async function loadUplineChoices(supabase: SupabaseClient, moverId: string): Promise<UplineGroup[]> {
  const [roster, levels] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select(
        'id, employee_name, employee_code, status, reports_to, title_id, titles(name, level_id, is_department_head), departments(name, payroll_source)',
      ),
    supabase.from('title_levels').select('id, rank'),
  ])
  if (roster.error) throw new Error(`Could not read the roster: ${roster.error.message}`)
  if (levels.error) throw new Error(`Could not read the ladder: ${levels.error.message}`)

  const rank = new Map(((levels.data ?? []) as Array<{ id: string; rank: number }>).map(l => [l.id, l.rank]))
  const rows = (roster.data ?? []) as unknown as RosterRow[]
  const people: UplinePerson[] = rows.map(r => ({
    id: r.id,
    name: r.employee_name,
    code: r.employee_code,
    title: r.titles?.name ?? null,
    department: r.departments?.name ?? null,
    commissionDept: r.departments?.payroll_source === 'commission',
    isDepartmentHead: r.titles?.is_department_head === true,
    canRecruit: null,
    levelRank: r.titles?.level_id ? (rank.get(r.titles.level_id) ?? null) : null,
    active: r.status === 'active',
    reportsTo: r.reports_to,
  }))

  const mover = people.find(p => p.id === moverId)
  if (mover?.commissionDept && !mover.isDepartmentHead) {
    const titleOf = new Map(rows.map(r => [r.id, r.title_id]))
    await Promise.all(
      people
        .filter(p => p.active && p.commissionDept && p.id !== moverId && titleOf.get(p.id))
        .map(async p => {
          const { data: can } = await supabase.rpc('comm_staff_can_recruit', {
            p_staff_id: p.id,
            p_title_id: titleOf.get(p.id),
          })
          p.canRecruit = typeof can === 'boolean' ? can : null
        }),
    )
  }

  return uplineChoices(moverId, people)
}
