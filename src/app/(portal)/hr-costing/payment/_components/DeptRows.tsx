'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { delta, deptTimeline, isNotableMove, varianceLabel, type DeptGroup, type Granularity, type Scope } from '@/lib/payment-cycle'

type Filter = 'all' | 'todo' | 'pending' | 'paid' | 'blocked'

interface Props {
  period: string
  groups: DeptGroup[]
  prevMonthName: string
  today: string
  gran: Granularity
  onGran: (g: Granularity) => void
  dates: { staff: string; directors: string }
  onDate: (scope: Scope, v: string) => void
  fundedFor: (g: DeptGroup) => boolean
  busy: string | null
  /** 'all' while the header's Generate is confirming, else the group key. */
  confirmKey: string | null
  allLabel: string
  canGenerateAll: boolean
  allTitle?: string
  onAskAll: () => void
  onAskGroup: (g: DeptGroup) => void
  onConfirmGroup: (g: DeptGroup) => void
  onCancel: () => void
  onOpen: (key: string) => void
  /** The confirm bar for the header's Generate, rendered under the header. */
  confirmAll: ReactNode
  payoutBank: { name: string; last4: string } | null
  hint: string
}

/**
 * Deel's payroll-cycles list, one row per department: the name and what it
 * costs; one sentence over a four-segment bar (funded · generated ·
 * approved · paid) with the pay date under it; the net with last month
 * beneath; and a button whose label is the next step. Chips over the list
 * count the rows by state and filter them.
 */
export default function DeptRows({
  period,
  groups,
  prevMonthName,
  today,
  gran,
  onGran,
  dates,
  onDate,
  fundedFor,
  busy,
  confirmKey,
  allLabel,
  canGenerateAll,
  allTitle,
  onAskAll,
  onAskGroup,
  onConfirmGroup,
  onCancel,
  onOpen,
  confirmAll,
  payoutBank,
  hint,
}: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const remainingOf = (g: DeptGroup) => g.headcount - g.generated
  const counts: Record<Filter, number> = {
    all: groups.length,
    todo: groups.filter((g) => g.headcount > 0 && remainingOf(g) > 0).length,
    pending: groups.filter((g) => g.pending > 0).length,
    paid: groups.filter((g) => g.headcount > 0 && g.stage === 'paid').length,
    blocked: groups.filter((g) => g.blockers > 0 && g.stage !== 'paid').length,
  }
  const visible = groups.filter((g) => {
    switch (filter) {
      case 'todo':
        return g.headcount > 0 && remainingOf(g) > 0
      case 'pending':
        return g.pending > 0
      case 'paid':
        return g.headcount > 0 && g.stage === 'paid'
      case 'blocked':
        return g.blockers > 0 && g.stage !== 'paid'
      default:
        return true
    }
  })
  const hasDirectors = groups.some((g) => g.scope === 'directors')
  const allDone = groups.length > 0 && groups.every((g) => g.stage === 'paid' || g.headcount === 0)
  const hasRemaining = counts.todo > 0
  const FILTERS: Array<[Filter, string]> = [
    ['all', 'All'],
    ['todo', 'To generate'],
    ['pending', 'With Principal'],
    ['paid', 'Paid'],
    ['blocked', 'Blocked'],
  ]

  return (
    <div>
      <div className="pay-list">
        <div className="lh">
          <div className="pay-filt" role="group" aria-label="Filter departments">
            {FILTERS.filter(([k]) => k === 'all' || counts[k] > 0).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label}
                <b>{counts[k]}</b>
              </button>
            ))}
          </div>
          <span className="spacer" />
          {hasRemaining ? <>
          <div className="f">
            <span className="l">New PVs per</span>
            <div className="pay-seg" role="group" aria-label="PV granularity">
              <button type="button" aria-pressed={gran === 'department'} onClick={() => onGran('department')} disabled={busy != null || confirmKey != null}>
                Department
              </button>
              <button type="button" aria-pressed={gran === 'employee'} onClick={() => onGran('employee')} disabled={busy != null || confirmKey != null}>
                Employee
              </button>
            </div>
          </div>
          <label className="f">
            <span className="l">Staff pay date</span>
            <input type="date" className="pay-date" value={dates.staff} onChange={(e) => onDate('staff', e.target.value)} disabled={busy != null || confirmKey != null} />
          </label>
          {hasDirectors ? (
            <label className="f">
              <span className="l">Director pay date</span>
              <input type="date" className="pay-date" value={dates.directors} onChange={(e) => onDate('directors', e.target.value)} disabled={busy != null || confirmKey != null} />
            </label>
          ) : null}
          </> : null}
          <Link href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance`} className="pay-btn sec">
            Alliance file
          </Link>
          {!allDone ? (
            <button type="button" className="pay-btn pri" onClick={onAskAll} disabled={!canGenerateAll || busy != null || confirmKey === 'all'} title={allTitle}>
              {allLabel}
            </button>
          ) : null}
        </div>
        {confirmKey === 'all' ? <div style={{ padding: '10px 18px 0' }}>{confirmAll}</div> : null}
        <div className="lt">
          <span>
            Total {visible.length} of {groups.length} groups
          </span>
          <span>Funded · Generated · Approved · Paid</span>
        </div>

        {visible.length === 0 ? <div className="empty">No department in this state.</div> : null}

        {visible.map((g) => {
          const funded = fundedFor(g)
          const date = g.scope === 'directors' ? dates.directors : dates.staff
          const t = deptTimeline(g, funded, date, today)
          const d = delta(g.net, g.prev_net)
          const remaining = remainingOf(g)
          const canGenerate = funded && remaining > 0 && g.headcount > 0 && (g.scope === 'directors' || !!g.dept_id)
          const pendingVs = g.vouchers.filter((v) => v.status === 'pending_approval' || v.status === 'draft')
          const who = g.scope === 'directors' ? 'directors' : 'staff'
          const unpaid = g.people.length - g.headcount
          const label = gran === 'department' ? 'Generate 1 PV' : `Generate ${remaining} PVs`
          const confirming = confirmKey === g.key
          const owed = g.people.filter((p) => p.net > 0 && !p.voucher).reduce((s, p) => s + p.net, 0)
          return (
            <div key={g.key} className="pay-row">
              <div className="who">
                <div className="nm">{g.name}</div>
                <div className="sub">
                  <span>
                    {g.headcount} {who} · gross {formatMoneyBare(g.gross)}
                  </span>
                  {unpaid > 0 ? <span>· {unpaid} unpaid</span> : null}
                  {g.blockers > 0 && g.stage !== 'paid' ? (
                    <span className="pay-pill danger">
                      <span className="dot" />
                      {g.blockers} blocked
                    </span>
                  ) : null}
                  {d && d.dir !== 'flat' ? <span className={`pay-delta ${d.dir}${isNotableMove(d) ? ' notable' : ''}`}>{varianceLabel(d, prevMonthName)}</span> : null}
                </div>
              </div>
              <div className="tl">
                <div className={`s ${t.tone}`}>{t.sentence}</div>
                <div className="pay-bar4">
                  {t.segments.map((s, i) => (
                    <span key={i} className={`seg ${s}`} />
                  ))}
                </div>
                <div className="cap">
                  <span>{t.audit}</span>
                  <span>{t.caption}</span>
                </div>
              </div>
              <div className="amt">
                <div className="v">{formatMoneyBare(g.net)}</div>
                <div className="p">{g.prev_net == null ? `no ${prevMonthName} figure` : d?.dir === 'flat' ? `Same as ${prevMonthName}` : `Previous was ${formatMoneyBare(g.prev_net)}`}</div>
              </div>
              <div className="act">
                <div className="row2">
                  {remaining > 0 && g.headcount > 0 ? (
                    <button type="button" className="pay-btn pri" onClick={() => onAskGroup(g)} disabled={!canGenerate || busy != null || confirming} title={!funded ? 'Funding is not complete yet' : !g.dept_id && g.scope === 'staff' ? 'Assign a department on the People page first' : undefined}>
                      {label}
                    </button>
                  ) : pendingVs.length > 0 && pendingVs[0].group_id ? (
                    <Link href={`/approvals?group_id=${pendingVs[0].group_id}`} className="pay-btn sec">
                      Approvals →
                    </Link>
                  ) : g.deptVoucher ? (
                    <Link href={`/payments/${g.deptVoucher.id}`} className="pay-btn sec">
                      View PV
                    </Link>
                  ) : g.vouchers.length > 0 ? (
                    <button type="button" className="pay-btn sec" onClick={() => onOpen(g.key)}>
                      {g.vouchers.length} PVs
                    </button>
                  ) : null}
                </div>
                <button type="button" className="people" onClick={() => onOpen(g.key)}>
                  {remaining > 0 ? 'Select people' : `${g.people.length} ${g.people.length === 1 ? 'person' : 'people'}`} ›
                </button>
              </div>
              {confirming ? (
                <div className="confirm-wrap">
                  <div className="pay-confirm">
                    <span>
                      <b>RM {formatMoneyBare(owed)}</b> leaves {payoutBank ? `${payoutBank.name} ···${payoutBank.last4}` : 'the Alliance payroll account'} on <b>{date.slice(8, 10)}/{date.slice(5, 7)}</b> for {g.name} ·{' '}
                      {remaining} {who} · <b>{gran === 'employee' ? `${remaining} PVs` : '1 PV'}</b> — generate?
                    </span>
                    <button type="button" className="pay-btn pri" onClick={() => onConfirmGroup(g)} disabled={busy != null}>
                      {busy === `gen:${g.key}` ? 'Generating…' : 'Yes, generate'}
                    </button>
                    <button type="button" className="text-xs font-sans text-muted hover:text-ink" onClick={onCancel} disabled={busy != null}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <p className="font-serif italic text-muted text-xs mt-3">{hint}</p>
    </div>
  )
}
