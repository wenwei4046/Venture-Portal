import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { bankFromRow, type Bank } from './bank'
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

export type BankRead = { ok: true; bank: Bank } | { ok: false; reason: string }

/**
 * The Talent Bank as a Drive (mig 20261013030000): `hiring_bank()` asks Hiring · View itself and answers HOUZS
 * Venture's departments, the guest link's companies, the folders and files HR keeps and where each talent is.
 */
export async function loadTalentBank(): Promise<BankRead> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('hiring_bank')
  const bank = error ? null : bankFromRow(data)
  if (!bank) {
    return { ok: false, reason: error?.code === '42501' ? 'Hiring needs Hiring · View.' : 'The Talent Bank’s folders could not be read. Please try again.' }
  }
  // The Bin counts its days from the read, not from when the page was first drawn (mig 20261013061500).
  return { ok: true, bank: { ...bank, readAt: new Date().toISOString() } }
}
