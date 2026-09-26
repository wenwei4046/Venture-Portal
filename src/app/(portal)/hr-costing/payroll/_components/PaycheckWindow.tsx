'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn, formatMoneyBare } from '@/lib/utils'
import { calculateRevenuePayrollSplit } from '@/lib/revenue-payroll'
import {
  formatAmount,
  periodLabel,
  PAYROLL_FIELD_LABELS,
  type PayrollEdit,
  type PayrollEditField,
} from '@/lib/payroll-grid'
import AmountInput from './AmountInput'
import RevenuePayoutBreakdown from './RevenuePayoutBreakdown'
import EditableStatLine from '../[period]/[staffId]/payslip/_components/EditableStatLine'
import ResetStaffStatutoryButton from '../[period]/[staffId]/payslip/_components/ResetStaffStatutoryButton'
import type { PayrollRowData } from './PayrollGrid'

interface Props {
  row: PayrollRowData
  period: string
  /** Position in the grid's display order — "n / N" in the header, ‹ › step through it. */
  index: number
  count: number
  edit: PayrollEdit
  dirtyList: PayrollEditField[]
  locked: boolean
  isPending: boolean
  saved: boolean
  error: string | null
  onField: (field: PayrollEditField, value: number) => void
  onSave: () => void
  onClose: () => void
  onStep: (dir: -1 | 1) => void
}

/**
 * One person's paycheck as a floating window over the grid. It is a second
 * view of the row's figures, not a copy: the inputs here write the same
 * `edit` state the row's cells write, so a change in either place shows in
 * both and Save from either side saves the same thing. Computed figures
 * (ER / EE, PCB or WHT, cost to company) are the saved ones — the trigger
 * recomputes them when the row is saved.
 */
export default function PaycheckWindow({
  row,
  period,
  index,
  count,
  edit,
  dirtyList,
  locked,
  isPending,
  saved,
  error,
  onField,
  onSave,
  onClose,
  onStep,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Focus lands on the dialog itself so Escape and screen readers see it;
  // the first field is one Tab away.
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true })
  }, [row.id])

  const dirty = dirtyList.length > 0
  const revenuePayroll = row.revenue_payroll ?? row.source === 'commission'
  const split = revenuePayroll ? calculateRevenuePayrollSplit(row) : null
  const netBasicSplit = row.payout_split_version === 2
  const statements = row.commission_statements ?? []
  const statementHref = statements[0]?.href ?? row.commission_statement_href
  const ctc = row.gross + row.epf_er + row.socso_er + row.eis_er
  // PCB and Withholding Tax are mutually exclusive — whichever the staff
  // record selects applies, the other is 0.
  const tax: [string, number] =
    row.withholding_tax > 0 ? ['Withholding tax', row.withholding_tax] : ['PCB', row.pcb]

  const amount = (f: PayrollEditField, decimals = 2, className?: string) =>
    locked ? (
      <span className={cn('ro num', row[f] === 0 && 'zero', className)}>
        {formatAmount(row[f], decimals)}
      </span>
    ) : (
      <AmountInput
        value={edit[f]}
        onChange={v => onField(f, v)}
        decimals={decimals}
        disabled={isPending}
        dirty={dirtyList.includes(f)}
        className={className}
        aria-label={PAYROLL_FIELD_LABELS[f]}
      />
    )

  const kv = (label: string, value: ReactNode, opts: { big?: boolean; sub?: string; zero?: boolean } = {}) => (
    <div className={cn('kv', opts.big && 'big')}>
      <span>
        {label}
        {opts.sub && <small>{opts.sub}</small>}
      </span>
      <span className={cn('num', opts.zero && 'zero')}>{value}</span>
    </div>
  )

  let chip: { cls: string; text: string }
  if (error) chip = { cls: 'danger', text: 'Save failed' }
  else if (saved) chip = { cls: 'ledger', text: 'Saved ✓ · statutory recomputes' }
  else if (locked) chip = { cls: 'info', text: `${row.status} · read only` }
  else if (dirty) chip = { cls: 'alert', text: 'Unsaved changes' }
  else chip = { cls: 'info', text: 'No unsaved changes' }

  // Portalled to <body>, outside the sheet, so it carries the sheet's palette
  // itself (`sheet-theme` on a box-less wrapper).
  return createPortal(
    <div className="sheet-theme contents">
      <div className="pg-scrim" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        className="pg-win"
        role="dialog"
        aria-modal="true"
        aria-label={`${row.staff_name} — paycheck`}
        tabIndex={-1}
      >
        <div className="pg-win-h">
          <div className="min-w-0">
            <div className="page-eyebrow">
              <em>
                {index + 1}/{count}
              </em>
              PAYCHECK · {periodLabel(period).toUpperCase()} · {row.dept_name.toUpperCase()}
            </div>
            <h2>{row.staff_name}</h2>
          </div>
          <div className="nav">
            <button
              type="button"
              className="icon-btn solid"
              onClick={() => onStep(-1)}
              disabled={index === 0}
              aria-label="Previous person"
            >
              ‹
            </button>
            <button
              type="button"
              className="icon-btn solid"
              onClick={() => onStep(1)}
              disabled={index >= count - 1}
              aria-label="Next person"
            >
              ›
            </button>
            <button type="button" className="icon-btn solid" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className="pg-slip">
          {split && (
            <section className="col-span-full mb-5" aria-label="Revenue payout split">
              <h4>Revenue payout <span>{split.basicPay === 0 ? 'Full commission · RM' : 'RM'}</span></h4>
              {/* One person's three payout figures — the workbench's summary
                  boxes (a person's ledger), not a page's summary cards. */}
              <div className="grid gap-2.5 sm:grid-cols-3">
                <PayoutFigure label={netBasicSplit ? 'Net basic · salary PV' : 'Basic pay'}>
                  {formatMoneyBare(split.basicPay)}
                </PayoutFigure>
                <PayoutFigure label="Commission balance" negative={split.shortfall > 0}>
                  {formatMoneyBare(split.commissionBalance)}
                </PayoutFigure>
                <PayoutFigure label={netBasicSplit ? 'Total to employee' : 'Total before other adjustments'}>
                  {formatMoneyBare(split.totalPayout)}
                </PayoutFigure>
              </div>
              {netBasicSplit ? <RevenuePayoutBreakdown row={row} /> : <p className="text-xs mt-3">
                Gross commission {formatMoneyBare(row.commission_amount)} − basic pay {formatMoneyBare(split.basicPay)}
                {' '}− EPF ER {formatMoneyBare(row.epf_er)} − EPF EE {formatMoneyBare(row.epf_ee)}
                {' '}= commission balance {formatMoneyBare(split.commissionBalance)}.
                {' '}Basic pay is paid in full; both EPF shares are taken from the commission balance.
                {' '}Allowances, other deductions and tax are reflected in Net to bank.
              </p>}
              {dirty && <p className="sheet-warning">These are saved amounts. Save changes to recalculate the payout and statutory contributions.</p>}
              {split.shortfall > 0 && (
                <p className="text-xs text-danger mt-2">Commission is short by RM {formatMoneyBare(split.shortfall)}. Review the basic pay before settlement.</p>
              )}
              {split.basicShortfall > 0 && <p className="text-xs text-danger mt-2">Basic deductions exceed the basic salary by RM {formatMoneyBare(split.basicShortfall)}. Review before settlement.</p>}
            </section>
          )}
          <section>
            <h4>
              Earnings <span>RM</span>
            </h4>
            <Field label="Basic salary">{amount('basic_salary')}</Field>
            <Field label="Statutory allowance">{amount('statutory_allowance')}</Field>
            <Field label="Non-statutory allowance">{amount('non_statutory_allowance')}</Field>
            <Field label="Overtime" sub="hours · amount">
              <span className="pair">
                {amount('ot_hours', 1, 'hrs')}
                {amount('ot_amount')}
              </span>
            </Field>
            {row.commission_is_derived ? (
              <Field label={revenuePayroll ? 'Gross commission' : 'Commission'} sub={revenuePayroll ? 'synced commission + payroll adjustment' : 'from Revenue commission calculation'}>
                {statementHref && statements.length <= 1 ? (
                  <a
                    className="ro num link"
                    href={statementHref}
                    title="Open the statement behind this figure"
                  >
                    {formatMoneyBare(row.commission_amount)}
                  </a>
                ) : (
                  <span
                    className={cn('ro num', row.commission_amount === 0 && 'zero')}
                    title={revenuePayroll ? 'Synced commission plus the saved payroll adjustment' : statements.length > 1 ? 'Combined amount from the commission statements below' : 'Compute the commission run for this month to fill this in'}
                  >
                    {formatMoneyBare(row.commission_amount)}
                  </span>
                )}
              </Field>
            ) : (
              <Field label="Commission">{amount('commission_amount')}</Field>
            )}
            {row.commission_is_derived && statements.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs" aria-label="Commission statements">
                {statements.map(statement => (
                  <a key={statement.href} href={statement.href} className="text-accent underline underline-offset-2">
                    {statement.label} statement ↗
                  </a>
                ))}
              </div>
            )}
          </section>

          <section>
            <h4>
              Deductions <span>RM</span>
            </h4>
            <Field
              label="Unpaid leave"
              sub={`days · pro-rata ${row.prorata_days_worked} / ${row.prorata_days_in_month}`}
            >
              {amount('unpaid_leave_days', 1)}
            </Field>
            <Field label="Deduction">{amount('deduction_amount')}</Field>
            <Field label="SKBBK" sub="net only — gross and statutory unaffected">
              {amount('skbbk_amount')}
            </Field>
          </section>

          <section className="c3">
            <h4>
              Computed <span>ER / EE</span>
            </h4>
            {kv('Pro-rata', `${row.prorata_days_worked} / ${row.prorata_days_in_month} days`)}
            {kv('EPF', `${formatMoneyBare(row.epf_er)} / ${formatMoneyBare(row.epf_ee)}`, {
              zero: row.epf_er === 0 && row.epf_ee === 0,
            })}
            {kv('SOCSO', `${formatMoneyBare(row.socso_er)} / ${formatMoneyBare(row.socso_ee)}`, {
              zero: row.socso_er === 0 && row.socso_ee === 0,
            })}
            {kv('EIS', `${formatMoneyBare(row.eis_er)} / ${formatMoneyBare(row.eis_ee)}`, {
              zero: row.eis_er === 0 && row.eis_ee === 0,
            })}
            {kv(tax[0], netBasicSplit && row.withholding_tax === 0
              ? <EditableStatLine payrollId={row.id} field="pcb" value={row.pcb} readOnly={locked || dirty || isPending} />
              : formatMoneyBare(tax[1]), { zero: tax[1] === 0 })}
            {netBasicSplit && row.pcb_override_amount != null && <div className="text-xs mt-2">
              Manual PCB amount
              {!locked && !dirty && !isPending && <ResetStaffStatutoryButton payrollId={row.id} overridden />}
            </div>}
            {kv('Cost to company', formatMoneyBare(ctc), { sub: 'gross + employer' })}
            {kv('Gross', formatMoneyBare(row.gross), { big: true })}
            {kv('Net to bank', formatMoneyBare(row.net), { big: true })}
          </section>

          <div className="foot">
            {/* A plain span, not `.meta`: that class sets the slip's old
                italic caption, and the sheet's lettering is upright. */}
            <span className="text-[12px]">
              Source {row.source} · status {row.status}
              <span className={`chip ${chip.cls} ml-2`} title={error ?? undefined}>
                <span className="dot" />
                {chip.text}
              </span>
            </span>
            <span className="btns">
              <a
                className="pg-btn"
                href={`/hr-costing/payroll/${period}/${row.staff_id}/payslip`}
                title="Open payslip"
              >
                Payslip ↗
              </a>
              {!locked && (
                <button
                  type="button"
                  className="pg-btn pri"
                  onClick={onSave}
                  disabled={!dirty || isPending}
                >
                  {isPending ? 'Saving…' : 'Save'}
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PayoutFigure({ label, negative, children }: { label: string; negative?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-surface-2 px-[15px] py-[13px]">
      <p className="text-[11px] leading-normal">{label}</p>
      <p className={cn('mt-[5px] text-[19px] font-bold leading-tight tracking-[-0.025em] tabular-nums', negative && 'text-danger')}>
        {children}
      </p>
    </div>
  )
}

function Field({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="f">
      <label>
        {label}
        {sub && <small>{sub}</small>}
      </label>
      {children}
    </div>
  )
}
