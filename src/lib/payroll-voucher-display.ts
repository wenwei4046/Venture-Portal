/** Labels for immutable salary payment snapshots; no employee profile lookup. */
export function salaryPaymentLabel(component: string | null | undefined): string {
  if (component === 'basic') return 'Basic salary (net)'
  if (component === 'commission') return 'Commission'
  return 'Net salary'
}

export function recipientAccountLabel(account: string | null | undefined): string | null {
  if (account === 'account_1') return 'Account 1'
  if (account === 'account_2') return 'Account 2'
  return null
}
