'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { ladderAllows, ladderRefusal, nextRung, type LadderTitle, type Rung } from '@/lib/ladder'
import { canAccessRevenue } from '@/lib/roles'
import { syncRankToTitle } from '@/lib/hierarchy-writes'

/**
 * Promotion: one rung up the ladder, in the person's own department.
 *
 * The title offered has to be on the next rung up — the person card only
 * shows those, and this checks again, so a stale card cannot push somebody
 * two levels at once or into another department. `designation` is kept in
 * step with the title's name the way the invite does, because the payroll
 * export still reads it.
 *
 * Refused, with the same words the org chart uses, when the new title would
 * stand above the person's line manager: the ladder is a rule the chart
 * obeys, and a promotion that breaks a line has to move the line first. The
 * database trigger refuses the same thing again as the backstop.
 */
export async function promoteStaff(
  staffId: string,
  toTitleId: string,
): Promise<{ title: string; level: string; rankRaised: boolean; rankNote: string | null }> {
  const user = await requirePermission('team')
  if (!staffId || !toTitleId) throw new Error('Which person, and to which title?')

  const supabase = await createClient()

  const { data: staff } = await supabase
    .from('hr_staff_costs')
    .select('id, employee_name, title_id, reports_to, status')
    .eq('id', staffId)
    .maybeSingle()

  if (!staff) throw new Error('That person is no longer on the roster.')
  if (staff.status === 'inactive') throw new Error(`${staff.employee_name} has left.`)
  if (!staff.title_id) {
    throw new Error(`${staff.employee_name} has no title yet — give them one first.`)
  }

  const [{ data: levels }, { data: titles }] = await Promise.all([
    supabase.from('title_levels').select('id, rank, name'),
    supabase.from('titles').select('id, name, department_id, level_id').eq('is_active', true),
  ])

  const rungs: Rung[] = (levels ?? []).map(l => ({ id: l.id, rank: l.rank, name: l.name }))
  const ladder: LadderTitle[] = (titles ?? []).map(t => ({
    id: t.id,
    name: t.name,
    departmentId: t.department_id,
    levelId: t.level_id,
  }))

  const next = nextRung(ladder, rungs, staff.title_id)
  if (!next) {
    throw new Error(
      `${staff.employee_name}'s title is not on the ladder, or there is nothing above it.`,
    )
  }
  const target = next.titles.find(t => t.id === toTitleId)
  if (!target) throw new Error('That title is not on the next level up.')

  // The line above, checked the way the chart checks it.
  if (staff.reports_to) {
    const { data: mgr } = await supabase
      .from('hr_staff_costs')
      .select('employee_name, status, titles(name, level_id)')
      .eq('id', staff.reports_to)
      .maybeSingle()
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const m = mgr as any
    if (m && m.status === 'active') {
      const mgrRung = rungs.find(r => r.id === m.titles?.level_id) ?? null
      if (!ladderAllows(next.rung.rank, mgrRung?.rank ?? null)) {
        throw new Error(
          ladderRefusal(
            { name: staff.employee_name, title: target.name, level: next.rung.name },
            { name: m.employee_name, title: m.titles?.name ?? null, level: mgrRung?.name ?? null },
          ) + ' — move the line first',
        )
      }
    }
  }

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({ title_id: target.id, designation: target.name })
    .eq('id', staffId)

  if (error) {
    if (error.code === '23LAD') throw new Error(error.message)
    throw new Error(`Could not promote them: ${error.message}`)
  }

  // The rank climbs with the title (user, 2026-09-07). A ratchet, so somebody
  // already placed above the new title's floor keeps the higher rank — the
  // promotion raises what they are called, and only raises what they are paid
  // from when the title now guarantees more than the placement did.
  //
  // Both ways this can fail to happen are REPORTED rather than swallowed. A
  // promotion whose rank silently stayed put leaves somebody titled Team
  // Leader and paid a Revenue Specialist rate, indefinitely, with a green tick
  // on screen — and `rankRaised: false` cannot be told apart from "the ratchet
  // had nothing to do". The note is the only thing that can.
  let rankRaised = false
  let rankNote: string | null = null
  if (canAccessRevenue(user)) {
    try {
      rankRaised = (await syncRankToTitle(supabase, user.id, staffId, target.id)) !== null
    } catch (e) {
      rankNote = `Promoted, but the rank could not follow the title: ${
        e instanceof Error ? e.message : 'the database refused it'
      }`
    }
  } else {
    rankNote =
      'Promoted. The rank was left as it was — raising it needs a permission this account does not have.'
  }

  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
  return { title: target.name, level: next.rung.name, rankRaised, rankNote }
}
