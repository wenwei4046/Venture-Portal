import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { boardFromJson } from './parse'
import type { HiringBoard } from './types'

/**
 * Everything the Hiring pages draw, in one round trip (2026-10-11):
 * `hiring_board()` (mig 20261011080000) asks Hiring · View itself and answers
 * the requests with their candidates and trails, the form, the sources, the
 * candidate fields, the people a request may name, the Talent Bank and the
 * reader. A refusal comes back as words, never a throw — the page still draws.
 */
export type BoardRead = { ok: true; board: HiringBoard } | { ok: false; reason: string }

export async function loadHiringBoard(): Promise<BoardRead> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('hiring_board')
  if (error) {
    return {
      ok: false,
      reason: error.code === '42501' ? 'Hiring needs Hiring · View.' : 'The hiring requests could not be read. Please try again.',
    }
  }
  return { ok: true, board: boardFromJson(data) }
}
