'use server'

import { requireActionOn } from '@/lib/auth'
import { executeHrCosting } from '../hr-costing/actions'

/**
 * Mark executed from the Finance phone app's Dept Pool (2026-10-15, part E3):
 * the very `executeHrCosting` — it moves no money — behind the same Treasury ·
 * Edit, its refusal answered in words (production hides a thrown message).
 * Since 2026-10-16 the desktop's steps ask first too and answer through it —
 * Department Pools, its submissions page and HR Costing's *Execute transfers*
 * (`_components/MarkExecutedButton`), so it names the pages executeHrCosting does.
 */
export async function executeHrCostingInWords(id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  await requireActionOn(['/dept-pool', '/hr-costing'], 'treasury', 'edit')
  const fd = new FormData()
  fd.set('id', id)
  try {
    await executeHrCosting(fd)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.message ? e.message : 'The submission could not be marked executed.' }
  }
}
