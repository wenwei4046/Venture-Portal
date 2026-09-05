'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'

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
 */

function refresh() {
  revalidatePath('/team', 'layout')
}

/** Put a title on a rung, or take it off the ladder (null). */
export async function setTitleLevel(titleId: string, levelId: string | null): Promise<void> {
  await requirePermission('team')
  if (!titleId) throw new Error('Which title?')

  const supabase = await createClient()
  const { error } = await supabase
    .from('titles')
    .update({ level_id: levelId })
    .eq('id', titleId)

  if (error) throw new Error(`Could not move the title: ${error.message}`)
  refresh()
}

/**
 * A new, empty rung at `rank`; everything at or above it moves up one. Pass
 * one more than the top rank to add a rung on top, 1 to add one underneath.
 */
export async function insertLevel(rank: number, name = 'New level'): Promise<void> {
  await requirePermission('team')
  if (!Number.isInteger(rank) || rank < 1) throw new Error('Where should the level go?')

  const supabase = await createClient()
  const { error } = await supabase.rpc('ladder_insert_level', { p_rank: rank, p_name: name })

  // The function's own sentences are written for the page.
  if (error) throw new Error(error.message)
  refresh()
}

export async function renameLevel(levelId: string, name: string): Promise<void> {
  await requirePermission('team')
  if (!levelId) throw new Error('Which level?')
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A level needs a name')
  if (trimmed.length > 60) throw new Error('That name is too long')

  const supabase = await createClient()
  const { error } = await supabase
    .from('title_levels')
    .update({ name: trimmed })
    .eq('id', levelId)

  if (error) throw new Error(`Could not rename the level: ${error.message}`)
  refresh()
}

/** Remove an EMPTY rung; the ones above it close the gap. */
export async function deleteLevel(levelId: string): Promise<void> {
  await requirePermission('team')
  if (!levelId) throw new Error('Which level?')

  const supabase = await createClient()
  const { error } = await supabase.rpc('ladder_delete_level', { p_id: levelId })

  if (error) throw new Error(error.message)
  refresh()
}
