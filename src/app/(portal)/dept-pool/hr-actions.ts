'use server'

import { requireActionOn } from '@/lib/auth'
import { executeHrCosting } from '../hr-costing/actions'

/**
 * Mark executed from the Finance phone app's Dept Pool (2026-10-15, part E3):
 * the very `executeHrCosting` the desktop's HR Costing Submission cell and the
 * submissions page run — it moves no money — behind the same Treasury · Edit,
 * its refusal answered in words (production hides a thrown message).
 */
export async function executeHrCostingInWords(id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireActionOn('/dept-pool', 'treasury', 'edit')
  const fd = new FormData()
  fd.set('id', id)
  try {
    await executeHrCosting(fd)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.message ? e.message : 'The submission could not be marked executed.' }
  }
}
