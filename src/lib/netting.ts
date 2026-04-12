/**
 * Netting engine — auto-offset subsidiary credits vs debits.
 *
 * A subsidiary can be both:
 *   - Creditor: has fund_sources (lent money to HV) → HV owes them interest
 *   - Debtor: has loans (borrowed from HV) → they owe HV interest + principal
 *
 * Monthly statement net_amount = invoice_total (HV charges) - contra_total (HV owes)
 *   Positive net = subsidiary pays HV
 *   Negative net = HV pays subsidiary
 *
 * The netting engine does NOT create payments — it calculates the offset amounts
 * that flow into monthly_statement_lines as contra items. The actual settlement
 * happens via payment vouchers.
 *
 * This module provides pure calculation helpers. Server Actions call these
 * during statement generation.
 */

export interface NettingInput {
  companyId: string
  companyName: string
  // What HV charges the subsidiary (receivables)
  invoiceTotal: number
  // What HV owes the subsidiary (payables)
  interestOwed: number      // fund source interest
  principalDue: number      // fund source principal repayment due this month
  creditNoteTotal: number   // credit notes to apply
}

export interface NettingResult {
  companyId: string
  companyName: string
  grossReceivable: number     // invoiceTotal
  grossPayable: number        // interestOwed + principalDue
  creditNoteOffset: number    // credit notes reducing receivable
  netReceivable: number       // grossReceivable - creditNoteOffset
  netAmount: number           // netReceivable - grossPayable (positive = sub pays HV)
  direction: 'receivable' | 'payable' | 'zero'
}

/**
 * Calculate netting for a single subsidiary in a given period.
 */
export function calculateNetting(input: NettingInput): NettingResult {
  const grossReceivable = r2(input.invoiceTotal)
  const grossPayable = r2(input.interestOwed + input.principalDue)
  const creditNoteOffset = r2(input.creditNoteTotal)

  const netReceivable = r2(grossReceivable - creditNoteOffset)
  const netAmount = r2(netReceivable - grossPayable)

  return {
    companyId: input.companyId,
    companyName: input.companyName,
    grossReceivable,
    grossPayable,
    creditNoteOffset,
    netReceivable,
    netAmount,
    direction: netAmount > 0.01 ? 'receivable' : netAmount < -0.01 ? 'payable' : 'zero',
  }
}

/**
 * Calculate netting for all subsidiaries.
 */
export function calculateBatchNetting(inputs: NettingInput[]): NettingResult[] {
  return inputs.map(calculateNetting)
}

function r2(n: number): number {
  return Math.round(n * 100) / 100
}
