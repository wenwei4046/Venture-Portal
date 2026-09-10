'use client'

import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { payrollSelection } from '@/lib/payroll-selection'
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
  /** null selects everyone still without a voucher; [] is an explicit empty selection. */
  selectedIds: string[] | null
  onSelection: (ids: string[] | null) => void
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
  if (!status) return <span className="chip pay-state">not generated</span>
  if (status === 'paid') return <span className="chip ledger pay-state"><span className="dot" />paid · {shortDate(date)}</span>
  if (status === 'approved') return <span className="chip ledger pay-state"><span className="dot" />approved</span>
  return <span className="chip alert pay-state"><span className="dot" />awaiting Principal</span>
}

/**
 * One department's people. The granularity switch lives here as well as on
 * the bar, so a department can be compiled as one PV or one per person
 * without leaving the window. Select all remaining people or a subset;
 * existing vouchers are excluded from every new batch.
 */
export default function DeptWindow({
  group: g,
  period,
  periodLabel,
  prevMonthName,
  gran,
  onGran,
  selectedIds,
  onSelection,
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
  const selection = payrollSelection(g.people, selectedIds, gran)
  const selectedSet = new Set(selection.rowIds)
  const canGenerate = funded && selection.count > 0 && (g.scope === 'directors' || !!g.dept_id) && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const locked = busy != null || confirming
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
              : remaining > 0
                ? `${selection.count} selected · RM ${formatMoneyBare(selection.total)} · ${selection.voucherCount} PV${selection.voucherCount === 1 ? '' : 's'}`
                : `${g.vouchers.length} existing PVs · no people left to generate`}
          </span>
          {g.scope === 'staff' && g.dept_id ? (
            <Link
              href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance&department=${g.dept_id}`}
              className="pay-btn sec"
              title="Exports every employee in this department, regardless of the PV selection above"
            >
              Alliance file · entire department
            </Link>
          ) : null}
        </>
      }
    >
      <div className="tiles">
        <div className="tile">
          <div className="l">{remaining > 0 ? 'Selected net to pay' : 'Net to pay'}</div>
          <div className="v" aria-live="polite">{formatMoneyBare(remaining > 0 ? selection.total : g.net)}</div>
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

      {remaining > 0 ? (
        <div className="pay-selection">
          <div className="pay-seg" role="group" aria-label="People to include">
            <button type="button" aria-pressed={selectedIds == null} onClick={() => onSelection(null)} disabled={locked}>
              {g.generated > 0 ? 'All remaining' : 'Whole department'} ({selection.eligible.length})
            </button>
            <button type="button" aria-pressed={selectedIds != null} onClick={() => onSelection([])} disabled={locked}>
              Choose employees
            </button>
          </div>
          <p aria-live="polite">
            <b>{selection.count} of {selection.eligible.length} selected</b> · RM {formatMoneyBare(selection.total)} · {selection.voucherCount} PV{selection.voucherCount === 1 ? '' : 's'}
          </p>
          <span>Tick the people to include below. Anyone who already has a PV cannot be selected again.</span>
        </div>
      ) : null}

      {remaining > 0 || pendingVouchers.length > 0 ? (
        <div className="wctl">
          {remaining > 0 ? (
          <div className="f" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="pay-bar-l l" style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgb(var(--graphite))' }}>
              PV format
            </span>
            <div className="pay-seg" role="group" aria-label="PV granularity">
              <button type="button" aria-pressed={gran === 'department'} onClick={() => onGran('department')} disabled={locked}>
                One grouped PV
              </button>
              <button type="button" aria-pressed={gran === 'employee'} onClick={() => onGran('employee')} disabled={locked}>
                One PV per employee
              </button>
            </div>
          </div>
          ) : null}
          <label className="f" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgb(var(--graphite))' }}>Pay date</span>
            <input type="date" className="pay-date" value={date} onChange={(e) => onDate(e.target.value)} disabled={locked} />
          </label>
          <span style={{ flex: 1 }} />
          {remaining > 0 ? (
            <button
              type="button"
              className="pay-btn pri"
              onClick={onAskGenerate}
              disabled={!canGenerate || busy != null || confirming}
              title={!funded ? 'Funding is not complete yet' : selection.count === 0 ? 'Select at least one employee' : undefined}
            >
              Generate {selection.voucherCount} PV{selection.voucherCount === 1 ? '' : 's'} · {selection.count} people
            </button>
          ) : pendingVouchers.length > 0 ? (
            <button
              type="button"
              className="pay-btn sec"
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
          {g.generated} of {g.headcount} already have a voucher. Select any of the remaining {remaining} people for this batch.
        </p>
      ) : null}

      {confirming ? (
        <div className="pay-confirm">
          <span>
            Generate{' '}
            <b>{selection.voucherCount} PV{selection.voucherCount === 1 ? '' : 's'}</b> · {g.name} · {selection.count} {who} ·{' '}
            <b>RM {formatMoneyBare(selection.total)}</b>
            {payoutBank ? (
              <>
                {' '}from {payoutBank.name} ···{payoutBank.last4}
              </>
            ) : null}{' '}
            on <b>{shortDate(date)}</b>. Principal approves; approval is the payment.
            <span className="pay-selected-names">{selection.selected.map((person) => person.name).join(' · ')}</span>
          </span>
          <button
            type="button"
            className="pay-btn pri"
            onClick={onConfirmGenerate}
            disabled={busy != null || !canGenerate}
          >
            {busy === `gen:${g.key}` ? 'Generating…' : 'Yes, generate'}
          </button>
          <button type="button" className="text-xs font-sans text-muted hover:text-ink" onClick={onCancel} disabled={busy != null}>
            Cancel
          </button>
        </div>
      ) : null}

      {error ? <div className="err">{error}</div> : null}

      <div className="overflow-x-auto">
        <table className="ledger-table pay-people-table">
          <thead>
            <tr>
              {remaining > 0 ? <th className="pick"><input type="checkbox" aria-label="Select all remaining employees" checked={selection.count === selection.eligible.length && selection.count > 0} onChange={(e) => onSelection(e.target.checked ? null : [])} disabled={locked} /></th> : null}
              <th>Employee</th>
              <th>Bank</th>
              <th className="right">Net</th>
              <th className="right">vs {prevMonthName}</th>
              <th>PV</th>
              <th className="state-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {g.people.map((p) => {
              const issue = bankIssue(p)
              const pd = delta(p.net, p.prev_net)
              const v = p.voucher
              const line = v?.granularity === 'department'
              const eligible = p.net > 0 && !v
              return (
                <tr key={p.row_id} className={isNotableMove(pd) ? 'moved' : undefined} title={isNotableMove(pd) ? `Moved 20% or more vs ${prevMonthName}` : undefined}>
                  {remaining > 0 ? <td className="pick"><input type="checkbox" aria-label={`Select ${p.name}`} checked={selectedSet.has(p.row_id)} disabled={!eligible || locked} title={!eligible ? 'Already has a PV or no net salary to pay' : undefined} onChange={(e) => onSelection(e.target.checked ? [...selection.rowIds, p.row_id] : selection.rowIds.filter((id) => id !== p.row_id))} /></td> : null}
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
                        <Link href={`/payments/${v.id}`} className="pv text-accent hover:underline">{v.no ?? 'PV'} · grouped</Link>
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
                  <td className="state-cell">{p.net > 0 ? chip(v?.status, v?.payment_date) : <span className="text-muted text-xs">not paid</span>}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-hairline">
              <td className="font-serif italic text-accent" colSpan={remaining > 0 ? 3 : 2}>
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
