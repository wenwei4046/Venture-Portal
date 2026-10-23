import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import { SOURCE_TYPE_LABELS, withCode, type FundRecord, type FundStatus } from '@/lib/fund-hub'
import { installmentsInAll, resolveFirstDueYM } from '@/lib/treasury-terms'

// Fund IN's hub reads (2026-10-15, the Finance revamp v2 — D12): every fund
// source with who it came from (a company, a department, a director by name),
// what is still owed back on it (`fund_source_outstanding`), the bank it came
// into and the account it is booked to, who made and approved it, and a
// pending one's approval request where this reader may see it.

type SourceRow = {
  id: string
  source_type: string
  from_company_id: string | null
  from_director_id: string | null
  from_department_id: string | null
  from_freetext_name: string | null
  amount: number | string
  cost_rate: number | string
  lock_in_months: number | null
  effective_date: string | null
  repayment_start_month: string | null
  terms_effective_from: string | null
  maturity_date: string | null
  status: FundStatus
  notes: string | null
  compound_interest: boolean | null
  min_pay_interest: boolean | null
  bank_account_id: string | null
  account_code: string | null
  created_by: string | null
  created_at: string
  repaid_at: string | null
  repaid_by: string | null
}

export async function loadSourceHub(supabase: SupabaseClient): Promise<FundRecord[]> {
  const [{ data: sources, error }, { data: companies }, { data: directors }, { data: departments }, { data: outstandingRows }, { data: banks }, { data: accounts }, { data: requests }] = await Promise.all([
    supabase
      .from('fund_sources')
      .select('id, source_type, from_company_id, from_director_id, from_department_id, from_freetext_name, amount, cost_rate, lock_in_months, effective_date, repayment_start_month, terms_effective_from, maturity_date, status, notes, compound_interest, min_pay_interest, bank_account_id, account_code, created_by, created_at, repaid_at, repaid_by')
      .order('effective_date', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('directors').select('id, name, code'),
    // is_internal=false — the 'Venture Office' pseudo-dept is not a fund source.
    supabase.from('departments').select('id, name').eq('is_internal', false),
    supabase.from('fund_source_outstanding').select('fund_source_id, outstanding'),
    supabase.from('bank_accounts').select('id, bank_name, account_number'),
    supabase.from('chart_of_accounts').select('code, name'),
    // Who approved it is the approved request's; a pending one links to its queue entry, and a cancellation
    // (filed as a tier_change, cancelFundSource's) says so — where this reader may see them.
    supabase
      .from('approval_requests')
      .select('id, reference_id, request_type, status, submitted_by, approved_by, approved_at')
      .eq('reference_table', 'fund_sources')
      .in('request_type', ['new_fund_source', 'tier_change'])
      .in('status', ['pending', 'approved']),
  ])
  if (error) throw new Error('Unable to load the fund sources. Please try again.')
  const rows = (sources ?? []) as SourceRow[]
  const all = (requests ?? []) as Array<{ id: string; reference_id: string; request_type: string; status: string; submitted_by: string | null; approved_by: string | null; approved_at: string | null }>
  const reqs = all.filter((r) => r.request_type === 'new_fund_source')
  const cancelling = new Set(all.filter((r) => r.request_type === 'tier_change' && r.status === 'pending').map((r) => r.reference_id))

  const userIds = [...new Set([...rows.flatMap((s) => [s.created_by, s.repaid_by]), ...reqs.map((r) => r.approved_by)].filter((x): x is string => !!x))]
  const people = await fetchByKeys<{ id: string; name: string }, string>(userIds, (chunk) => supabase.from('users').select('id, name').in('id', chunk), 'source hub users').catch(() => [])
  const names = new Map(people.map((u) => [u.id, u.name]))
  const company = new Map(((companies ?? []) as Array<{ id: string; name: string; short_code: string | null }>).map((c) => [c.id, c]))
  const director = new Map(((directors ?? []) as Array<{ id: string; name: string; code: string | null }>).map((d) => [d.id, d]))
  const department = new Map(((departments ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))
  const owed = new Map(((outstandingRows ?? []) as Array<{ fund_source_id: string; outstanding: number | string }>).map((o) => [o.fund_source_id, Number(o.outstanding)]))
  const bank = new Map(((banks ?? []) as Array<{ id: string; bank_name: string; account_number: string }>).map((b) => [b.id, b]))
  const account = new Map(((accounts ?? []) as Array<{ code: string; name: string }>).map((a) => [a.code, a.name]))
  const pending = new Map(reqs.filter((r) => r.status === 'pending').map((r) => [r.reference_id, { id: r.id, submittedBy: r.submitted_by }]))
  const approved = new Map(reqs.filter((r) => r.status === 'approved').map((r) => [r.reference_id, r]))

  // Who it came from — free text first, as the list always read it (Item 4).
  const partyOf = (s: SourceRow) => {
    if (s.from_company_id) {
      const c = company.get(s.from_company_id)
      return c ? withCode(c.name, c.short_code) : '—'
    }
    if (s.from_department_id) return department.get(s.from_department_id) ?? '—'
    if (s.from_freetext_name) return s.from_freetext_name
    if (s.from_director_id) {
      const d = director.get(s.from_director_id)
      return d ? withCode(d.name, d.code) : '—'
    }
    return '—'
  }

  return rows.map((s) => {
    const b = s.bank_account_id ? bank.get(s.bank_account_id) : undefined
    const ok = approved.get(s.id)
    return {
      id: s.id,
      side: 'in',
      party: partyOf(s),
      type: s.source_type,
      typeLabel: SOURCE_TYPE_LABELS[s.source_type] ?? s.source_type,
      amount: Number(s.amount),
      outstanding: s.status === 'active' || s.status === 'matured' ? (owed.get(s.id) ?? Number(s.amount)) : null,
      rate: Number(s.cost_rate),
      status: s.status,
      overdue: null,
      date: s.effective_date,
      createdAt: s.created_at,
      createdBy: s.created_by ? (names.get(s.created_by) ?? null) : null,
      approvedAt: ok?.approved_at ?? null,
      approvedBy: ok?.approved_by ? (names.get(ok.approved_by) ?? null) : null,
      maturity: s.maturity_date,
      months: s.lock_in_months
        ? installmentsInAll(resolveFirstDueYM(s.repayment_start_month, s.effective_date), s.terms_effective_from ? s.terms_effective_from.slice(0, 7) : null, Number(s.lock_in_months))
        : null,
      compound: s.compound_interest === true,
      minPayInterest: s.min_pay_interest === true,
      fundingSource: null,
      notes: s.notes,
      bank: b ? { name: b.bank_name, number: b.account_number } : null,
      account: s.account_code ? { code: s.account_code, name: account.get(s.account_code) ?? s.account_code } : null,
      approval: s.status === 'pending_approval' ? (pending.get(s.id) ?? null) : null,
      decidable: false,
      cancelPending: (s.status === 'active' || s.status === 'matured') && cancelling.has(s.id),
      repaid: Math.max(0, Math.round((Number(s.amount) - (owed.get(s.id) ?? Number(s.amount))) * 100) / 100),
      repaidAt: s.repaid_at,
      repaidBy: s.repaid_by ? (names.get(s.repaid_by) ?? null) : null,
    }
  })
}
