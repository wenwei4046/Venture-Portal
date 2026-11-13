// A deal's rate said per month or per year once it is amended (2026-11-13, the user: "要可以年息" → A, "当年息显示"):
// the Amend terms form sends `rate_basis` with the rate. The Fund OUT / Fund IN actions keep it — on the deal (the
// Principal's own change, set_deal_rate_basis) or on the request filed for the Principal (set_terms_request_rate_basis;
// approve_terms_change writes it onto the deal). Mig 20261113130000.

export type DealKind = 'loan' | 'fund_source'

/** The basis the form sent with a rate — none when the rate was not changed. */
export function basisSent(fd: FormData): 'month' | 'year' | null {
  const v = fd.get('rate_basis')
  return v === 'month' || v === 'year' ? v : null
}
