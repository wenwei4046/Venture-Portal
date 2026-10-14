import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import { SOURCE_TYPE_LABELS, type FundRecord, type FundStatus } from '@/lib/fund-hub'

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
  maturity_date: string | null
  status: FundStatus
  notes: string | null
  compound_interest: boolean | null
  min_pay_interest: boolean | null
  bank_account_id: string | null
  account_code: string | null
  created_by: string | null
  created_at: string
}

export async function loadSourceHub(supabase: SupabaseClient): Promise<FundRecord[]> {
  const [{ data: sources, error }, { data: companies }, { data: directors }, { data: departments }, { data: outstandingRows }, { data: banks }, { data: accounts }, { data: requests }] = await Promise.all([
    supabase
      .from('fund_sources')
      .select('id, source_type, from_company_id, from_director_id, from_department_id, from_freetext_name, amount, cost_rate, lock_in_months, effective_date, maturity_date, status, notes, compound_interest, min_pay_interest, bank_account_id, account_code, created_by, created_at')
      .order('effective_date', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('directors').select('id, name, code'),
    // is_internal=false — the 'Venture Office' pseudo-dept is not a fund source.
    supabase.from('departments').select('id, name').eq('is_internal', false),
    supabase.from('fund_source_outstanding').select('fund_source_id, outstanding'),
    supabase.from('bank_accounts').select('id, bank_name, account_number'),
    supabase.from('chart_of_accounts').select('code, name'),
    // Who approved it is the approved request's; a pending one links to its queue entry (where this reader may see them).
    supabase.from('approval_requests').select('id, reference_id, status, approved_by, approved_at').eq('reference_table', 'fund_sources').eq('request_type', 'new_fund_source').in('status', ['pending', 'approved']),
  ])
  if (error) throw new Error('Unable to load the fund sources. Please try again.')
  const rows = (sources ?? []) as SourceRow[]
  const reqs = (requests ?? []) as Array<{ id: string; reference_id: string; status: string; approved_by: string | null; approved_at: string | null }>

  const userIds = [...new Set([...rows.map((s) => s.created_by), ...reqs.map((r) => r.approved_by)].filter((x): x is string => !!x))]
  const people = await fetchByKeys<{ id: string; name: string }, string>(userIds, (chunk) => supabase.from('users').select('id, name').in('id', chunk), 'source hub users').catch(() => [])
  const names = new Map(people.map((u) => [u.id, u.name]))
  const company = new Map(((companies ?? []) as Array<{ id: string; name: string; short_code: string | null }>).map((c) => [c.id, c]))
  const director = new Map(((directors ?? []) as Array<{ id: string; name: string; code: string | null }>).map((d) => [d.id, d]))
  const department = new Map(((departments ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]))
  const owed = new Map(((outstandingRows ?? []) as Array<{ fund_source_id: string; outstanding: number | string }>).map((o) => [o.fund_source_id, Number(o.outstanding)]))
  const bank = new Map(((banks ?? []) as Array<{ id: string; bank_name: string; account_number: string }>).map((b) => [b.id, b]))
  const account = new Map(((accounts ?? []) as Array<{ code: string; name: string }>).map((a) => [a.code, a.name]))
  const pending = new Map(reqs.filter((r) => r.status === 'pending').map((r) => [r.reference_id, r.id]))
  const approved = new Map(reqs.filter((r) => r.status === 'approved').map((r) => [r.reference_id, r]))

  // Who it came from — free text first, as the list always read it (Item 4).
  const partyOf = (s: SourceRow) => {
    if (s.from_company_id) {
      const c = company.get(s.from_company_id)
      return c ? (c.short_code ? `${c.name} (${c.short_code})` : c.name) : '—'
    }
    if (s.from_department_id) return department.get(s.from_department_id) ?? '—'
    if (s.from_freetext_name) return s.from_freetext_name
    if (s.from_director_id) {
      const d = director.get(s.from_director_id)
      return d ? (d.code ? `${d.name} (${d.code})` : d.name) : '—'
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
      months: s.lock_in_months ? Number(s.lock_in_months) : null,
      compound: s.compound_interest === true,
      minPayInterest: s.min_pay_interest === true,
      fundingSource: null,
      notes: s.notes,
      bank: b ? { name: b.bank_name, number: b.account_number } : null,
      account: s.account_code ? { code: s.account_code, name: account.get(s.account_code) ?? s.account_code } : null,
      approvalId: pending.get(s.id) ?? null,
      repaid: Math.max(0, Math.round((Number(s.amount) - (owed.get(s.id) ?? Number(s.amount))) * 100) / 100),
    }
  })
}
