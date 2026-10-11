'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'

/**
 * The ladder.
 *
 * Which rung each title stands on, and the rungs themselves. Written by the
 * same people who write titles — HR and the Principal — because the ladder is
 * what promotions climb and what the org chart obeys, and both of those are
 * HR's.
 *
 * Inserting and deleting a rung go through database functions rather than two
 * statements from here: both shift every rank above the change, and half a
 * shift is a ladder with a hole in it.
 *
 * Refusals come back as `{ ok: false, reason }` (Hierarchy › Levels shows
 * them): a thrown message reaches production's browser only as a digest.
 */

export type LadderOutcome = { ok: true } | { ok: false; reason: string }

function refresh() {
  revalidatePath('/team', 'layout')
}

/** Put a title on a rung, or take it off the ladder (null). */
export async function setTitleLevel(titleId: string, levelId: string | null): Promise<LadderOutcome> {
  await requireActionOn('/team/hierarchy', 'team', 'manage')
  if (!titleId) return { ok: false, reason: 'Which title?' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('titles')
    .update({ level_id: levelId })
    .eq('id', titleId)

  // 23DIR: a title that heads its department stands above the ladder.
  if (error) return { ok: false, reason: error.code === '23DIR' ? error.message : 'Could not move the title. Please try again.' }
  refresh()
  return { ok: true }
}

/**
 * A new, empty rung at `rank`; everything at or above it moves up one. Pass
 * one more than the top rank to add a rung on top, 1 to add one underneath.
 */
export async function insertLevel(rank: number, name = 'New level'): Promise<LadderOutcome> {
  await requireActionOn('/team/hierarchy', 'team', 'manage')
  if (!Number.isInteger(rank) || rank < 1) return { ok: false, reason: 'Where should the level go?' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('ladder_insert_level', { p_rank: rank, p_name: name })

  // The function's own sentences are written for the page.
  if (error) return { ok: false, reason: error.message || 'Could not add the level. Please try again.' }
  refresh()
  return { ok: true }
}

export async function renameLevel(levelId: string, name: string): Promise<LadderOutcome> {
  await requireActionOn('/team/hierarchy', 'team', 'manage')
  if (!levelId) return { ok: false, reason: 'Which level?' }
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, reason: 'A level needs a name' }
  if (trimmed.length > 60) return { ok: false, reason: 'That name is too long' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('title_levels')
    .update({ name: trimmed })
    .eq('id', levelId)

  if (error) return { ok: false, reason: 'Could not rename the level. Please try again.' }
  refresh()
  return { ok: true }
}

/** Remove an EMPTY rung; the ones above it close the gap. */
export async function deleteLevel(levelId: string): Promise<LadderOutcome> {
  await requireActionOn('/team/hierarchy', 'team', 'manage')
  if (!levelId) return { ok: false, reason: 'Which level?' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('ladder_delete_level', { p_id: levelId })

  if (error) return { ok: false, reason: error.message || 'Could not remove the level. Please try again.' }
  refresh()
  return { ok: true }
}
