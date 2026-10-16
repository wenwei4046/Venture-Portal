import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { payTotals } from '@/lib/revenue-pay'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { requireSubDepartment } from '../../../_lib/sub-departments'
import { loadPayBoard } from '../../../_lib/pay-preview'

interface PageProps {
  params: Promise<{ sub: string; period: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * What the month PAYS — one line per salesperson, commission through to net.
 *
 * The run says what was earned. This says what is paid, which is not the same
 * number and never was: a commissioned salesperson's employer EPF, SOCSO and
 * EIS come OUT of their commission, their own contributions and their tax come
 * out of what is left, and a basic — where one is set — is carved from the
 * same pot rather than added to it. HR had to wait for payroll to be generated
 * before seeing any of that; there is nothing to wait for, so here it is.
 *
 * Nothing on this page writes. Payroll is still written by syncing the run.
 */
export default async function MonthPayPage({ params }: PageProps) {
  await requirePage('/revenue/[sub]/[period]/pay')
  await requirePermission('revenue')
  const { sub, period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub, 'comm_cal')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const board = await loadPayBoard(supabase, subDept.id, period)

  const totals = payTotals(board.rows)
  const synced = board.runStatus === 'applied' || board.runStatus === 'locked'
  const disagreeing = board.rows.filter(r => r.differsFromPayroll)
  const shortfalls = board.rows.filter(r => r.pay.shortfall > 0)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">What this month pays</h1>
          {/* The state only (2026-10-12): preview or in payroll. */}
          <p className="text-sm mt-3">
            {synced ? 'Synced to payroll' : 'A preview from the computed run'}
          </p>
        </div>
        <Link
          href={revenuePath(subDept.slug, period)}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
        >
          ← The month
        </Link>
      </div>

      {board.rows.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-md font-bold mb-2">
            {board.runStatus ? 'The run paid nobody.' : 'Nothing has been computed yet.'}
          </p>
          <p className="text-sm max-w-lg mx-auto mb-5">
            {board.runStatus
              ? 'Every order was either unmatched or held by the deposit gate, so there is no salary to work out.'
              : 'Compute the month’s commission first — this page turns the result into salaries, statutory contributions and net pay.'}
          </p>
          <Link
            href={revenuePath(subDept.slug, period)}
            className="inline-block bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
          >
            Go to the run
          </Link>
        </div>
      ) : (
        <>
          {/* What reaches the bank is the figure the board is opened for — the
              sheet's one walnut card; the rest is what it is carved from. */}
          <StatCards label={`What ${label(period)} pays`}>
            <StatCard label="Net to employees" value={formatMoney(totals.net)} icon="bank" tone="primary" />
            <StatCard label="Gross commission" value={formatMoney(totals.commission)} icon="coin" />
            <StatCard
              label="To EPF / SOCSO / EIS"
              value={formatMoney(totals.employerContributions + totals.employeeContributions)}
              icon="shield"
              note={`${formatMoney(totals.employerContributions)} employer · ${formatMoney(totals.employeeContributions)} employee`}
            />
            <StatCard label="PCB / withholding" value={formatMoney(totals.tax)} icon="receipt" />
          </StatCards>

          {disagreeing.length > 0 || shortfalls.length > 0 ? (
            <section className="mb-8">
              <div className="sheet-warning">
                <h2 className="text-sm font-bold mb-1.5">Before this month can be paid</h2>
                <ul className="space-y-1.5 list-disc pl-5">
                  {shortfalls.length > 0 ? (
                    <li>
                      <strong>{shortfalls.length} salesperson(s)</strong> earned less
                      commission than their basic and the employer&apos;s contributions cost. The balance is
                      negative — settle it before payroll goes out rather than paying a negative line.
                    </li>
                  ) : null}
                  {disagreeing.length > 0 ? (
                    <li>
                      <strong>{disagreeing.length} payroll row(s)</strong> no longer
                      match this run — either the figures were keyed in payroll, or the run was recomputed
                      after it was synced. Re-sync the run, or key the difference as a reviewed adjustment.
                    </li>
                  ) : null}
                </ul>
              </div>
            </section>
          ) : null}

          <section className="mb-10">
            <div className="sect-head">
              <h2>Salary, person by person</h2>
              <span className="rule" aria-hidden />
              <span className="count">{board.rows.length} PEOPLE</span>
            </div>
            <div className="overflow-x-auto">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Salesperson</th>
                    <th className="right m-hide">Own sales</th>
                    <th className="right m-hide">Product</th>
                    <th className="right m-hide">KPI</th>
                    <th className="right m-hide">Open Bill</th>
                    <th className="right m-hide">Override</th>
                    <th className="right m-hide">Incentive</th>
                    <th className="right">Gross commission</th>
                    <th className="right m-hide">Employer stat.</th>
                    <th className="right m-hide">Employee stat.</th>
                    <th className="right m-hide">Tax</th>
                    <th className="right">Net pay</th>
                    <th className="lt-toggle" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map(r => (
                    <LedgerRow key={r.staffId}>
                      <td>
                        <Link
                          href={revenuePath(subDept.slug, period, 'pay', r.staffId)}
                          className="font-medium"
                        >
                          {r.employeeName}
                        </Link>
                        <div className="text-[11px] mt-0.5">
                          {r.employeeCode ?? '—'}
                          {r.pay.proratedBasic > 0 ? ` · basic ${formatMoney(r.pay.proratedBasic)}` : ''}
                          {r.pay.ratio < 1 ? ` · ${r.input.daysWorked}/${r.input.daysInMonth} days` : ''}
                        </div>
                        {/* Two flags a row can carry, each a word on a wash: grey
                            for a fact to know, red for a figure payroll disputes. */}
                        {r.commissionElsewhere > 0 ? (
                          <div className="mt-1">
                            <span className="chip info">
                              <span className="dot" />
                              INCLUDES {formatMoney(r.commissionElsewhere)} FROM ANOTHER PROGRAMME
                            </span>
                          </div>
                        ) : null}
                        {r.pay.payLineEarnings > 0 || r.pay.payLineDeductions > 0 ? (
                          <div className="mt-1">
                            <span className="chip info">
                              <span className="dot" />
                              PAY LINES{r.pay.payLineEarnings > 0 ? ` +${formatMoney(r.pay.payLineEarnings)}` : ''}
                              {r.pay.payLineDeductions > 0 ? ` −${formatMoney(r.pay.payLineDeductions)}` : ''}
                            </span>
                          </div>
                        ) : null}
                        {r.differsFromPayroll ? (
                          <div className="mt-1">
                            <span className="chip danger">
                              <span className="dot" />
                              PAYROLL HOLDS {formatMoney(r.payrollNet ?? 0)}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="num m-hide" data-label="Own sales">
                        {r.components ? formatMoney(r.components.productRevenue) : '—'}
                      </td>
                      <td className="num m-hide" data-label="Product">
                        {r.components ? formatMoney(r.components.productCommission) : '—'}
                      </td>
                      <td className="num m-hide" data-label="KPI">
                        {r.components ? formatMoney(r.components.kpiCommission) : '—'}
                      </td>
                      <td className="num m-hide" data-label="Open Bill">
                        {r.components ? formatMoney(r.components.openBillBonus) : '—'}
                      </td>
                      <td className="num m-hide" data-label="Override">
                        {r.components ? formatMoney(r.components.overrideCommission) : '—'}
                      </td>
                      <td className="num m-hide" data-label="Incentive">
                        {r.components
                          ? formatMoney(r.components.marginIncentive + r.components.groupIncentive)
                          : '—'}
                      </td>
                      <td className="num">{formatMoney(r.commission)}</td>
                      <td className="num m-hide" data-label="Employer statutory">
                        {r.pay.employerContributions === 0 ? '—' : formatMoney(r.pay.employerContributions)}
                      </td>
                      <td className="num m-hide" data-label="Employee statutory">
                        {r.pay.employeeContributions === 0 ? '—' : formatMoney(r.pay.employeeContributions)}
                      </td>
                      <td className="num m-hide" data-label="Tax">
                        {r.pay.pcb + r.pay.withholdingTax === 0
                          ? '—'
                          : formatMoney(r.pay.pcb + r.pay.withholdingTax)}
                      </td>
                      <td className={r.pay.shortfall > 0 ? 'num neg font-bold' : 'num font-bold'}>
                        {formatMoney(r.pay.net)}
                      </td>
                    </LedgerRow>
                  ))}
                </tbody>
                {/* The board's totals — the peach band. The chevron cell keeps
                    the band on the same grid as the rows on a phone. */}
                <tfoot>
                  <tr>
                    <td>{board.rows.length} people</td>
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num">{formatMoney(totals.commission)}</td>
                    <td className="num m-hide">{formatMoney(totals.employerContributions)}</td>
                    <td className="num m-hide">{formatMoney(totals.employeeContributions)}</td>
                    <td className="num m-hide">{formatMoney(totals.tax)}</td>
                    <td className="num">{formatMoney(totals.net)}</td>
                    <td className="lt-toggle" aria-hidden />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
