import Link from 'next/link'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { round2 } from '@/lib/payroll-funding'
import GeneratePvForm, { type PoolBreakdownRow } from './_components/GeneratePvForm'
import StatutorySection, { type StatutoryPeriod } from './_components/StatutorySection'

interface RequestRow {
  id: string
  amount: number
  status: string
  requested_at: string
  payroll_run_id: string | null
  period_month: string
  requested_by_name: string
  // Run-less requests are director salary fundings (mig 20260727100000).
  isDirector: boolean
}

interface BreakdownRpcRow {
  pool_key: string
  dept_name: string
  required_amount: number | string
  pool_balance: number | string
}

interface FundingInfo {
  committedTotal: number
  committedByPool: Record<string, number>
  pvs: { id: string; voucher_no: string | null; amount: number; status: string }[]
}

export default async function PayrollRequestsPage() {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const [{ data: requests }, { data: banks }] = await Promise.all([
    supabase
      .from('payroll_payment_requests')
      .select(`
        id, amount, status, requested_at, payroll_run_id, period_month,
        payroll_runs (period_month),
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
    }
  })

  const bankOptions = (banks ?? []).map(b => ({
    id: b.id,
    bank_name: b.bank_name,
    current_balance: Number(b.current_balance ?? 0),
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
  const statutoryRuns = (completedReqs ?? []).map(r => ({
    runId: r.payroll_run_id as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    period: ((r.payroll_runs as any)?.period_month ?? '') as string,
  })).filter(r => r.period)
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

  // A request is still "fundable" while its committed total is below the request
  // total; otherwise it's fully committed and just awaiting Principal's approval.
  const fundingRows = rows.filter(
    r => round2(r.amount - (fundingByRequest.get(r.id)?.committedTotal ?? 0)) > 0.005,
  )
  const awaitingRows = rows.filter(
    r => round2(r.amount - (fundingByRequest.get(r.id)?.committedTotal ?? 0)) <= 0.005,
  )

  return (
    <div>
      <Link
        href="/payments"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Payments
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · PAYROLL REQUESTS
          </div>
          <h1 className="page-title">Payroll Requests</h1>
        </div>
      </div>

      {/* ── Awaiting Finance action (fund some/all) ───────────────────────── */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-2xl text-ink">Awaiting your action</h2>
          <span className="font-mono text-xs text-muted">
            {fundingRows.length} {fundingRows.length === 1 ? 'request' : 'requests'}
          </span>
        </div>

        {fundingRows.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-8 text-center">
            <p className="font-serif italic text-ledger text-base">All caught up.</p>
            <p className="font-mono text-xs text-muted mt-1">
              No payroll requests waiting to be funded.
            </p>
          </div>
        ) : (
          <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {fundingRows.map(r => {
              const funding = fundingByRequest.get(r.id)
              const committed = funding?.committedTotal ?? 0
              const remaining = round2(r.amount - committed)
              const breakdown: PoolBreakdownRow[] = (breakdownByRequest.get(r.id) ?? []).map(b => ({
                ...b,
                committed: round2(funding?.committedByPool[b.pool_key] ?? 0),
              }))
              return (
                <div key={r.id} className="px-5 py-5">
                  <div className="flex items-baseline justify-between mb-3 gap-4">
                    <div>
                      <div className="font-serif text-lg text-ink">
                        {r.period_month
                          ? dayjs(r.period_month).format('MMMM YYYY')
                          : 'Unknown period'}
                        {r.isDirector ? (
                          <span className="ml-2 font-mono text-[10px] text-graphite uppercase tracking-wider">
                            Director salary
                          </span>
                        ) : null}
                      </div>
                      <div className="font-serif italic text-graphite text-sm mt-0.5">
                        Requested by {r.requested_by_name} ·{' '}
                        {dayjs(r.requested_at).format('D MMM HH:mm')}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular font-semibold text-ink text-lg">
                        RM {remaining.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="font-mono text-xs text-muted mt-0.5">
                        {committed > 0.005
                          ? `still to fund · ${formatMoney(committed)} of ${formatMoney(r.amount)} done`
                          : 'to fund'}
                      </div>
                    </div>
                  </div>
                  <GeneratePvForm
                    requestId={r.id}
                    amount={r.amount}
                    committedTotal={committed}
                    banks={bankOptions}
                    breakdown={breakdown}
                    defaultDate={dayjs().format('YYYY-MM-DD')}
                  />
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Fully funded — awaiting Principal approval ────────────────────── */}
      {awaitingRows.length > 0 ? (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-2xl text-ink">Awaiting Principal</h2>
            <span className="font-mono text-xs text-muted">
              {awaitingRows.length} {awaitingRows.length === 1 ? 'request' : 'requests'}
            </span>
          </div>
          <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {awaitingRows.map(r => {
              const funding = fundingByRequest.get(r.id)
              const pending = (funding?.pvs ?? []).filter(p => p.status === 'pending_approval')
              return (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-serif text-md text-ink truncate">
                        {r.period_month ? dayjs(r.period_month).format('MMMM YYYY') : '—'}
                        {r.isDirector ? (
                          <span className="ml-2 font-mono text-[10px] text-graphite uppercase tracking-wider">
                            Director salary
                          </span>
                        ) : null}
                      </div>
                      <div className="font-serif italic text-graphite text-sm truncate">
                        Fully funded — {(funding?.pvs.length ?? 0)}{' '}
                        {(funding?.pvs.length ?? 0) === 1 ? 'voucher' : 'vouchers'} awaiting Principal
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular font-medium text-ink text-sm">
                        {formatMoney(r.amount)}
                      </div>
                    </div>
                  </div>
                  {pending.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {pending.map(p => (
                        <Link
                          key={p.id}
                          href={`/payments/${p.id}`}
                          className="font-mono text-xs text-accent hover:text-accent-hover"
                        >
                          {p.voucher_no ?? 'PV'} · {formatMoney(p.amount)} →
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* ── Statutory payments — read-only for Finance (HR generates/dates them) ─── */}
      <StatutorySection periods={statutoryPeriods} />
    </div>
  )
}
