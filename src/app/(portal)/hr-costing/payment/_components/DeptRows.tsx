'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { delta, deptTimeline, isNotableMove, round2, shortDate, varianceLabel, type DeptGroup, type Granularity } from '@/lib/payment-cycle'

type Filter = 'all' | 'todo' | 'pending' | 'paid' | 'blocked'

interface Props {
  period: string
  groups: DeptGroup[]
  prevMonthName: string
  today: string
  dates: { staff: string; directors: string }
  fundedFor: (g: DeptGroup) => boolean
  busy: string | null
  /** Opens the chosen generation method for review; does not create a PV. */
  onGenerate: (group: DeptGroup, gran: Granularity) => void
  onOpen: (key: string) => void
  payoutBank: { name: string; last4: string } | null
  /** Bank accounts ticked for the viewer (2026-10-09, PR4): the bank file and
   *  salary PVs both carry the numbers. */
  seesBank?: boolean
}

/** Salary statement, with a fixed generation method chosen at the row. */
export default function DeptRows({
  period, groups, prevMonthName, today, dates, fundedFor, busy, onGenerate, onOpen, payoutBank, seesBank = true,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const remainingOf = (g: DeptGroup) => g.headcount - g.generated
  const counts: Record<Filter, number> = {
    all: groups.length,
    todo: groups.filter((g) => remainingOf(g) > 0).length,
    pending: groups.filter((g) => g.pending > 0).length,
    paid: groups.filter((g) => g.headcount > 0 && g.stage === 'paid').length,
    blocked: groups.filter((g) => g.blockers > 0 && g.stage !== 'paid').length,
  }
  const visible = groups.filter((g) => {
    switch (filter) {
      case 'todo': return remainingOf(g) > 0
      case 'pending': return g.pending > 0
      case 'paid': return g.headcount > 0 && g.stage === 'paid'
      case 'blocked': return g.blockers > 0 && g.stage !== 'paid'
      default: return true
    }
  })
  const filters: Array<[Filter, string]> = [
    ['all', 'All'], ['todo', 'To generate'], ['pending', 'With Principal'], ['paid', 'Paid'], ['blocked', 'Blocked'],
  ]
  const totalNet = round2(visible.reduce((sum, group) => sum + group.net, 0))
  const totalPeople = visible.reduce((sum, group) => sum + group.people.length, 0)
  const totalVouchers = visible.reduce((sum, group) => sum + group.vouchers.length, 0)

  return (
    <div>
      <div className="sheet-toolbar pay-section-toolbar">
        <div className="pay-filt" role="group" aria-label="Filter departments">
          {filters.filter(([key]) => key === 'all' || counts[key] > 0).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}<b>{counts[key]}</b>
            </button>
          ))}
        </div>
        {seesBank ? (
          <Link href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance`} className="pay-btn sec" title={`Export all generated staff salary PVs, including paid PVs, for ${payoutBank?.name ?? 'Alliance Bank'}. Open PV records to download a specific payment.`}>
            All staff generated PVs · includes paid
          </Link>
        ) : null}
      </div>
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className="pay-statement-table pay-salary-table" aria-label="Salary vouchers by department">
            <thead>
              <tr>
                <th scope="col">Department</th>
                <th scope="col" className="right">People</th>
                <th scope="col" className="right">Net salary · RM</th>
                <th scope="col">Status</th>
                <th scope="col" className="right">vs {prevMonthName}</th>
                <th scope="col" className="right">PV records</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? <tr><td colSpan={6} className="empty">No department in this state.</td></tr> : null}
              {visible.map((g) => {
                const funded = fundedFor(g)
                const date = g.scope === 'directors' ? dates.directors : dates.staff
                const timeline = deptTimeline(g, funded, date, today)
                const difference = delta(g.net, g.prev_net)
                const remaining = remainingOf(g)
                const canGenerate = seesBank && funded && remaining > 0 && (g.scope === 'directors' || !!g.dept_id)
                const reason = !seesBank ? 'Salary PVs carry the account numbers — needs Bank accounts ticked for your title'
                  : !funded ? 'Funding is not complete yet' : !g.dept_id && g.scope === 'staff' ? 'Assign a department on the People page first' : undefined
                const paidDates = Array.from(new Set(g.vouchers.map((v) => v.payment_date)))
                const status = g.headcount === 0 ? 'No salary due'
                  : g.stage === 'paid' ? `Paid${paidDates.length === 1 && paidDates[0] ? ` · ${shortDate(paidDates[0])}` : ''}`
                    : g.stage === 'pending' ? 'Awaiting Principal'
                      : g.stage === 'approved' ? 'Approved'
                        : g.stage === 'partial' ? `${g.generated} of ${g.headcount} generated`
                          : funded ? 'Not generated' : 'Awaiting funding'
                return (
                  <tr key={g.key}>
                    <th scope="row">
                      {g.name}
                      {g.blockers > 0 && g.stage !== 'paid' ? <small className="pay-muted">{g.blockers} bank detail{g.blockers === 1 ? '' : 's'} to check</small> : null}
                    </th>
                    <td className="num">{g.people.length}</td>
                    <td className="num">{formatMoneyBare(g.net)}</td>
                    <td>
                      <span className={`chip${timeline.tone === 'muted' ? '' : ` ${timeline.tone}`}`} title={timeline.sentence}><span className="dot" />{status}</span>
                      {g.stage !== 'paid' && g.headcount > 0 ? <small className="pay-muted">{timeline.caption}</small> : null}
                    </td>
                    <td className="num">
                      {difference ? (
                        <span className={`pay-delta ${difference.dir}${isNotableMove(difference) ? ' notable' : ''}`} title={varianceLabel(difference, prevMonthName) ?? undefined}>
                          {difference.dir === 'flat' ? '—' : difference.pct == null ? `${difference.dir === 'up' ? '+' : ''}${formatMoneyBare(difference.abs)}` : `${difference.pct > 0 ? '+' : ''}${difference.pct.toFixed(1)}%`}
                        </span>
                      ) : <span className="pay-muted">—</span>}
                    </td>
                    <td>
                      <div className="pay-row-actions">
                        <button type="button" className="pay-btn text" onClick={() => onOpen(g.key)}>
                          {g.vouchers.length > 0 ? `${g.vouchers.length} PV${g.vouchers.length === 1 ? '' : 's'} · View` : 'View employees'}
                        </button>
                        {remaining > 0 ? <>
                          <button type="button" className="pay-btn sec" onClick={() => onGenerate(g, 'department')} disabled={!canGenerate || busy != null} title={reason}>Generate by Department</button>
                          <button type="button" className="pay-btn sec" onClick={() => onGenerate(g, 'employee')} disabled={!canGenerate || busy != null} title={reason}>Manual generate</button>
                        </> : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{filter === 'all' ? 'Total' : 'Filtered total'}</th>
                <td className="num">{totalPeople}</td>
                <td className="num">{formatMoneyBare(totalNet)}</td>
                <td colSpan={3} className="right">{visible.length} groups · {totalVouchers} PV{totalVouchers === 1 ? '' : 's'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="table-frame-foot">Generate by Department groups remaining payments by department and component. Manual generate creates one PV per selected payment. Payments already covered by a PV are excluded.</div>
      </div>
    </div>
  )
}
