// Inter-billing → cash-flow bridge.
//
// Inter-billing recharges (a dept paying its share of a shared cost to Venture
// (Office)) settle ONLY in the dept_pools management ledger — a conceptual cash
// transfer within the Hong Leong bank, with NO GL journal entry (there is no real
// bank movement; HV's cash is commingled). So the GL-driven Cash Flow, read from
// journal_lines, can't see it — a segment's closing cash comes out equal to its
// raw GL bank slice, which is HIGHER than its Dept Pool balance by exactly the
// inter-billing it paid out.
//
// To make each segment's Cash Flow tie to its Dept Pool, we feed SYNTHETIC lines
// into buildCashFlow — for every inter_billing_out settle, a paired transfer:
//   paying dept  : Cr bank (cash out) + Dr "Inter-billing" (Financing)
//   Venture Office: Dr bank (cash in) + Cr "Inter-billing" (Financing)
// These exist only in the report computation (never the GL), and the two sides
// net to zero, so the consolidated (all-segments) Cash Flow is unchanged while
// each single-segment view now closes at its Dept Pool balance. This mirrors how
// an in-house-bank participant's cash flow carries a "transfer to/from the
// in-house bank" financing line.

import type { CoaAccount, GlLine } from './gl-reports'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Pseudo account code for the synthetic Financing transfer legs. */
export const INTERBILL_TRANSFER_CODE = 'IB-XFER'

/** Pseudo COA account so buildCashFlow files the transfer under Financing. */
export const interBillTransferAccount: CoaAccount = {
  code: INTERBILL_TRANSFER_CODE,
  name: 'Inter-billing (internal transfer)',
  type: 'equity', // unused for cash flow — cash_flow_category drives categorisation
  parent_code: null,
  cash_flow_category: 'financing',
}

// Paying departments → their GL segment. Venture Office (the receiver) is always
// 'corporate' in the GL/segment world.
const DEPT_TO_SEGMENT: Record<string, string> = {
  Marketing: 'marketing',
  HR: 'hr',
  Finance: 'finance',
  'Director Office': 'director_office',
  Director: 'director',
}
const VENTURE_SEGMENT = 'corporate'

export interface InterBillRow {
  deptName: string
  amount: number
  date: string // YYYY-MM-DD (settle date)
}

function mkLine(
  entry_id: string,
  account_code: string,
  debit: number,
  credit: number,
  date: string,
  segment: string,
  description: string,
): GlLine {
  return {
    account_code,
    debit,
    credit,
    description,
    entry_id,
    date,
    entry_no: null,
    entry_description: description,
    segment,
    ref_type: 'inter_billing_transfer',
    ref_id: null,
    party: null,
  }
}

/**
 * Pure: turn dept_pools inter_billing_out rows into synthetic cash-flow lines.
 * `bankCode` is the bank the transfer conceptually rides (primary / Hong Leong).
 */
export function buildInterBillingCashFlowLines(rows: InterBillRow[], bankCode: string): GlLine[] {
  const lines: GlLine[] = []
  let i = 0
  for (const row of rows) {
    const seg = DEPT_TO_SEGMENT[row.deptName]
    const amt = Math.round((Number(row.amount) || 0) * 100) / 100
    const date = (row.date ?? '').slice(0, 10)
    if (!seg || !(amt > 0) || !date) continue
    const payId = `ibx-pay-${i}`
    const recId = `ibx-rec-${i}`
    i++
    // Paying dept: cash OUT of its slice.
    lines.push(
      mkLine(payId, bankCode, 0, amt, date, seg, `Inter-billing to Venture (Office)`),
      mkLine(payId, INTERBILL_TRANSFER_CODE, amt, 0, date, seg, `Inter-billing paid — ${row.deptName}`),
    )
    // Venture (Office): cash INTO its slice.
    lines.push(
      mkLine(recId, bankCode, amt, 0, date, VENTURE_SEGMENT, `Inter-billing from ${row.deptName}`),
      mkLine(recId, INTERBILL_TRANSFER_CODE, 0, amt, date, VENTURE_SEGMENT, `Inter-billing received — ${row.deptName}`),
    )
  }
  return lines
}

/**
 * Fetch inter_billing_out settles and return synthetic cash-flow lines + the
 * pseudo account to add to the COA list. Resilient: on any read error (e.g. a
 * dept_manager RLS-blocked from dept_pools) it returns no lines, so the Cash
 * Flow still renders (just un-adjusted, as before).
 */
export async function fetchInterBillingCashFlow(
  supabase: SupabaseClient,
  bankCodes: ReadonlySet<string>,
): Promise<{ lines: GlLine[]; account: CoaAccount }> {
  const bankCode = bankCodes.has('3000')
    ? '3000'
    : (bankCodes.values().next().value ?? '3000')
  try {
    const { data, error } = await supabase
      .from('dept_pools')
      .select('amount, created_at, departments!inner(name)')
      .eq('transaction_type', 'inter_billing_out')
    if (error) throw error
    const rows: InterBillRow[] = (data ?? []).map((r) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deptName: ((r.departments as any)?.name as string) ?? '',
      amount: Number(r.amount ?? 0),
      date: String(r.created_at ?? '').slice(0, 10),
    }))
    return { lines: buildInterBillingCashFlowLines(rows, bankCode), account: interBillTransferAccount }
  } catch {
    return { lines: [], account: interBillTransferAccount }
  }
}
