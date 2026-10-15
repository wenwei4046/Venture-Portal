'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'

// ─── Manual Journal Voucher actions ───────────────────────────────────────────
//
// Thin wrappers over the three Postgres RPCs that own all validation
// (balance, min-2-lines, leaf-account check, manual_jv guard) and entry_no /
// created_by generation. Per CLAUDE.md, Server Actions throw on error — the
// JournalVoucherForm catches the message and renders it inline. The generated
// database.types.ts does not yet know these RPCs, so the rpc name + args are
// cast to `never` narrowly here (the only place untyped RPCs are tolerated).

export interface JournalVoucherLineInput {
  account_code: string
  debit: number
  credit: number
  description?: string
}

export interface JournalVoucherInput {
  transaction_date: string
  description: string
  /** GL segment the JV belongs to (mig 20260612000000). 'unallocated' = top-level adjustment. */
  segment: string
  lines: JournalVoucherLineInput[]
}

function normalizeLines(lines: JournalVoucherLineInput[]) {
  return lines.map((l) => ({
    account_code: l.account_code,
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
    description: l.description?.trim() ? l.description.trim() : null,
  }))
}

export async function createJournalVoucher(input: JournalVoucherInput): Promise<void> {
  await requireActionOn('/reconciliation/journal-entries', 'reconciliation', 'create')
  const supabase = await createClient()

  const { error } = await supabase.rpc('create_manual_journal_voucher' as never, {
    p_transaction_date: input.transaction_date,
    p_description: input.description.trim(),
    p_lines: normalizeLines(input.lines),
    p_segment: input.segment || 'unallocated',
  } as never)

  if (error) throw new Error(error.message)

  revalidatePath('/reconciliation/journal-entries')
  redirect('/reconciliation/journal-entries')
}

export async function updateJournalVoucher(
  id: string,
  input: JournalVoucherInput
): Promise<void> {
  await requireActionOn('/reconciliation/journal-entries', 'reconciliation', 'edit')
  const supabase = await createClient()

  const { error } = await supabase.rpc('update_manual_journal_voucher' as never, {
    p_entry_id: id,
    p_transaction_date: input.transaction_date,
    p_description: input.description.trim(),
    p_lines: normalizeLines(input.lines),
    p_segment: input.segment || 'unallocated',
  } as never)

  if (error) throw new Error(error.message)

  revalidatePath('/reconciliation/journal-entries')
  redirect('/reconciliation/journal-entries')
}

export async function deleteJournalVoucher(id: string): Promise<void> {
  await requireActionOn('/reconciliation/journal-entries', 'reconciliation', 'edit')
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_manual_journal_voucher' as never, {
    p_entry_id: id,
  } as never)

  if (error) throw new Error(error.message)

  revalidatePath('/reconciliation/journal-entries')
}

// ─── The same three, answered in words (2026-10-15, the Finance phone app) ──
// The phone's voucher sheet stays in the app, so it needs the answer, not a
// redirect into the portal's list — and production reduces a thrown
// message to a digest, so the RPCs' own refusals (out of balance, a header
// account, fewer than two lines) are handed back as words. Same gates, same
// RPCs, same revalidation.

export type JvAnswer = { ok: true; id: string } | { ok: false; reason: string }

export async function postJournalVoucherInWords(input: JournalVoucherInput): Promise<JvAnswer> {
  await requireActionOn('/reconciliation/journal-entries', 'reconciliation', 'create')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_manual_journal_voucher' as never, {
    p_transaction_date: input.transaction_date,
    p_description: input.description.trim(),
    p_lines: normalizeLines(input.lines),
    p_segment: input.segment || 'unallocated',
  } as never)
  if (error) return { ok: false, reason: error.message }
  revalidatePath('/reconciliation/journal-entries')
  return { ok: true, id: String(data ?? '') }
}

export async function saveJournalVoucherInWords(id: string, input: JournalVoucherInput): Promise<JvAnswer> {
  await requireActionOn('/reconciliation/journal-entries', 'reconciliation', 'edit')
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_manual_journal_voucher' as never, {
    p_entry_id: id,
    p_transaction_date: input.transaction_date,
    p_description: input.description.trim(),
    p_lines: normalizeLines(input.lines),
    p_segment: input.segment || 'unallocated',
  } as never)
  if (error) return { ok: false, reason: error.message }
  revalidatePath('/reconciliation/journal-entries')
  return { ok: true, id }
}

export async function deleteJournalVoucherInWords(id: string): Promise<JvAnswer> {
  await requireActionOn('/reconciliation/journal-entries', 'reconciliation', 'edit')
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_manual_journal_voucher' as never, { p_entry_id: id } as never)
  if (error) return { ok: false, reason: error.message }
  revalidatePath('/reconciliation/journal-entries')
  return { ok: true, id }
}
