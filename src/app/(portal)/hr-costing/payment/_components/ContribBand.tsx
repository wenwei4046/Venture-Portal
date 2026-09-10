import { formatMoneyBare } from '@/lib/utils'
import type { ContributionTotals } from '@/lib/payment-cycle'

/**
 * PayrollPanda's header band: GROSS | what the employees pay in (accent) |
 * NET | what the employer pays in (walnut) | COST. The two families take a
 * surface colour each, never a status colour — neither is good or bad.
 */
export default function ContribBand({ band: b }: { band: ContributionTotals }) {
  return (
    <div className="pay-band" aria-label="Gross to cost">
      <div className="g tot">
        <span className="l">Gross</span>
        <span className="v">{formatMoneyBare(b.gross)}</span>
      </div>
      <div className="g grp ee">
        <span className="l">Employee contributions · {formatMoneyBare(b.employee.total)}</span>
        <span className="kv">
          <span>
            <i>EPF</i>
            <b>{formatMoneyBare(b.employee.epf)}</b>
          </span>
          <span>
            <i>SOCSO</i>
            <b>{formatMoneyBare(b.employee.socso)}</b>
          </span>
          <span>
            <i>EIS</i>
            <b>{formatMoneyBare(b.employee.eis)}</b>
          </span>
          <span>
            <i>PCB</i>
            <b>{formatMoneyBare(b.employee.pcb)}</b>
          </span>
          <span>
            <i>SKBBK</i>
            <b>{formatMoneyBare(b.employee.skbbk)}</b>
          </span>
          {Math.abs(b.employee.other) >= 0.005 ? (
            <span>
              <i>Other</i>
              <b>{formatMoneyBare(b.employee.other)}</b>
            </span>
          ) : null}
        </span>
      </div>
      <div className="g tot">
        <span className="l">Net</span>
        <span className="v">{formatMoneyBare(b.net)}</span>
      </div>
      <div className="g grp er">
        <span className="l">Employer contributions · {formatMoneyBare(b.employer.total)}</span>
        <span className="kv">
          <span>
            <i>EPF</i>
            <b>{formatMoneyBare(b.employer.epf)}</b>
          </span>
          <span>
            <i>SOCSO</i>
            <b>{formatMoneyBare(b.employer.socso)}</b>
          </span>
          <span>
            <i>EIS</i>
            <b>{formatMoneyBare(b.employer.eis)}</b>
          </span>
        </span>
      </div>
      <div className="g tot">
        <span className="l">Cost · CTC</span>
        <span className="v">{formatMoneyBare(b.cost)}</span>
      </div>
    </div>
  )
}
