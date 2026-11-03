// A deal's audit log in words (2026-10-15, the Finance revamp v2 — D06's
// *Audit log* card on a loan's and a fund source's full page): each change
// `audit_changes()` hands back for the deal and its repayments — what this
// reader's permissions open — said the way the page says it. Pure, so the
// wording is tested without a database.

export interface DealChange {
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  table_name: string
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
  changed: string[] | null
}

const money = (v: unknown) => `RM ${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (v: unknown) => `${(Number(v ?? 0) * 100).toFixed(3)}%`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (v: unknown) => {
  if (!v) return 'none'
  const s = String(v)
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return Number.isFinite(y) && m ? `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}` : s
}
const onOff = (v: unknown) => (v === true ? 'on' : 'off')
const months = (v: unknown) => (v == null ? 'no fixed term' : `${v} ${Number(v) === 1 ? 'month' : 'months'}`)
const TYPE: Record<string, string> = { principal: 'Principal', interest: 'Interest', penalty: 'Penalty', netting: 'Netting' }
const typeWord = (v: unknown) => TYPE[String(v ?? '')] ?? String(v ?? 'Repayment')

/** Bookkeeping a person did not change. */
const QUIET = new Set(['updated_at', 'version', 'approved_by', 'approved_at', 'repaid_by', 'repaid_at', 'repayment_start_month', 'terms_effective_from'])

const STATUS_LINE: Record<string, Record<string, string>> = {
  loans: { active: 'Approved — disbursed', fully_repaid: 'Fully repaid', cancelled: 'Cancelled', pending_approval: 'Back to pending approval' },
  fund_sources: { active: 'Approved — received', matured: 'Matured', repaid: 'Repaid in full', cancelled: 'Cancelled', pending_approval: 'Back to pending approval' },
}

function fieldLine(table: string, key: string, before: Record<string, unknown>, after: Record<string, unknown>): string | null {
  if (QUIET.has(key)) return null
  if (key === 'status') return STATUS_LINE[table]?.[String(after.status)] ?? `Status ${String(before.status ?? '—').replace(/_/g, ' ')} → ${String(after.status ?? '—').replace(/_/g, ' ')}`
  if (key === 'principal' || key === 'amount') return `${key === 'principal' ? 'Principal' : 'Amount'} ${money(before[key])} → ${money(after[key])}`
  if (key === 'effective_rate' || key === 'cost_rate') return `Rate ${pct(before[key])} → ${pct(after[key])} /mo`
  if (key === 'risk_premium') return `Custom premium ${pct(before[key])} → ${pct(after[key])}`
  if (key === 'base_rate') return `Base rate ${pct(before[key])} → ${pct(after[key])}`
  if (key === 'tenure_months' || key === 'lock_in_months') return `Term ${months(before[key])} → ${months(after[key])}`
  if (key === 'disbursement_date') return `Disbursed ${day(before[key])} → ${day(after[key])}`
  if (key === 'effective_date') return `Date ${day(before[key])} → ${day(after[key])}`
  if (key === 'maturity_date') return `Maturity ${day(before[key])} → ${day(after[key])}`
  if (key === 'repayment_start_date' || key === 'repayment_date') return `First repayment ${day(before[key])} → ${day(after[key])}`
  if (key === 'compound_interest') return `Compound interest ${onOff(after[key])}`
  if (key === 'min_pay_interest') return `Minimum pay interest ${onOff(after[key])}`
  // Its month (2026-10-30) — turned off, the switch's own line says it.
  if (key === 'min_pay_interest_from') {
    if (after.min_pay_interest === false) return null
    if (!after[key]) return 'Minimum pay interest from the first instalment'
    const [y, m] = String(after[key]).slice(0, 7).split('-').map(Number)
    return `Minimum pay interest from ${m ? `${MON[m - 1]} ${y}` : String(after[key])}`
  }
  if (key === 'repayment_terms') return 'Terms changed'
  if (key === 'notes') return 'Notes changed'
  if (key === 'account_code') return `Account ${String(before[key] ?? 'default')} → ${String(after[key] ?? 'default')}`
  if (key === 'bank_account_id') return 'Bank changed'
  return `${key.replace(/_id$/, '').replace(/_/g, ' ')} changed`.replace(/^./, (c) => c.toUpperCase())
}

/** One change in the page's words: *Created · RM 50,000.00*, *Approved — disbursed*, *Rate 2.000% → 1.500% /mo*, *Repayment recorded · Interest RM 2,000.00 · 20 Sep 2026*. */
export function dealChangeLine(c: DealChange): string {
  const after = c.new_row ?? {}
  const before = c.old_row ?? {}
  const repayment = c.table_name === 'repayments' || c.table_name === 'fund_source_repayments'
  if (repayment) {
    const row = c.op === 'DELETE' ? before : after
    if (c.op === 'INSERT') return `Repayment recorded · ${typeWord(row.payment_type)} ${money(row.amount)} · ${day(row.payment_date)}`
    if (c.op === 'DELETE') return `Repayment removed · ${typeWord(row.payment_type)} ${money(row.amount)} · ${day(row.payment_date)}`
    const parts = (c.changed ?? [])
      .map((k) =>
        k === 'amount'
          ? `${money(before.amount)} → ${money(after.amount)}`
          : k === 'payment_date'
            ? `${day(before.payment_date)} → ${day(after.payment_date)}`
            : k === 'payment_type'
              ? `${typeWord(before.payment_type)} → ${typeWord(after.payment_type)}`
              : null,
      )
      .filter((p): p is string => !!p)
    return `Repayment ${typeWord(after.payment_type)} ${parts.length > 0 ? parts.join(' · ') : 'changed'}`
  }
  if (c.op === 'INSERT') return `Created · ${money(after.principal ?? after.amount)}`
  if (c.op === 'DELETE') return 'Deleted'
  const parts = (c.changed ?? []).map((k) => fieldLine(c.table_name, k, before, after)).filter((p): p is string => !!p)
  return parts.length > 0 ? parts.join(' · ') : 'Updated'
}
