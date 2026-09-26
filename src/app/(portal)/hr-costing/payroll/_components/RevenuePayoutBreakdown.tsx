import { formatMoneyBare } from '@/lib/utils'
import { calculateRevenuePayrollSplit, type RevenuePayrollRow } from '@/lib/revenue-payroll'

/** Reconciles salary PVs and institution contributions against the commission pool. */
export default function RevenuePayoutBreakdown({ row }: { row: RevenuePayrollRow }) {
  const split = calculateRevenuePayrollSplit(row)
  const employee = Number(row.epf_ee) + Number(row.socso_ee ?? 0) + Number(row.eis_ee ?? 0)
  const employer = Number(row.epf_er) + Number(row.socso_er ?? 0) + Number(row.eis_er ?? 0)
  const pcb = Number(row.pcb ?? 0)
  const other = Math.round((split.totalPayout - (row.commission_amount - employee - employer - pcb)) * 100) / 100
  const lines: [string, number][] = [
    ['Gross commission', row.commission_amount],
    ...(other !== 0 ? [['Other payroll adjustments', other] as [string, number]] : []),
    ['Net basic · salary PV', split.basicPay],
    ['Employee EPF + SOCSO + EIS · statutory PVs', employee],
    ['PCB · tax PV', pcb],
    ['Employer EPF + SOCSO + EIS · statutory PVs', employer],
  ]
  // What is left once every allocation above is paid — the table's result
  // line, so it sits in the footer band.
  const balance: [string, number] = ['Commission balance · salary PV', split.commissionBalance]
  return (
    <div className="mt-4" aria-label="Commission allocation">
      {row.commission_synced_amount != null && (
        <div className="mb-3 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-xs" aria-label="Commission adjustment">
          <p>Synced commission: RM {formatMoneyBare(row.commission_synced_amount)}</p>
          <p>Adjustment: RM {(row.commission_adjustment_amount ?? 0) > 0 ? '+' : ''}{formatMoneyBare(row.commission_adjustment_amount ?? 0)}</p>
          <p>Gross commission: RM {formatMoneyBare(row.commission_amount)}</p>
          {row.commission_adjustment_reason && <p className="mt-1">Reason: {row.commission_adjustment_reason}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="ledger-table" aria-label="Commission allocation breakdown">
          <thead><tr><th>Allocation</th><th className="right">RM</th></tr></thead>
          <tbody>{lines.map(([label, amount]) => <tr key={label}>
            <td>{label}</td><td className="num whitespace-nowrap">{formatMoneyBare(amount)}</td>
          </tr>)}</tbody>
          <tfoot><tr>
            <td>{balance[0]}</td><td className="num whitespace-nowrap">{formatMoneyBare(balance[1])}</td>
          </tr></tfoot>
        </table>
      </div>
      <p className="text-xs mt-3">
        Basic salary {formatMoneyBare(split.basicGross)} − employee contributions {formatMoneyBare(employee)} − PCB {formatMoneyBare(pcb)} = net basic {formatMoneyBare(split.basicPay)}.
        {' '}Basic and commission are separate salary payments. Statutory PVs pay the institutions separately.
      </p>
      <p className="text-xs mt-2">PCB uses the basic salary after employee EPF. A manual PCB amount stays until reset.</p>
    </div>
  )
}
