export function voucherUpstreamHref(
  referenceType: string | null | undefined,
  referenceId: string | null | undefined,
): string | null {
  if (!referenceType || !referenceId) return null

  switch (referenceType) {
    case 'loan':
      return `/fund-out/${referenceId}`
    case 'invoice':
      return `/statements/${referenceId}`
    case 'fund_source':
      return `/fund-in/${referenceId}`
    case 'payroll_run':
      return `/approvals/payroll-run/${referenceId}`
    default:
      return null
  }
}

export function voucherUpstreamLabel(referenceType: string | null | undefined): string | null {
  if (!referenceType) return null
  const labels: Record<string, string> = {
    loan: 'Loan',
    invoice: 'Invoice',
    fund_source: 'Fund source',
    payroll_run: 'Payroll run',
    claim: 'Claim',
    hr_opex: 'HR OPEX',
    salary_payout: 'Salary payout',
  }
  return labels[referenceType] ?? referenceType.replace(/_/g, ' ')
}
