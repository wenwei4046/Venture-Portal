import type { createClient } from '@/lib/supabase/server'
import { round2 } from '@/lib/payroll-funding'
import { topupSummary } from '@/lib/payroll-lifecycle'
import type { StatutoryPeriod } from '../_components/StatutorySection'

// What Payments › Payroll Requests reads (2026-10-16, lifted out of its page
// word for word so the Finance phone app reads the very same): the open
// requests, the banks, each request's department breakdown (required + the
// pool's balance) and what earlier funding vouchers already committed, and
// the last three completed periods' statutory vouchers.

type Client = Awaited<ReturnType<typeof createClient>>

export interface RequestRow {
  id: string
  amount: number
  status: string
  requested_at: string
  payroll_run_id: string | null
  period_month: string
  requested_by_name: string
  // Run-less requests are director salary fundings (mig 20260727100000).
  isDirector: boolean
  /** Unified Payroll (2026-09-27): the batch this request funds. */
  batchId: string | null
  batchLabel: string | null
}

interface BreakdownRpcRow {
  pool_key: string
  dept_name: string
  required_amount: number | string
  pool_balance: number | string
}

export interface BreakdownRow {
  pool_key: string
  dept_name: string
  required_amount: number
  pool_balance: number
}

export interface FundingInfo {
  committedTotal: number
  committedByPool: Record<string, number>
  pvs: { id: string; voucher_no: string | null; amount: number; status: string }[]
}

export interface PayrollBank {
  id: string
  bank_name: string
  current_balance: number
  gl_account_code: string
}

export interface PayrollRequestsRead {
  rows: RequestRow[]
  banks: PayrollBank[]
  breakdownByRequest: Map<string, BreakdownRow[]>
  fundingByRequest: Map<string, FundingInfo>
  statutoryPeriods: StatutoryPeriod[]
}

/** "Batch #2 · HR 5" — which people a request funds (department totals only). */
function batchLabel(raw: unknown): string | null {
  const b = (Array.isArray(raw) ? raw[0] : raw) as
    | { batch_no: number; people: number; topups: number; second_payrolls?: number | null; legacy: boolean; departments: Array<{ name: string; people: number }> | null }
    | null
    | undefined
  if (!b) return null
  if (b.legacy) return 'Whole month'
  const who = (b.departments ?? []).map(d => `${d.name} ${d.people}`).join(' · ')
  return `Batch #${b.batch_no}${who ? ` · ${who}` : ''}${b.topups ? ` · ${topupSummary(b.topups, b.second_payrolls ?? 0)}` : ''}`
}

export async function readPayrollRequests(supabase: Client): Promise<PayrollRequestsRead> {
  const [{ data: requests }, { data: banks }] = await Promise.all([
    supabase
      .from('payroll_payment_requests')
      .select(`
        id, amount, status, requested_at, payroll_run_id, period_month, batch_id,
        payroll_runs (period_month),
        payroll_batches (batch_no, people, topups, second_payrolls, legacy, departments),
        users:requested_by (name)
      `)
      .in('status', ['submitted', 'pv_generated'])
      .order('requested_at', { ascending: false }),
    supabase
      .from('bank_accounts')
      .select('id, bank_name, current_balance, gl_account_code')
      .eq('status', 'active')
      .order('is_primary', { ascending: false }),
  ])

  const rows: RequestRow[] = (requests ?? []).map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = (r.payroll_runs as any) ?? {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const submitter = (r.users as any) ?? {}
    return {
      id: r.id,
      amount: Number(r.amount),
      status: r.status,
      requested_at: r.requested_at,
      payroll_run_id: r.payroll_run_id,
      period_month: run.period_month ?? r.period_month ?? '',
      requested_by_name: submitter.name ?? 'HR',
      isDirector: r.payroll_run_id == null,
      batchId: r.batch_id ?? null,
      batchLabel: batchLabel((r as { payroll_batches?: unknown }).payroll_batches),
    }
  })

  const bankOptions = (banks ?? []).map(b => ({
    id: b.id,
    bank_name: b.bank_name,
    current_balance: Number(b.current_balance ?? 0),
    gl_account_code: (b.gl_account_code as string | null) ?? '',
  }))

  // Per-request: dept breakdown (required + current pool balance) + what's already
  // been funded across prior non-voided funding PVs (partial-funding support).
  const [breakdownResults, fundingResults] = await Promise.all([
    Promise.all(
      rows.map(r =>
        supabase
          .rpc('get_payroll_breakdown_by_pool', { p_request_id: r.id })
          .then(res => ({
            id: r.id,
            rows: ((res.data ?? []) as unknown as BreakdownRpcRow[]).map(b => ({
              pool_key: b.pool_key,
              dept_name: b.dept_name,
              required_amount: Number(b.required_amount ?? 0),
              pool_balance: Number(b.pool_balance ?? 0),
            })),
          })),
      ),
    ),
    Promise.all(
      rows.map(r =>
        supabase
          .from('payment_vouchers')
          .select('id, voucher_no, amount, status, payment_voucher_sources(pool, amount)')
          .eq('reference_type', 'payroll_payment_request')
          .eq('reference_id', r.id)
          .neq('status', 'voided')
          .then(res => {
            const pvs = res.data ?? []
            const committedByPool: Record<string, number> = {}
            let committedTotal = 0
            for (const pv of pvs) {
              committedTotal += Number(pv.amount ?? 0)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              for (const src of ((pv.payment_voucher_sources as any[]) ?? [])) {
                committedByPool[src.pool] = (committedByPool[src.pool] ?? 0) + Number(src.amount ?? 0)
              }
            }
            const info: FundingInfo = {
              committedTotal: round2(committedTotal),
              committedByPool,
              pvs: pvs.map(p => ({
                id: p.id,
                voucher_no: p.voucher_no,
                amount: Number(p.amount ?? 0),
                status: p.status,
              })),
            }
            return { id: r.id, info }
          }),
      ),
    ),
  ])
  const breakdownByRequest = new Map(breakdownResults.map(r => [r.id, r.rows]))
  const fundingByRequest = new Map(fundingResults.map(r => [r.id, r.info]))

  // ── Statutory payments (mig 20260720) — recent COMPLETED payroll periods.
  // One-click KWSP/PERKESO/LHDN vouchers, split per staff dept pool.
  const { data: completedReqs } = await supabase
    .from('payroll_payment_requests')
    .select('payroll_run_id, payroll_runs (period_month)')
    .eq('status', 'completed')
    .order('requested_at', { ascending: false })
    .limit(3)
  // A month funded in several batches has several completed requests on one run.
  const statutoryRuns = [...new Map((completedReqs ?? []).map(r => [r.payroll_run_id as string, {
    runId: r.payroll_run_id as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    period: ((r.payroll_runs as any)?.period_month ?? '') as string,
  }])).values()].filter(r => r.period)
  const { data: statutoryPvsRaw } = statutoryRuns.length
    ? await supabase
        .from('payment_vouchers')
        .select('id, voucher_no, payee_name, amount, status, payment_date, reference_id')
        .eq('reference_type', 'payroll_statutory')
        .in('reference_id', statutoryRuns.map(r => r.runId))
        .neq('status', 'voided')
    : { data: [] }
  const statutoryPeriods: StatutoryPeriod[] = statutoryRuns.map(r => ({
    period_month: r.period,
    pvs: (statutoryPvsRaw ?? [])
      .filter(v => v.reference_id === r.runId)
      .map(v => ({
        id: v.id as string,
        voucher_no: v.voucher_no,
        payee_name: v.payee_name,
        amount: Number(v.amount ?? 0),
        status: v.status as string,
        payment_date: (v.payment_date ?? null) as string | null,
      })),
  }))

  return { rows, banks: bankOptions, breakdownByRequest, fundingByRequest, statutoryPeriods }
}
