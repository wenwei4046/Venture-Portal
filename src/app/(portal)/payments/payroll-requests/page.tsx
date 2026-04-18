import Link from 'next/link'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import GeneratePvForm, { type PoolBreakdownRow } from './_components/GeneratePvForm'

interface RequestRow {
  id: string
  amount: number
  status: string
  requested_at: string
  payroll_run_id: string
  period_month: string
  requested_by_name: string
  pv_id: string | null
  pv_voucher_no: string | null
  pv_status: string | null
}

interface BreakdownRpcRow {
  pool_key: string
  dept_name: string
  required_amount: number | string
  pool_balance: number | string
}

export default async function PayrollRequestsPage() {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  const [
    { data: requests },
    { data: banks },
  ] = await Promise.all([
    supabase
      .from('payroll_payment_requests')
      .select(`
        id, amount, status, requested_at, payroll_run_id, pv_id,
        payroll_runs (period_month),
        users:requested_by (name),
        payment_vouchers:pv_id (voucher_no, status)
      `)
      .in('status', ['submitted', 'pv_generated'])
      .order('requested_at', { ascending: false }),
    supabase
      .from('bank_accounts')
      .select('id, bank_name, current_balance')
      .eq('status', 'active')
      .order('is_primary', { ascending: false }),
  ])

  const rows: RequestRow[] = (requests ?? []).map(r => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = (r.payroll_runs as any) ?? {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const submitter = (r.users as any) ?? {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pv = (r.payment_vouchers as any) ?? null
    return {
      id: r.id,
      amount: Number(r.amount),
      status: r.status,
      requested_at: r.requested_at,
      payroll_run_id: r.payroll_run_id,
      period_month: run.period_month ?? '',
      requested_by_name: submitter.name ?? 'HR',
      pv_id: r.pv_id,
      pv_voucher_no: pv?.voucher_no ?? null,
      pv_status: pv?.status ?? null,
    }
  })

  const submittedRows = rows.filter(r => r.status === 'submitted')
  const pvGeneratedRows = rows.filter(r => r.status === 'pv_generated')

  const bankOptions = (banks ?? []).map(b => ({
    id: b.id,
    bank_name: b.bank_name,
    current_balance: Number(b.current_balance ?? 0),
  }))

  // Task 3: fetch per-request dept breakdown (HR / Finance / Director Office /
  // Marketing) so the Generate PV form can show who owes what and how much
  // each Department Pool has available. Parallelised across submitted rows.
  const breakdownResults = await Promise.all(
    submittedRows.map(r =>
      supabase
        .rpc('get_payroll_breakdown_by_pool', { p_request_id: r.id })
        .then(res => ({
          id: r.id,
          rows: ((res.data ?? []) as unknown as BreakdownRpcRow[]).map(
            (b): PoolBreakdownRow => ({
              pool_key: b.pool_key,
              dept_name: b.dept_name,
              required_amount: Number(b.required_amount ?? 0),
              pool_balance: Number(b.pool_balance ?? 0),
            }),
          ),
        })),
    ),
  )
  const breakdownByRequest = new Map(breakdownResults.map(r => [r.id, r.rows]))

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/payments"
          className="text-sm text-muted hover:text-accent font-sans transition-colors"
        >
          ← Back to Payments
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-3">Payroll Requests</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          HR has requested payroll payment. Allocate the total across each
          Department Pool, pick the source bank, then submit to Principal.
          <em> Bank and pool balances are checked before the PV is created.</em>
        </p>
      </div>

      {/* ── Submitted (awaiting Finance action) ───────────────────────────── */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-2xl text-ink">
            Awaiting your action
          </h2>
          <span className="font-mono text-xs text-muted">
            {submittedRows.length} {submittedRows.length === 1 ? 'request' : 'requests'}
          </span>
        </div>

        {submittedRows.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-8 text-center">
            <p className="font-serif italic text-ledger text-base">All caught up.</p>
            <p className="font-mono text-xs text-muted mt-1">
              No pending payroll requests from HR.
            </p>
          </div>
        ) : (
          <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {submittedRows.map(r => (
              <div key={r.id} className="px-5 py-5">
                <div className="flex items-baseline justify-between mb-3 gap-4">
                  <div>
                    <div className="font-serif text-lg text-ink">
                      {r.period_month
                        ? dayjs(r.period_month).format('MMMM YYYY')
                        : 'Unknown period'}
                    </div>
                    <div className="font-serif italic text-graphite text-sm mt-0.5">
                      Requested by {r.requested_by_name} ·{' '}
                      {dayjs(r.requested_at).format('D MMM HH:mm')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular font-semibold text-ink text-lg">
                      RM {r.amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="font-mono text-xs text-muted mt-0.5">
                      locked to payroll total
                    </div>
                  </div>
                </div>
                <GeneratePvForm
                  requestId={r.id}
                  amount={r.amount}
                  banks={bankOptions}
                  breakdown={breakdownByRequest.get(r.id) ?? []}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── PV generated (awaiting Principal) ─────────────────────────────── */}
      {pvGeneratedRows.length > 0 ? (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-2xl text-ink">Awaiting Principal</h2>
            <span className="font-mono text-xs text-muted">
              {pvGeneratedRows.length}{' '}
              {pvGeneratedRows.length === 1 ? 'request' : 'requests'}
            </span>
          </div>
          <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
            {pvGeneratedRows.map(r => (
              <div
                key={r.id}
                className="flex items-baseline justify-between px-5 py-4 gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-md text-ink truncate">
                    {r.period_month ? dayjs(r.period_month).format('MMMM YYYY') : '—'}
                    {' · '}
                    <span className="font-mono text-xs text-muted">
                      {r.pv_voucher_no ?? 'PV pending'}
                    </span>
                  </div>
                  <div className="font-serif italic text-graphite text-sm truncate">
                    PV generated — awaiting Principal approval
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono tabular font-medium text-ink text-sm">
                    {formatMoney(r.amount)}
                  </div>
                  {r.pv_id ? (
                    <Link
                      href={`/payments/${r.pv_id}`}
                      className="font-serif italic text-xs text-accent hover:text-accent-hover"
                    >
                      View voucher →
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
