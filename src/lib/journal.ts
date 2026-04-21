import { SupabaseClient } from '@supabase/supabase-js'

/**
 * A single debit or credit line in a journal entry.
 * Exactly one of debit/credit must be set (> 0), the other null/undefined.
 */
export interface JournalLine {
  accountCode: string
  debit?: number
  credit?: number
  description?: string
}

export interface PostJournalEntryInput {
  transactionDate: string
  description: string
  referenceType?: string
  referenceId?: string
  lines: JournalLine[]
  createdBy: string
}

/**
 * Posts a balanced double-entry journal entry via the post_journal_entry RPC.
 * Strict 0.00 balance enforcement — debit and credit totals must match exactly
 * at 2-decimal precision. TS-side shape check fails fast before hitting the DB.
 */
export async function postJournalEntry(
  supabase: SupabaseClient,
  input: PostJournalEntryInput,
): Promise<string> {
  const { transactionDate, description, referenceType, referenceId, lines, createdBy } = input

  if (lines.length < 2) {
    throw new Error('Journal entry must have at least 2 lines')
  }

  const totalDebit = r2(lines.reduce((sum, l) => sum + (l.debit ?? 0), 0))
  const totalCredit = r2(lines.reduce((sum, l) => sum + (l.credit ?? 0), 0))

  if (totalDebit !== totalCredit) {
    throw new Error(
      `Journal entry unbalanced: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}`,
    )
  }

  for (const line of lines) {
    const hasDebit = line.debit != null && line.debit > 0
    const hasCredit = line.credit != null && line.credit > 0
    if (hasDebit === hasCredit) {
      throw new Error(
        `Journal line for ${line.accountCode} must have exactly one of debit or credit`,
      )
    }
  }

  const { data, error } = await supabase.rpc('post_journal_entry', {
    p_transaction_date: transactionDate,
    p_description: description,
    p_reference_type: referenceType ?? null,
    p_reference_id: referenceId ?? null,
    p_created_by: createdBy,
    p_lines: lines.map((l) => ({
      account_code: l.accountCode,
      debit: l.debit ?? null,
      credit: l.credit ?? null,
      description: l.description ?? null,
    })),
  })

  if (error) {
    throw new Error(`Failed to post journal entry: ${error.message}`)
  }

  return data as string
}

/**
 * Round to 2 decimals (accounting precision).
 */
export function r2(n: number): number {
  return Math.round(n * 100) / 100
}
