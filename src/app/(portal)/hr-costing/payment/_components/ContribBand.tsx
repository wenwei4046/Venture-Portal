import { formatMoneyBare } from '@/lib/utils'
import type { ContributionTotals } from '@/lib/payment-cycle'

/** The reconciliation's expandable employee / employer contribution table. */
export default function ContribBand({ band: b }: { band: ContributionTotals }) {
  const heads = [
    { name: 'EPF', employee: b.employee.epf, employer: b.employer.epf },
    { name: 'SOCSO', employee: b.employee.socso, employer: b.employer.socso },
    { name: 'EIS', employee: b.employee.eis, employer: b.employer.eis },
    { name: 'PCB', employee: b.employee.pcb, employer: null },
    { name: 'SKBBK', employee: b.employee.skbbk, employer: null },
    ...(Math.abs(b.employee.other) >= 0.005 ? [{ name: 'Other deductions', employee: b.employee.other, employer: null }] : []),
  ]
  return (
    <table className="payment-contrib-table" aria-label="Employee deductions and employer contributions">
      <thead><tr><th scope="col">Contribution · RM</th><th scope="col">Employee</th><th scope="col">Employer</th></tr></thead>
      <tbody>
        {heads.map((head) => <tr key={head.name}>
          <th scope="row">{head.name}</th>
          <td>{formatMoneyBare(head.employee)}</td>
          <td>{head.employer == null ? '—' : formatMoneyBare(head.employer)}</td>
        </tr>)}
      </tbody>
      <tfoot><tr><th scope="row">Total</th><td>{formatMoneyBare(b.employee.total)}</td><td>{formatMoneyBare(b.employer.total)}</td></tr></tfoot>
    </table>
  )
}
