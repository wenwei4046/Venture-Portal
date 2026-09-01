'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'

/**
 * Moving somebody in the company org chart.
 *
 * Writes `hr_staff_costs.reports_to` and nothing else. In particular it does
 * NOT touch `comm_hierarchy`: the Revenue Department's upline is what the
 * override differential is computed from, it is effective-dated so a closed
 * month keeps its own chart, and the user settled on 2026-09-01 that the Team
 * canvas draws that line but never edits it. Moving a salesperson here changes
 * who they report to, not who earns override on their sales.
 *
 * The canvas refuses an illegal move before calling this, and the database
 * trigger refuses it again. This layer's job is the round trip and the
 * message.
 */
export async function setReportsTo(
  staffId: string,
  reportsToId: string | null,
): Promise<void> {
  await requirePermission('team')

  if (!staffId) throw new Error('Which person?')
  if (reportsToId && reportsToId === staffId) {
    throw new Error('Somebody cannot report to themselves')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({ reports_to: reportsToId })
    .eq('id', staffId)

  if (error) {
    // 23514 is the trigger's own errcode for a loop, and the CHECK for self.
    if (error.code === '23514') {
      throw new Error('That would put them under their own report')
    }
    throw new Error(`Could not move them: ${error.message}`)
  }

  revalidatePath('/team', 'layout')
}
