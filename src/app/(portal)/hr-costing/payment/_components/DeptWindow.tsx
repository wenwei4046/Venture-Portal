'use client'

import Link from 'next/link'
import { formatMoneyBare } from '@/lib/utils'
import { payrollComponentSelection, salaryComponentLabel } from '@/lib/payroll-selection'
import { availableStaffBankAccounts, type BankAccountSelection } from '@/lib/staff-bank-accounts'
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
  /** Existing PV records only; pending records still allow payment-date edits. */
  readOnly?: boolean
  /** null selects everyone still without a voucher; [] is an explicit empty selection. */
  selectedIds: string[] | null
  onSelection: (ids: string[] | null) => void
  accounts?: Record<string, BankAccountSelection>
  onAccount?: (key: string, account: BankAccountSelection) => void
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

/** A PV's state as a word on its wash: green paid / approved, amber with Principal. */
function chip(status: string | undefined, date: string | null | undefined) {
  if (!status) return <span className="pay-state chip whitespace-nowrap"><span className="dot" />Not generated</span>
  if (status === 'paid') return <span className="pay-state chip ledger whitespace-nowrap"><span className="dot" />Paid · {shortDate(date)}</span>
  if (status === 'approved') return <span className="pay-state chip ledger whitespace-nowrap"><span className="dot" />Approved</span>
  return <span className="pay-state chip alert whitespace-nowrap"><span className="dot" />Awaiting Principal</span>
}

function validPaymentDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

/** A fixed method: all remaining people in one PV, or selected people in individual PVs. */
export default function DeptWindow({
  group: g,
  period,
  periodLabel,
  prevMonthName,
  gran,
  readOnly = false,
  selectedIds,
  onSelection,
  accounts = {},
  onAccount,
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
  const selection = payrollComponentSelection(g.people, gran === 'department' && !confirming ? null : selectedIds, gran, accounts)
  const selectedSet = new Set(selection.selectionKeys)
  const selectionIds = selection.selected.map(line => line.component === 'net' ? line.person.row_id : line.key)
  const eligiblePeople = new Set(selection.eligible.map(line => line.person.row_id)).size
  const hasSplit = selection.lines.some(line => line.component !== 'net')
  const showGeneration = !readOnly && remaining > 0
  const showSelection = showGeneration && gran === 'employee'
  const canGenerate = showGeneration && funded && selection.count > 0 && selection.missingAccounts.length === 0 && selection.negativeComponents.length === 0 && (g.scope === 'directors' || !!g.dept_id) && validPaymentDate(date)
  const locked = busy != null || confirming
  const pendingVouchers = g.vouchers.filter((v) => v.status === 'pending_approval' || v.status === 'draft')
  const dateChanged = pendingVouchers.some((v) => v.payment_date !== date)
  const generatedBy = g.vouchers[0]
  const who = g.scope === 'directors' ? 'directors' : 'staff'

  return (
    <PayWindow
      eyebrow={`SALARY PVS · ${periodLabel.toUpperCase()}`}
      title={
        <>
          {g.name} <span>· {g.headcount} {who}</span>
        </>
      }
      onClose={onClose}
      footer={
        <>
          <span className="text-xs">
            {g.stage === 'paid'
              ? `Paid · ${g.vouchers.length} PV${g.vouchers.length === 1 ? '' : 's'}`
                : showGeneration
                  ? `${selection.count} selected · RM ${formatMoneyBare(selection.total)} · ${selection.voucherCount} PV${selection.voucherCount === 1 ? '' : 's'}`
                : `${g.vouchers.length} existing PV${g.vouchers.length === 1 ? '' : 's'}${remaining > 0 ? ` · ${remaining} people still to generate` : ' · no people left to generate'}`}
          </span>
          {g.scope === 'staff' && g.dept_id ? (
            <Link
              href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance&department=${g.dept_id}`}
              className="pay-btn sec"
              title="Exports all generated salary PVs in this department, including paid PVs, using their saved receiving accounts. Use a specific PV's bank file below for one payment."
            >
              All generated PVs · includes paid
            </Link>
          ) : null}
        </>
      }
    >
      <div className="tiles">
        <div className="tile">
          <div className="l">{showGeneration ? 'Selected net to pay' : 'Net salary'}</div>
          <div className="v" aria-live="polite">{formatMoneyBare(showGeneration ? selection.total : g.net)}</div>
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

      {showGeneration ? (
        <div className="pay-selection">
          <h4>{gran === 'department' ? 'Generate by Department' : 'Manual generate'}</h4>
          <p aria-live="polite">
            <b>{selection.count} of {eligiblePeople} selected</b> · RM {formatMoneyBare(selection.total)} · {selection.voucherCount} PV{selection.voucherCount === 1 ? '' : 's'}
          </p>
          <span>{hasSplit
            ? (gran === 'department' ? 'Remaining net basic and commission are grouped into separate PVs. Choose the receiving account for each payment.' : 'Select net basic and commission independently. Each selected payment gets its own PV and receiving account.')
            : gran === 'department' ? 'All remaining people are included in one grouped PV.' : 'Select employees below. Each selected employee gets one PV.'} Payments already covered by a PV are excluded.</span>
        </div>
      ) : null}

      {showGeneration || pendingVouchers.length > 0 ? (
        <div className="wctl">
          <label className="f" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgb(var(--graphite))' }}>Pay date</span>
            <input type="date" className="pay-date" aria-label="Pay date" value={date} onChange={(e) => onDate(e.target.value)} disabled={locked} />
          </label>
          <span style={{ flex: 1 }} />
          {showGeneration ? (
            <button
              type="button"
              className="pay-btn pri"
              onClick={onAskGenerate}
              disabled={!canGenerate || busy != null || confirming}
              title={!funded ? 'Funding is not complete yet' : selection.count === 0 ? 'Select at least one payment' : selection.missingAccounts.length ? 'Complete the selected receiving bank accounts first' : undefined}
            >
              Review PVs
            </button>
          ) : pendingVouchers.length > 0 ? (
            <button
              type="button"
              className="pay-btn sec"
              onClick={onSaveDates}
              disabled={busy != null || !dateChanged || !validPaymentDate(date)}
            >
              {busy === `date:${g.key}` ? 'Saving…' : `Save date on ${pendingVouchers.length} PV${pendingVouchers.length === 1 ? '' : 's'}`}
            </button>
          ) : null}
        </div>
      ) : null}

      {showGeneration && g.stage === 'partial' ? (
        <p className="text-xs" style={{ margin: 0 }}>
          {g.generated} of {g.headcount} already have a voucher. {gran === 'department' ? `The remaining ${remaining} people are included in this batch.` : `Select any of the remaining ${remaining} people for this batch.`}
        </p>
      ) : null}

      {showGeneration && confirming ? (
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
            <span className="pay-selected-names">{selection.selectedPeople.map((person) => person.name).join(' · ')}</span>
            <span className="block mt-2">{selection.selected.map(line => <span className="block" key={line.key}>
              {line.person.name} · {salaryComponentLabel(line.component)} · RM {formatMoneyBare(line.amount)}
              {line.person.scope === 'staff' ? ` → ${line.account === 'account_2' ? 'Account 2' : 'Account 1'} · ${line.recipient.bankName ?? 'No bank'} ···${String(line.recipient.accountNo ?? '').slice(-4)}` : ''}
            </span>)}</span>
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
      {showGeneration && selection.missingAccounts.length > 0 ? <p className="text-danger text-xs" role="alert">Complete the receiving bank details for the selected payments before generating PVs.</p> : null}
      {showGeneration && selection.negativeComponents.length > 0 ? <p className="text-danger text-xs" role="alert">A selected employee has a negative basic or commission balance. Correct payroll before generating payments.</p> : null}

      <div className="pay-table-wrap">
        <table className="pay-statement-table pay-people-table" aria-label={`${g.name} employees and PVs`}>
          <thead>
            <tr>
              {showSelection ? <th scope="col" className="pick"><input type="checkbox" aria-label={hasSplit ? 'Select all remaining payments' : 'Select all remaining employees'} checked={selection.lineCount === selection.eligible.length && selection.lineCount > 0} onChange={(e) => onSelection(e.target.checked ? null : [])} disabled={locked} /></th> : null}
              <th scope="col">Employee</th>
              <th scope="col">Bank</th>
              <th scope="col" className="right">Net · RM</th>
              <th scope="col" className="right">vs {prevMonthName}</th>
              <th scope="col">PV</th>
              <th scope="col" className="state-cell">Status</th>
            </tr>
          </thead>
          <tbody>
            {selection.lines.map((payment) => {
              const p = payment.person
              const issue = bankIssue({ ...p, bank_name: payment.recipient.bankName, bank_account_no: payment.recipient.accountNo })
              const pd = delta(p.net, p.prev_net)
              const v = payment.voucher
              const missingBankSnapshot = !!v && (issue === 'missing_account' || issue === 'missing_bank')
              const line = v?.granularity === 'department'
              const eligible = payment.amount > 0 && !v
              const pickId = payment.component === 'net' ? p.row_id : payment.key
              const label = salaryComponentLabel(payment.component)
              const accountsAvailable = availableStaffBankAccounts(p)
              return (
                <tr key={payment.key} className={isNotableMove(pd) ? 'moved' : undefined} title={isNotableMove(pd) ? `Moved 20% or more vs ${prevMonthName}` : undefined}>
                  {showSelection ? <td className="pick"><input type="checkbox" aria-label={`Select ${p.name}${payment.component === 'net' ? '' : ` — ${label}`}`} checked={selectedSet.has(payment.key)} disabled={!eligible || locked} title={!eligible ? 'Already has a PV or no salary due for this payment' : undefined} onChange={(e) => onSelection(e.target.checked ? [...selectionIds, pickId] : selectionIds.filter((id) => id !== pickId))} /></td> : null}
                  <td className="who">
                    <span className="nm">{p.name}</span>
                    {p.code ? <span className="cd">{p.code}</span> : null}
                    {payment.component !== 'net' ? <span className="block text-xs text-graphite">{label}</span> : null}
                  </td>
                  <td className={`bank${issue && !missingBankSnapshot ? ' bad' : ''}`}>
                    {p.scope === 'directors' ? (
                      <span className="text-muted">director account</span>
                    ) : missingBankSnapshot ? (
                      <span className="text-muted">Bank details not recorded</span>
                    ) : showGeneration && eligible && onAccount ? (
                      <>
                        <select aria-label={`${p.name} — ${label} bank account`} value={payment.account} disabled={locked}
                          className="pay-date max-w-full" onChange={e => onAccount(payment.key, e.target.value as BankAccountSelection)}>
                          {(['account_1', 'account_2'] as const).map(account => {
                            const choice = accountsAvailable.find(a => a.selection === account)
                            return <option key={account} value={account} disabled={!choice}>
                              {account === 'account_1' ? 'Account 1' : 'Account 2'}{choice ? ` · ${choice.bankName} ···${choice.accountNo.slice(-4)}` : ' · not configured'}
                            </option>
                          })}
                        </select>
                        {issue && p.staff_id ? <Link href={`/team/people/${p.staff_id}`} className="block text-xs text-danger hover:underline">Complete receiving account →</Link> : null}
                      </>
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
                        <span className="text-xs">{payment.account === 'account_2' ? 'Account 2' : 'Account 1'} · </span>
                        {payment.recipient.bankName} <span className="text-muted">····</span>
                        {String(payment.recipient.accountNo ?? '').slice(-4)}
                      </>
                    )}
                  </td>
                  <td className="num">{formatMoneyBare(payment.amount)}</td>
                  <td className="num">
                    {payment.component !== 'net' ? <span className="text-muted">—</span> : pd ? (
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
                    ) : payment.amount > 0 ? (
                      <span className="pv none">—</span>
                    ) : (
                      <span className="pv none">net 0</span>
                    )}
                    {v && p.scope === 'staff' ? <Link
                      href={`/hr-costing/payroll/${period}/bank-transfer?format=alliance&vouchers=${v.id}`}
                      className="block text-xs text-accent hover:underline"
                      aria-label={`Bank file for ${v.no ?? v.id}`}
                      title="Only this PV's saved payment lines and recipient accounts"
                    >Bank file · this PV</Link> : null}
                  </td>
                  <td className="state-cell">{payment.amount > 0 ? chip(v?.status, v?.payment_date) : <span className="pay-state chip whitespace-nowrap"><span className="dot" />No salary due</span>}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="font-semibold" colSpan={showSelection ? 3 : 2}>
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
