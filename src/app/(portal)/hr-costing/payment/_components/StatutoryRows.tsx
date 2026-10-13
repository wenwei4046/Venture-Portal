'use client'

import { BODIES, round2, shortDate, type BodyKey, type Granularity, type StatutoryRow } from '@/lib/payment-cycle'
import { formatMoneyBare } from '@/lib/utils'

export default function StatutoryRows({ rows, today, busy, staffFunded, onGenerate, onOpen }: {
  rows: StatutoryRow[]; today: string; busy: string | null; staffFunded: boolean
  onGenerate: (body: BodyKey, mode: Granularity) => void; onOpen: (body: BodyKey) => void
}) {
  const outstanding = round2(rows.reduce((sum, row) => sum + Math.max(0, row.total - row.paidAmount), 0))
  return <>
    <div className="pay-table-wrap"><table className="pay-statement-table pay-statutory-table">
      <thead><tr><th>Institution</th><th className="right">Amount · RM</th><th>Due</th><th>Status</th><th className="right">Generate PVs</th></tr></thead>
      <tbody>{BODIES.map(body => {
        const schemes = rows.filter(row => row.body === body.key)
        if (!schemes.length) return null
        const total = round2(schemes.reduce((sum, row) => sum + row.total, 0))
        const remaining = round2(schemes.reduce((sum, row) => sum + row.remainingAmount, 0))
        const vouchers = schemes.flatMap(row => row.vouchers)
        const due = schemes.map(row => row.due).sort()[0]
        const allPaid = total > 0 && schemes.every(row => row.total <= row.paidAmount)
        const pending = vouchers.some(v => v.status === 'draft' || v.status === 'pending_approval')
        const status = total === 0 ? 'No amount due' : allPaid ? 'Paid' : vouchers.length === 0 ? 'Not generated' : remaining > 0 ? 'Partly generated' : pending ? 'Awaiting Principal' : 'Approved'
        return <tr key={body.key}>
          <td><button type="button" className="pay-text-button" onClick={() => onOpen(body.key)}>{body.name}</button><small>{body.key === 'PERKESO' ? 'SOCSO + EIS' : body.key === 'KWSP' ? 'EPF' : body.key === 'LHDN' ? 'PCB / MTD' : 'Employee deduction'}</small></td>
          <td className="num">{formatMoneyBare(total)}{remaining > 0 && vouchers.length > 0 ? <small>{formatMoneyBare(remaining)} to generate</small> : null}</td>
          <td className={due < today && !allPaid && total > 0 ? 'pay-change-notable' : undefined}>{shortDate(due)}</td>
          <td><span className={`chip${allPaid ? ' ledger' : pending ? ' alert' : ''}`}><span className="dot" />{status}</span>{vouchers.length > 0 ? <small><button type="button" className="pay-text-button" onClick={() => onOpen(body.key)}>{vouchers.length} PV{vouchers.length === 1 ? '' : 's'} ↗</button></small> : null}</td>
          <td><div className="pay-row-actions">{remaining > 0 ? <>
            {/* By department is the way, as on Salary (2026-10-13); one person's PV is the exception. */}
            <button type="button" className="pay-btn pri" disabled={busy != null || !staffFunded} title={!staffFunded ? 'Payroll funding is not complete yet' : undefined} onClick={() => onGenerate(body.key, 'department')}>Generate by Department</button>
            <button type="button" className="pay-btn text" disabled={busy != null || !staffFunded} title={!staffFunded ? 'Payroll funding is not complete yet' : 'One PV per person — for an exception'} onClick={() => onGenerate(body.key, 'employee')}>Manual generate</button>
          </> : <button type="button" className="pay-text-button" onClick={() => onOpen(body.key)}>View details ↗</button>}</div></td>
        </tr>
      })}</tbody>
      <tfoot><tr><td>Total outstanding</td><td className="num">{formatMoneyBare(Math.max(0, outstanding))}</td><td colSpan={3}>4 bodies · SOCSO and EIS remain separate</td></tr></tfoot>
    </table></div>
  </>
}
