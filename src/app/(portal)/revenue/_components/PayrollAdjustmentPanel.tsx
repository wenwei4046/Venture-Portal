import LedgerRow from '@/components/LedgerRow'
import { formatMoney } from '@/lib/utils'
import type { RevenuePayrollAdjustmentRead } from '../_lib/payroll-adjustments'

function adjustmentText(amount: number) {
  return `${amount > 0 ? '+ ' : amount < 0 ? '− ' : ''}${formatMoney(Math.abs(amount))}`
}

function payrollState(status: string) {
  return status === 'paid' ? 'Paid payroll' : status === 'submitted' ? 'Submitted payroll' : 'Draft payroll'
}

/**
 * The payroll's state as a word on a wash: green once it is paid, grey
 * (read-only) while it is submitted, amber while it is still a draft.
 */
function PayrollStateChip({ status }: { status: string }) {
  const tone = status === 'paid' ? 'ledger' : status === 'submitted' ? 'info' : 'alert'
  return (
    <span className={`chip ${tone}`}>
      <span className="dot" />
      {payrollState(status)}
    </span>
  )
}

export default function PayrollAdjustmentPanel({
  read, periodLabel, staffNames, statement = false, runSynced,
}: {
  read: RevenuePayrollAdjustmentRead
  periodLabel: string
  staffNames: ReadonlyMap<string, string>
  statement?: boolean
  runSynced: boolean
}) {
  if (!read.unavailable && !read.rows.length) return null
  return (
    <section className="mb-10" aria-label="Revenue monthly payroll adjustments">
      <div className="sect-head">
        <h2>Gross commission in payroll</h2>
        <span className="rule" aria-hidden />
        <span className="count">{periodLabel.toUpperCase()}</span>
      </div>
      {read.unavailable ? <p className="text-sm text-danger" role="status">
        Payroll adjustments are currently unavailable. The source commission calculation remains visible above.
      </p> : <>
        <p className="text-sm mb-4 max-w-3xl">
          These are each person&apos;s monthly totals across all Revenue sub-departments. The payroll adjustment applies once to that monthly total.
          {!runSynced ? ' This sub-department run is not currently synced; the payroll figures reflect the last saved payroll.' : ''}
        </p>
        {statement ? read.rows.map(row => <div key={row.staffId}>
          <div className="overflow-x-auto">
            <table className="ledger-table" aria-label="Monthly gross commission reconciliation">
              <tbody>
                <tr><th scope="row">Synced commission · all Revenue</th><td className="num">{row.syncedAmount === null ? 'Not recorded' : formatMoney(row.syncedAmount)}</td></tr>
                <tr><th scope="row">Payroll adjustment (+/−)</th><td className="num"><span className={row.adjustmentAmount < 0 ? 'neg' : ''}>{adjustmentText(row.adjustmentAmount)}</span></td></tr>
              </tbody>
              {/* The sum of the two lines above — the peach total band. */}
              <tfoot>
                <tr><th scope="row">Final Gross Commission</th><td className="num font-bold">{formatMoney(row.grossCommission)}</td></tr>
              </tfoot>
            </table>
          </div>
          <p className="text-sm mt-3 whitespace-pre-wrap break-words"><strong>Adjustment reason: </strong>{row.reason ?? (row.adjustmentAmount === 0 ? 'No adjustment' : 'Not recorded')}</p>
          <p className="text-[11px] mt-2"><PayrollStateChip status={row.status} />{row.sourceRunCount > 1 ? ` · ${row.sourceRunCount} synced sub-departments` : ''}</p>
        </div>) : <div className="overflow-x-auto">
          <table className="ledger-table" aria-label="Monthly payroll adjustments by salesperson">
            <thead><tr>
              <th>Salesperson</th><th className="right m-hide">Synced · all Revenue</th>
              <th className="right m-hide">Adjustment (+/−)</th><th className="m-hide">Reason</th>
              <th className="right">Final Gross Commission</th><th className="lt-toggle" aria-hidden />
            </tr></thead>
            <tbody>{read.rows.map(row => <LedgerRow key={row.staffId}>
              <td><span className="font-medium">{staffNames.get(row.staffId) ?? row.staffId}</span>
                <span className="block text-[11px] mt-1"><PayrollStateChip status={row.status} />{row.sourceRunCount > 1 ? ` · ${row.sourceRunCount} sub-departments` : ''}</span>
              </td>
              <td className="num m-hide" data-label="Synced commission · all Revenue">{row.syncedAmount === null ? 'Not recorded' : formatMoney(row.syncedAmount)}</td>
              <td className="num m-hide" data-label="Payroll adjustment (+/−)"><span className={row.adjustmentAmount < 0 ? 'neg' : ''}>{adjustmentText(row.adjustmentAmount)}</span></td>
              <td className="m-hide whitespace-pre-wrap break-words max-w-md" data-label="Adjustment reason">{row.reason ?? (row.adjustmentAmount === 0 ? 'No adjustment' : 'Not recorded')}</td>
              <td className="num font-bold">{formatMoney(row.grossCommission)}</td>
            </LedgerRow>)}</tbody>
          </table>
        </div>}
      </>}
    </section>
  )
}
