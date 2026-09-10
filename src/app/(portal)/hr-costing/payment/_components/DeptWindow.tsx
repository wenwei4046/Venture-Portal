'use client'

import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import {
  bankIssue,
  delta,
  isNotableMove,
  shortDate,
  shortDateTime,
  varianceLabel,
  type DeptGroup,
  type Granularity,
} from '@/lib/payment-cycle'
import PayWindow from './PayWindow'

interface Props {
  group: DeptGroup
  period: string
  periodLabel: string
  prevMonthName: string
  gran: Granularity
  onGran: (g: Granularity) => void
  date: string
  onDate: (d: string) => void
  /** This scope's funding is complete, so vouchers may be raised. */
  funded: boolean
  busy: string | null
  error: string | null
  confirming: boolean
  onAskGenerate: () => void
  onConfirmGenerate: () => void
  onCancel: () => void
  onSaveDates: () => void
  payoutBank: { name: string; last4: string } | null
  onClose: () => void
}

const BANK_ISSUE_LABEL = {
  missing_account: 'no account no.',
  missing_bank: 'no bank',
  numeric_bank: 'bank name is a number',
} as const

function chip(status: string | undefined, date: string | null | undefined) {
  if (!status) return <span className="chip">not generated</span>
  if (status === 'paid') return <span className="chip ledger"><span className="dot" />paid · {shortDate(date)}</span>
  if (status === 'approved') return <span className="chip ledger"><span className="dot" />approved</span>
  return <span className="chip alert"><span className="dot" />awaiting Principal</span>
}

/**
 * One department's people. The granularity switch lives here as well as on
 * the bar, so a department can be compiled as one PV or one per person
 * without leaving the window. A department already half-generated can only
 * take the remainder per employee — one voucher cannot cover people who
 * already have theirs.
 */
export default function DeptWindow({
  group: g,
  period,
  periodLabel,
  prevMonthName,
  gran,
  onGran,
  date,
  onDate,
  funded,
  busy,
  error,
  confirming,
  onAskGenerate,
  onConfirmGenerate,
  onCancel,
  onSaveDates,
  payoutBank,
  onClose,
}: Props) {
  const d = delta(g.net, g.prev_net)
  const remaining = g.headcount - g.generated
  const effectiveGran: Granularity = g.stage === 'partial' ? 'employee' : gran
  const canGenerate = funded && remaining > 0 && g.headcount > 0 && (g.scope === 'directors' || !!g.dept_id)
  const pendingVouchers = g.vouchers.filter((v) => v.status === 'pending_approval' || v.status === 'draft')
  const dateChanged = pendingVouchers.some((v) => v.payment_date !== date)
  const generatedBy = g.vouchers[0]
  const who = g.scope === 'directors' ? 'directors' : 'staff'

  return (
    <PayWindow
      eyebrow={`III. SALARY PVS · ${periodLabel.toUpperCase()}`}
      title={
        <>
          {g.name} <span>· {g.headcount} {who}</span>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <span className="font-serif italic text-muted text-xs">
            {g.stage === 'paid'
              ? `Paid · ${g.vouchers.length} PV${g.vouchers.length === 1 ? '' : 's'}`
              : effectiveGran === 'department'
                ? `One voucher for ${g.name}, ${g.headcount} lines, one approval.`
                : `${remaining || g.headcount} vouchers, one approval group.`}
          </span>
          {g.scope === 'staff' && g.dept_id ? (
            <Link
              href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance&department=${g.dept_id}`}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-xs px-3 py-1.5 rounded-md transition-colors"
            >
              Alliance file · {g.name} only
            </Link>
          ) : null}
        </>
      }
    >
      <div className="tiles">
        <div className="tile">
          <div className="l">Net to pay</div>
          <div className="v">{formatMoneyBare(g.net)}</div>
        </div>
        <div className="tile">
          <div className="l">Gross · deductions</div>
          <div className="v">
            {formatMoneyBare(g.gross)} <span className="text-graphite text-xs">· {formatMoneyBare(g.deductions)}</span>
          </div>
        </div>
        <div className="tile">
          <div className="l">vs {prevMonthName}</div>
          <div className="v txt">
            {d ? (
              <span className={`pay-delta ${d.dir}${isNotableMove(d) ? ' notable' : ''}`}>{varianceLabel(d, prevMonthName)}</span>
            ) : (
              <span className="text-muted">no {prevMonthName} figures</span>
            )}
            {g.prev_count > 0 && g.prev_count < g.people.length ? (
              <span className="text-muted"> · {g.prev_count} of {g.people.length} compared</span>
            ) : null}
          </div>
        </div>
      </div>

      {g.stage !== 'paid' && g.stage !== 'approved' ? (
        <div className="wctl">
          <div className="f" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="pay-bar-l l" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgb(var(--graphite))' }}>
              PV per
            </span>
            <div className="pay-seg" role="group" aria-label="PV granularity">
              <button type="button" aria-pressed={effectiveGran === 'department'} onClick={() => onGran('department')} disabled={g.stage === 'partial' || busy != null}>
                Department
              </button>
              <button type="button" aria-pressed={effectiveGran === 'employee'} onClick={() => onGran('employee')} disabled={busy != null}>
                Employee
              </button>
            </div>
          </div>
          <label className="f" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgb(var(--graphite))' }}>Pay date</span>
            <input type="date" className="pay-date" value={date} onChange={(e) => onDate(e.target.value)} disabled={busy != null} />
          </label>
          <span style={{ flex: 1 }} />
          {remaining > 0 ? (
            <button
              type="button"
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
              onClick={onAskGenerate}
              disabled={!canGenerate || busy != null || confirming}
              title={!funded ? 'Funding is not complete yet' : undefined}
            >
              {g.stage === 'partial'
                ? `Generate remaining ${remaining}`
                : effectiveGran === 'department'
                  ? 'Generate 1 PV'
                  : `Generate ${g.headcount} PVs`}
            </button>
          ) : pendingVouchers.length > 0 ? (
            <button
              type="button"
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
              onClick={onSaveDates}
              disabled={busy != null || !dateChanged || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
            >
              {busy === `date:${g.key}` ? 'Saving…' : `Save date on ${pendingVouchers.length} PV${pendingVouchers.length === 1 ? '' : 's'}`}
            </button>
          ) : null}
        </div>
      ) : null}

      {g.stage === 'partial' ? (
        <p className="font-serif italic text-muted text-xs" style={{ margin: 0 }}>
          {g.generated} of {g.headcount} already have a voucher, so the rest can only be raised one per person.
        </p>
      ) : null}

      {confirming ? (
        <div className="pay-confirm">
          <span>
            Generate{' '}
            <b>{effectiveGran === 'department' ? '1 PV' : `${remaining} PVs`}</b> · {g.name} · {remaining} {who} ·{' '}
            <b>RM {formatMoneyBare(g.stage === 'partial' ? g.people.filter((p) => p.net > 0 && !p.voucher).reduce((s, p) => s + p.net, 0) : g.net)}</b>
            {payoutBank ? (
              <>
                {' '}from {payoutBank.name} ···{payoutBank.last4}
              </>
            ) : null}{' '}
            on <b>{shortDate(date)}</b>. Principal approves; approval is the payment.
          </span>
          <button
            type="button"
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3.5 py-1.5 rounded-md disabled:opacity-50"
            onClick={onConfirmGenerate}
            disabled={busy != null}
          >
            {busy === `gen:${g.key}` ? 'Generating…' : 'Confirm'}
          </button>
          <button type="button" className="text-xs font-sans text-muted hover:text-ink" onClick={onCancel} disabled={busy != null}>
            Cancel
          </button>
        </div>
      ) : null}

      {error ? <div className="err">{error}</div> : null}

      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Bank</th>
              <th className="right">Net</th>
              <th className="right">vs {prevMonthName}</th>
              <th>PV</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {g.people.map((p, i) => {
              const issue = bankIssue(p)
              const pd = delta(p.net, p.prev_net)
              const v = p.voucher
              const line = g.deptVoucher && v?.granularity === 'department'
              return (
                <tr key={p.row_id}>
                  <td className="who">
                    <span className="nm">{p.name}</span>
                    {p.code ? <span className="cd">{p.code}</span> : null}
                  </td>
                  <td className={`bank${issue ? ' bad' : ''}`}>
                    {p.scope === 'directors' ? (
                      <span className="text-muted">director account</span>
                    ) : issue ? (
                      <>
                        ⚠ {BANK_ISSUE_LABEL[issue]}
                        {p.staff_id ? (
                          <>
                            {' '}
                            <Link href={`/team/people/${p.staff_id}`} className="text-accent hover:underline">
                              fix →
                            </Link>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {p.bank_name} <span className="text-muted">····</span>
                        {String(p.bank_account_no ?? '').slice(-4)}
                      </>
                    )}
                  </td>
                  <td className="num">{formatMoneyBare(p.net)}</td>
                  <td className="num">
                    {pd ? (
                      <span className={`pay-delta ${pd.dir}${isNotableMove(pd) ? ' notable' : ''}`}>
                        {pd.dir === 'flat' ? '—' : `${pd.dir === 'up' ? '▲ +' : '▼ '}${formatMoneyBare(pd.abs)}`}
                      </span>
                    ) : (
                      <span className="text-muted">new</span>
                    )}
                  </td>
                  <td>
                    {v ? (
                      line ? (
                        <span className="pv line">line {i + 1} · {v.no}</span>
                      ) : (
                        <Link href={`/payments/${v.id}`} className="pv text-accent hover:underline">
                          {v.no ?? 'PV'}
                        </Link>
                      )
                    ) : p.net > 0 ? (
                      <span className="pv none">—</span>
                    ) : (
                      <span className="pv none">net 0</span>
                    )}
                  </td>
                  <td>{p.net > 0 ? chip(v?.status, v?.payment_date) : <span className="text-muted text-xs">not paid</span>}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-hairline">
              <td className="font-serif italic text-accent" colSpan={2}>
                Total · {g.headcount} {who}
              </td>
              <td className="num font-semibold">{formatMoneyBare(g.net)}</td>
              <td className="num">
                {d ? <span className={`pay-delta ${d.dir}`}>{d.dir === 'flat' ? '—' : `${d.dir === 'up' ? '▲ +' : '▼ '}${formatMoneyBare(d.abs)}`}</span> : null}
              </td>
              <td colSpan={2} className="font-mono text-[10.5px] text-muted">
                {generatedBy?.created_at ? `Generated ${shortDateTime(generatedBy.created_at)}` : ''}
                {generatedBy?.approved_at ? ` · Approved ${shortDateTime(generatedBy.approved_at)}` : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </PayWindow>
  )
}
