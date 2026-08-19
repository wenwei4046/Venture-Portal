// Payer-side NATURE accounts for inter-billing (user request 2026-07-24:
// "把 interbilling 根据相对应的费用打去相对应的 account" — the original
// "marketing rental" ask). When a dept is billed internally, its P&L should
// show WHAT the charge was (Office Rental, Water & Electricity, Salary…),
// not a lump "Inter-billing" figure.
//
// Mapping rules, per invoice line:
//   income-type category on the receiver → payer expense counterpart
//       7012 Rental Income → 9094 Office Rental
//       5050 Salary Income → 9030 Salary Expense (code was 5020 until the
//       2026-08-19 COA rename)
//   expense-type category (expense recovery, e.g. 9091 utilities) → the SAME
//       account: receiver carries the credit, payer the debit — the expense
//       simply migrates to the dept that consumed it.
//   uncategorised / unmapped → the dept's 905x fallback (kept as a safety net
//   so posting never fails; normally stays at zero).

export const INCOME_TO_PAYER_EXPENSE: Record<string, string> = {
  '7012': '9094', // Rental Income → Office Rental
  '5050': '9030', // Salary Income → Salary Expense
}

const r2 = (n: number) => Math.round(n * 100) / 100

export interface NatureSplit {
  accountCode: string
  amount: number
}

/** Group an internal invoice's lines into payer-side expense splits.
 *  `lines` empty → single-line legacy invoice, uses headerCategory for the
 *  full total. `typeOf` looks a category up in the COA (undefined = unknown). */
export function payerExpenseSplits(
  lines: { category_code: string | null; amount: number }[],
  invoiceTotal: number,
  headerCategory: string | null,
  typeOf: (code: string) => string | undefined,
  fallbackCode: string,
): NatureSplit[] {
  const source = lines.length > 0 ? lines : [{ category_code: headerCategory, amount: invoiceTotal }]
  const byAccount = new Map<string, number>()
  for (const l of source) {
    const cat = l.category_code
    let target = fallbackCode
    if (cat) {
      if (INCOME_TO_PAYER_EXPENSE[cat]) target = INCOME_TO_PAYER_EXPENSE[cat]
      else if (typeOf(cat) === 'expense') target = cat
    }
    byAccount.set(target, r2((byAccount.get(target) ?? 0) + Number(l.amount)))
  }
  return [...byAccount.entries()].map(([accountCode, amount]) => ({ accountCode, amount }))
}
