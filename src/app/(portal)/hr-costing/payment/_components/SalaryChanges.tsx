'use client'

import { delta, type Delta, type DeptGroup, type VarianceSummary } from '@/lib/payment-cycle'
import { formatMoneyBare } from '@/lib/utils'

export function changeLabel(change: Delta | null) {
  if (!change) return 'New'
  if (change.dir === 'flat') return '—'
  if (change.pct == null) return `${change.abs > 0 ? '+' : '−'}${formatMoneyBare(Math.abs(change.abs))}`
  return `${change.pct > 0 ? '+' : '−'}${Math.abs(change.pct).toFixed(1)}%`
}

export default function SalaryChanges({ groups, variances, prevMonthName, onOpen }: {
  groups: DeptGroup[]; variances: VarianceSummary; prevMonthName: string; onOpen: (key: string) => void
}) {
  return <section className="payment-section" aria-labelledby="payment-changes-title">
    <div className="pay-section-toolbar"><h2 id="payment-changes-title">Changes from {prevMonthName}</h2><span className="pay-muted">Net salary · MYR</span></div>
    <div className="pay-table-wrap"><table className="pay-statement-table">
      <thead><tr><th>Department</th><th className="num">{prevMonthName}</th><th className="num">This month</th><th className="num">Difference</th><th className="num">Change</th></tr></thead>
      <tbody>{groups.map(group => { const change = delta(group.net, group.prev_net); return <tr key={group.key}>
        <td><button type="button" className="pay-text-button" onClick={() => onOpen(group.key)}>{group.name}</button></td>
        <td className="num">{group.prev_net == null ? '—' : formatMoneyBare(group.prev_net)}</td><td className="num">{formatMoneyBare(group.net)}</td>
        <td className={`num pay-change ${change?.dir ?? 'flat'}`}>{change ? `${change.abs > 0 ? '+' : change.abs < 0 ? '−' : ''}${formatMoneyBare(Math.abs(change.abs))}` : '—'}</td>
        <td className={`num pay-change ${change?.dir ?? 'flat'}`}>{changeLabel(change)}</td>
      </tr> })}</tbody>
    </table></div>
    <details className="pay-employee-changes"><summary>Employee movements · {variances.changed} changed / {variances.joiners} new</summary>
      <div className="pay-table-wrap"><table className="pay-statement-table"><thead><tr><th>Employee</th><th className="num">{prevMonthName}</th><th className="num">This month</th><th className="num">Change</th></tr></thead>
        <tbody>{groups.flatMap(group => group.people.map(person => ({ person, group }))).filter(({ person }) => person.prev_net == null || person.prev_net !== person.net).map(({ person, group }) => { const change = delta(person.net, person.prev_net); return <tr key={`${person.scope}:${person.row_id}`}>
          <td><button type="button" className="pay-text-button" onClick={() => onOpen(group.key)}>{person.name}</button><small>{group.name}</small></td>
          <td className="num">{person.prev_net == null ? '—' : formatMoneyBare(person.prev_net)}</td><td className="num">{formatMoneyBare(person.net)}</td><td className={`num pay-change ${change?.dir ?? 'flat'}`}>{changeLabel(change)}</td>
        </tr> })}</tbody></table></div>
    </details>
  </section>
}
