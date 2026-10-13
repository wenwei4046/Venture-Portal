'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { BODIES, shortDate, type BodyKey, type DeptGroup, type Granularity, type StatutoryRow } from '@/lib/payment-cycle'
import PayWindow from './PayWindow'

export default function StatutoryWindow({ body, rows, groups, periodLabel, today, onGenerate, onSaveDate, busy, error, onClose }: {
  body: BodyKey; rows: StatutoryRow[]; groups: DeptGroup[]; periodLabel: string; today: string
  onGenerate: (mode: Granularity) => void; onSaveDate: (voucherId: string, date: string) => void
  busy: string | null; error: string | null; onClose: () => void
}) {
  const [dates, setDates] = useState<Record<string, string>>({})
  const def = BODIES.find(item => item.key === body)!
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const remaining = rows.reduce((sum, row) => sum + row.remainingAmount, 0)
  const paid = rows.reduce((sum, row) => sum + row.paidAmount, 0)
  return <PayWindow eyebrow={`STATUTORY · ${periodLabel.toUpperCase()}`} title={<>{body} <span>· {def.portal}</span></>} onClose={onClose}>
    <div className="tiles"><div className="tile"><div className="l">Total contributions</div><div className="v">{formatMoneyBare(total)}</div></div><div className="tile"><div className="l">Paid</div><div className="v">{formatMoneyBare(paid)}</div></div><div className="tile"><div className="l">To generate</div><div className="v">{formatMoneyBare(remaining)}</div></div></div>
    {error ? <p className="err" role="alert">{error}</p> : null}
    {remaining > 0 ? <div className="sheet-toolbar pay-section-toolbar"><span className="pay-muted">Include a department or select employees.</span><div className="pay-row-actions"><button type="button" className="pay-btn pri" onClick={() => onGenerate('department')} disabled={busy != null}>Generate by Department</button><button type="button" className="pay-btn text" onClick={() => onGenerate('employee')} disabled={busy != null} title="One PV per person — for an exception">Manual generate</button></div></div> : null}
    <div className="pay-table-wrap"><table className="pay-statement-table"><thead><tr><th>PV</th><th>Scheme</th><th className="right">Amount</th><th>Payment date</th><th>Status</th><th></th></tr></thead>
      <tbody>{rows.flatMap(row => row.vouchers.map(voucher => {
        const date = dates[voucher.id] ?? voucher.payment_date ?? ''
        const editable = voucher.status === 'draft' || voucher.status === 'pending_approval'
        return <tr key={voucher.id}><td><Link href={`/payments/${voucher.id}`} className="pay-text-button">{voucher.no ?? 'View PV'}</Link><small>{voucher.description}</small></td><td>{row.scheme}</td><td className="num">{formatMoneyBare(voucher.amount)}</td><td>{editable ? <input type="date" className="pay-date" value={date} disabled={busy != null} onChange={event => setDates(current => ({ ...current, [voucher.id]: event.target.value }))} aria-label={`${voucher.no ?? row.scheme} payment date`} /> : shortDate(date)}</td><td><span className={`pay-state chip${voucher.status === 'paid' ? ' ledger' : voucher.status === 'approved' ? '' : ' alert'}`}><span className="dot" />{voucher.status === 'paid' ? 'Paid' : voucher.status === 'approved' ? 'Approved' : 'Awaiting Principal'}</span></td><td>{editable ? <button type="button" className="pay-btn sec" disabled={busy != null || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date === voucher.payment_date} onClick={() => onSaveDate(voucher.id, date)}>Save date</button> : null}</td></tr>
      }))}{rows.every(row => row.vouchers.length === 0) ? <tr><td colSpan={6} className="pay-muted empty">No PVs generated.</td></tr> : null}</tbody>
    </table></div>
    <h3>Contributions by department</h3>
    <div className="pay-table-wrap"><table className="pay-statement-table"><thead><tr><th>Department</th>{rows.map(row => <th className="right" key={row.scheme}>{row.scheme}</th>)}<th className="right">Total</th></tr></thead><tbody>{groups.map(group => {
      const amounts = rows.map(row => row.byDepartment.find(item => item.key === group.key)?.amount ?? 0)
      return <tr key={group.key}><td className="font-medium">{group.name}<small>{group.people.length} people</small></td>{amounts.map((amount, index) => <td className="num" key={rows[index].scheme}>{formatMoneyBare(amount)}</td>)}<td className="num">{formatMoneyBare(amounts.reduce((sum, amount) => sum + amount, 0))}</td></tr>
    })}</tbody><tfoot><tr><td>Total</td>{rows.map(row => <td className="num" key={row.scheme}>{formatMoneyBare(row.total)}</td>)}<td className="num">{formatMoneyBare(total)}</td></tr></tfoot></table></div>
    <p className="pay-muted">{rows.map(row => `${row.scheme} due ${shortDate(row.due)}${row.due < today && row.paidAmount < row.total ? ' · overdue' : ''}`).join(' · ')}</p>
  </PayWindow>
}
