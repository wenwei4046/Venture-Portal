'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

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
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { error } = await supabase.rpc('create_manual_journal_voucher' as never, {
    p_transaction_date: input.transaction_date,
    p_description: input.description.trim(),
    p_lines: normalizeLines(input.lines),
  } as never)

  if (error) throw new Error(error.message)

  revalidatePath('/reconciliation/journal-entries')
  redirect('/reconciliation/journal-entries')
}

export async function updateJournalVoucher(
  id: string,
  input: JournalVoucherInput
): Promise<void> {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { error } = await supabase.rpc('update_manual_journal_voucher' as never, {
    p_entry_id: id,
    p_transaction_date: input.transaction_date,
    p_description: input.description.trim(),
    p_lines: normalizeLines(input.lines),
  } as never)

  if (error) throw new Error(error.message)

  revalidatePath('/reconciliation/journal-entries')
  redirect('/reconciliation/journal-entries')
}

export async function deleteJournalVoucher(id: string): Promise<void> {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_manual_journal_voucher' as never, {
    p_entry_id: id,
  } as never)

  if (error) throw new Error(error.message)

  revalidatePath('/reconciliation/journal-entries')
}
