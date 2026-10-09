// The Venture Pool's shared words (2026-10-09): what a pool ledger line's
// journal entry was, from its reference type — the page's ledger and its
// Export say the same thing.

export function ventureRefLabel(refType: string | null): string {
  if (!refType) return 'Journal'
  switch (refType) {
    case 'manual_jv':
      return 'Manual JV'
    case 'invoice':
      return 'Invoice settled'
    case 'voucher':
    case 'payment_voucher':
      return 'Payment voucher'
    case 'fund_source':
      return 'Fund source'
    case 'fund_source_repayment':
      return 'Fund source repayment'
    case 'loan':
      return 'Loan'
    case 'repayment':
      return 'Loan repayment'
    case 'invoice_paid_credit':
      return 'Invoice paid credit'
    default:
      return refType.replace(/_/g, ' ')
  }
}
