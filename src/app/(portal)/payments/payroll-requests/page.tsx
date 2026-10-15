import Link from 'next/link'
import dayjs from 'dayjs'
import { officeTime, officeToday } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requirePayrollPayouts, requirePage } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { round2 } from '@/lib/payroll-funding'
import GeneratePvForm, { type PoolBreakdownRow } from './_components/GeneratePvForm'
import StatutorySection from './_components/StatutorySection'
import SendBackButton from './_components/SendBackButton'
import { readPayrollRequests } from './_lib/payroll-read'

export default async function PayrollRequestsPage() {
  await requirePage('/payments/payroll-requests')
  // What each department's payroll comes to, and a department can be one
  // person: Treasury WITH Payroll payouts (2026-10-02).
  await requirePayrollPayouts('treasury')
  const supabase = await createClient()

  // Every read, as the Finance phone app reads them (`_lib/payroll-read`).
  const { rows, banks: bankOptions, breakdownByRequest, fundingByRequest, statutoryPeriods } = await readPayrollRequests(supabase)

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
                        {r.batchLabel ? (
                          <span className="ml-2 font-mono text-[10px] text-graphite uppercase tracking-wider">
                            {r.batchLabel}
                          </span>
                        ) : null}
                      </div>
                      <div className="font-serif italic text-graphite text-sm mt-0.5">
                        Requested by {r.requested_by_name} ·{' '}
                        {officeTime(r.requested_at).format('D MMM HH:mm')}
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
                      {/* 打回 HR 重做 — staff runs only (director requests are
                          run-less), and only while nothing has been funded. */}
                      {!r.isDirector && committed <= 0.005 && r.period_month ? (
                        <div className="mt-2">
                          <SendBackButton
                            period={r.period_month}
                            batchId={r.batchId}
                            periodLabel={`${dayjs(r.period_month).format('MMM YYYY')}${r.batchLabel ? ` ${r.batchLabel}` : ''}`}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <GeneratePvForm
                    requestId={r.id}
                    amount={r.amount}
                    committedTotal={committed}
                    banks={bankOptions}
                    breakdown={breakdown}
                    defaultDate={officeToday()}
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
                        {r.batchLabel ? (
                          <span className="ml-2 font-mono text-[10px] text-graphite uppercase tracking-wider">
                            {r.batchLabel}
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
