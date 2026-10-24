import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mayActOn } from '@/lib/auth'
import type { PageRoute } from '@/lib/page-tabs'
import { letterChoicesFromRow, type LetterChoice } from './attach'

/**
 * The letter types People's forms offer beside the employment status (2026-10-24, ./attach.ts) — null when this viewer
 * may not file a letter from that page (Documentation · Create), so the form offers no letters at all.
 * `hr_letter_type_choices()` asks the same cell (mig 20261025052000); a refusal or a failed read offers none.
 */
export async function letterChoicesOn(supabase: unknown, page: PageRoute): Promise<LetterChoice[] | null> {
  if (!(await mayActOn(page, 'documentation', 'create'))) return null
  // The function postdates database.types.ts.
  const { data, error } = await (supabase as SupabaseClient).rpc('hr_letter_type_choices')
  return error ? null : letterChoicesFromRow(data)
}
