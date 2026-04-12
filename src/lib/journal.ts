import { SupabaseClient } from '@supabase/supabase-js'
import dayjs from 'dayjs'

/**
 * A single debit or credit line in a journal entry.
 * Exactly one of debit/credit must be set (> 0), the other null.
 */
export interface JournalLine {
  accountCode: string   // FK to chart_of_accounts.code (e.g. '1010')
  debit?: number        // set for debit lines
  credit?: number       // set for credit lines
  description?: string  // optional per-line note
}

export interface PostJournalEntryInput {
  transactionDate: string          // ISO date (e.g. '2026-04-12')
  description: string              // header description
  referenceType?: string           // 'fund_source' | 'loan' | 'payment_voucher' | etc.
  referenceId?: string             // UUID of source record
  lines: JournalLine[]             // must have ≥ 2 lines, sum(debit) = sum(credit)
  createdBy: string                // user UUID
}

/**
 * Posts a balanced double-entry journal entry.
 * Validates that total debits = total credits before inserting.
 * Returns the journal entry ID.
 */
export async function postJournalEntry(
  supabase: SupabaseClient,
  input: PostJournalEntryInput
): Promise<string> {
  const { transactionDate, description, referenceType, referenceId, lines, createdBy } = input

  // ── Validation ──
  if (lines.length < 2) {
    throw new Error('Journal entry must have at least 2 lines')
  }

  const totalDebit = lines.reduce((sum, l) => sum + (l.debit ?? 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit ?? 0), 0)

  // Allow tiny rounding tolerance (0.01)
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Journal entry is unbalanced: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}`
    )
  }

  // Validate each line has exactly one of debit or credit
  for (const line of lines) {
    const hasDebit = line.debit != null && line.debit > 0
    const hasCredit = line.credit != null && line.credit > 0
    if (hasDebit === hasCredit) {
      throw new Error(
        `Journal line for ${line.accountCode} must have exactly one of debit or credit`
      )
    }
  }

  // ── Generate entry number ──
  const period = dayjs(transactionDate).format('YYYYMM')
  const periodMonth = dayjs(transactionDate).startOf('month').format('YYYY-MM-DD')

  const { count } = await supabase
    .from('journal_entries')
    .select('*', { count: 'exact', head: true })
  const seq = (count ?? 0) + 1
  const entryNo = `JE-${period}-${String(seq).padStart(4, '0')}`

  // ── Insert header ──
  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      entry_no: entryNo,
      transaction_date: transactionDate,
      period_month: periodMonth,
      description,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      total_amount: totalDebit,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (entryError) {
    throw new Error(`Failed to create journal entry: ${entryError.message}`)
  }

  // ── Insert lines ──
  const lineRows = lines.map((l) => ({
    entry_id: entry.id,
    account_code: l.accountCode,
    debit: l.debit ?? null,
    credit: l.credit ?? null,
    description: l.description ?? null,
  }))

  const { error: linesError } = await supabase
    .from('journal_lines')
    .insert(lineRows)

  if (linesError) {
    throw new Error(`Failed to create journal lines: ${linesError.message}`)
  }

  return entry.id
}

/**
 * Round to 2 decimals (accounting precision).
 */
export function r2(n: number): number {
  return Math.round(n * 100) / 100
}
