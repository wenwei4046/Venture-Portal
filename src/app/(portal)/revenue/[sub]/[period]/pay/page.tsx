import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { payTotals } from '@/lib/revenue-pay'
import LedgerRow from '@/components/LedgerRow'
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
  await requirePermission('revenue')
  const { sub, period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub)
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
          <p className="font-serif italic text-graphite text-base mt-3">
            {synced
              ? 'Synced to payroll — these are the figures payroll holds.'
              : 'A preview from the computed run. Payroll is written when the run is synced.'}
          </p>
        </div>
        <Link
          href={revenuePath(subDept.slug, period)}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
        >
          ← The month
        </Link>
      </div>

      {board.rows.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif text-2xl text-ink mb-3">
            {board.runStatus ? 'The run paid nobody.' : 'Nothing has been computed yet.'}
          </p>
          <p className="font-serif italic text-muted text-sm max-w-lg mx-auto mb-8">
            {board.runStatus
              ? 'Every order was either unmatched or held by the deposit gate, so there is no salary to work out.'
              : 'Compute the month’s commission first — this page turns the result into salaries, statutory contributions and net pay.'}
          </p>
          <Link
            href={revenuePath(subDept.slug, period)}
            className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors"
          >
            Go to the run
          </Link>
        </div>
      ) : (
        <>
          <section className="mb-10">
            <div className="grid gap-4 sm:grid-cols-4">
              <Tile label="Net to employees" value={formatMoney(totals.net)} big />
              <Tile label="Gross commission" value={formatMoney(totals.commission)} />
              <Tile
                label="To EPF / SOCSO / EIS"
                value={formatMoney(totals.employerContributions + totals.employeeContributions)}
                note={`${formatMoney(totals.employerContributions)} employer · ${formatMoney(totals.employeeContributions)} employee`}
              />
              <Tile label="PCB / withholding" value={formatMoney(totals.tax)} />
            </div>
          </section>

          {disagreeing.length > 0 || shortfalls.length > 0 ? (
            <section className="mb-10">
              <div className="sect-head">
                <h2>Before this month can be paid</h2>
                <span className="rule" aria-hidden />
              </div>
              <ul className="space-y-2 font-serif text-sm text-graphite">
                {shortfalls.length > 0 ? (
                  <li>
                    <strong className="text-danger">{shortfalls.length} salesperson(s)</strong> earned less
                    commission than their basic and the employer&apos;s contributions cost. The balance is
                    negative — settle it before payroll goes out rather than paying a negative line.
                  </li>
                ) : null}
                {disagreeing.length > 0 ? (
                  <li>
                    <strong className="text-danger">{disagreeing.length} payroll row(s)</strong> no longer
                    match this run — either the figures were keyed in payroll, or the run was recomputed
                    after it was synced. Re-sync the run, or key the difference as a reviewed adjustment.
                  </li>
                ) : null}
              </ul>
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
                          className="font-serif text-[15px] text-ink hover:text-accent"
                        >
                          {r.employeeName}
                        </Link>
                        <div className="font-mono text-[10.5px] text-muted mt-0.5">
                          {r.employeeCode ?? '—'}
                          {r.pay.proratedBasic > 0 ? ` · basic ${formatMoney(r.pay.proratedBasic)}` : ''}
                          {r.pay.ratio < 1 ? ` · ${r.input.daysWorked}/${r.input.daysInMonth} days` : ''}
                        </div>
                        {r.commissionElsewhere > 0 ? (
                          <div className="font-mono text-[10.5px] text-accent mt-0.5">
                            INCLUDES {formatMoney(r.commissionElsewhere)} FROM ANOTHER PROGRAMME
                          </div>
                        ) : null}
                        {r.differsFromPayroll ? (
                          <div className="font-mono text-[10.5px] text-danger mt-0.5">
                            PAYROLL HOLDS {formatMoney(r.payrollNet ?? 0)}
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
                      <td className={r.pay.shortfall > 0 ? 'num neg font-semibold' : 'num font-semibold'}>
                        {formatMoney(r.pay.net)}
                      </td>
                    </LedgerRow>
                  ))}
                  <tr>
                    <td>
                      <strong className="font-serif text-ink text-[15px]">{board.rows.length} people</strong>
                    </td>
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num m-hide" />
                    <td className="num font-semibold">{formatMoney(totals.commission)}</td>
                    <td className="num m-hide">{formatMoney(totals.employerContributions)}</td>
                    <td className="num m-hide">{formatMoney(totals.employeeContributions)}</td>
                    <td className="num m-hide">{formatMoney(totals.tax)}</td>
                    <td className="num font-semibold">{formatMoney(totals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
              Gross commission is the whole month&apos;s — every programme that has applied a run, plus any
              reviewed payroll adjustment. The employer&apos;s EPF, SOCSO and EIS are funded from it, which is
              why gross pay is lower than gross commission. Open a name for the payslip and the rules behind
              each figure.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function Tile({
  label: text,
  value,
  note,
  big,
}: {
  label: string
  value: string
  note?: string
  big?: boolean
}) {
  return (
    <div className="border border-hairline rounded-card bg-surface px-4 py-3">
      <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">{text}</div>
      <div className={['statement-amount', big ? '' : 'compact', 'text-num-ink'].join(' ')}>{value}</div>
      {note ? <div className="font-serif italic text-muted text-xs mt-1.5">{note}</div> : null}
    </div>
  )
}
