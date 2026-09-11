'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatMoneyBare } from '@/lib/utils'
import { calculateRevenuePayrollSplit } from '@/lib/revenue-payroll'
import {
  dirtyFields,
  editFromRow,
  formatAmount,
  PAYROLL_FIELD_LABELS,
  PAYROLL_EDIT_FIELDS,
  type PayrollEdit,
  type PayrollEditField,
} from '@/lib/payroll-grid'
import { updatePayrollRow } from '../actions'
import { usePayrollDraft } from './PayrollDraftContext'
import AmountInput from './AmountInput'
import PaycheckWindow from './PaycheckWindow'
import type { PayrollRowData } from './PayrollGrid'

interface Props {
  row: PayrollRowData
  period: string
  /** Position in the grid's display order — the paycheck window's "n / N". */
  index: number
  count: number
  /** Zebra, counted inside the department so a band never breaks the stripe. */
  alt: boolean
  /** Department folded away. Hidden, not unmounted, so unsaved edits survive. */
  hidden: boolean
  showRevenueSplit?: boolean
  /** This row's paycheck window is up. */
  open: boolean
  onOpen: () => void
  onClose: () => void
  onStep: (dir: -1 | 1) => void
  selected: boolean
  onToggleSelect: () => void
  selectDisabled: boolean
}

/**
 * One person, one line. The row owns the working copy of the nine editable
 * figures; the paycheck window renders from — and writes to — that same
 * state, so it is a second view of the row rather than a copy of it.
 */
export default function PayrollRow({
  row,
  period,
  index,
  count,
  alt,
  hidden,
  showRevenueSplit = false,
  open,
  onOpen,
  onClose,
  onStep,
  selected,
  onToggleSelect,
  selectDisabled,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [edit, setEdit] = useState<PayrollEdit>(() => editFromRow(row))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trRef = useRef<HTMLTableRowElement>(null)
  const chevRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const savedEditRef = useRef(editFromRow(row))

  const locked = row.status !== 'draft'
  const dirtyList = dirtyFields(edit, row, { commissionDerived: row.commission_is_derived })
  const dirty = dirtyList.length > 0
  const revenuePayroll = row.revenue_payroll ?? row.source === 'commission'
  const split = revenuePayroll ? calculateRevenuePayrollSplit(row) : null
  const statementHref = row.commission_statements?.[0]?.href ?? row.commission_statement_href
  const sourceLinked = row.source === 'commission' && Boolean(row.commission_statements?.length || row.commission_statement_href)

  // Sync clean fields after a server refresh while retaining the user's
  // unsaved work. The Revenue run always owns the gross commission field.
  useEffect(() => {
    const previous = savedEditRef.current
    const next = editFromRow(row)
    savedEditRef.current = next
    setEdit(current => {
      const merged = { ...current }
      for (const field of PAYROLL_EDIT_FIELDS) {
        if ((field === 'commission_amount' && row.commission_is_derived) || current[field] === previous[field]) {
          merged[field] = next[field]
        }
      }
      return PAYROLL_EDIT_FIELDS.some(field => merged[field] !== current[field]) ? merged : current
    })
  }, [row])

  // Report pending edits to the page-level draft context — powers the
  // header Save button and blocks Submit to Finance while unsaved.
  const { setRowEdit } = usePayrollDraft()
  useEffect(() => {
    const update: Partial<PayrollEdit> = { ...edit }
    if (row.commission_is_derived) delete update.commission_amount
    setRowEdit(row.id, dirty && !locked ? update : null)
  }, [row.id, row.commission_is_derived, dirty, locked, edit, setRowEdit])
  useEffect(() => () => setRowEdit(row.id, null), [row.id, setRowEdit])

  // Opening scrolls the row into view (‹ › in the window can land anywhere
  // in the list); closing hands focus back to the chevron that opened it.
  useEffect(() => {
    if (open) {
      trRef.current?.scrollIntoView({ block: 'nearest' })
      wasOpen.current = true
    } else if (wasOpen.current) {
      wasOpen.current = false
      chevRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  function setField(field: PayrollEditField, value: number) {
    setError(null)
    setSaved(false)
    setEdit(prev => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const update: Partial<PayrollEdit> = { ...edit }
        if (row.commission_is_derived) delete update.commission_amount
        await updatePayrollRow(row.id, update)
        setSaved(true)
        router.refresh()
        setTimeout(() => setSaved(false), 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  // An editable figure — a field on a draft row, a bare figure once the
  // month has been submitted.
  const cell = (field: PayrollEditField, decimals = 2) =>
    locked ? (
      <span className={cn('num', row[field] === 0 && 'zero')}>
        {formatAmount(row[field], decimals)}
      </span>
    ) : (
      <AmountInput
        value={edit[field]}
        onChange={v => setField(field, v)}
        decimals={decimals}
        disabled={isPending}
        dirty={dirtyList.includes(field)}
        aria-label={`${PAYROLL_FIELD_LABELS[field]} — ${row.staff_name}`}
      />
    )

  const num = (value: number, extra?: string) => (
    <td className={cn('num', value === 0 && 'zero', extra)}>{formatMoneyBare(value)}</td>
  )

  return (
    <>
      <tr
        ref={trRef}
        hidden={hidden}
        className={cn('pg-row', alt && 'alt', open && 'open', dirty && !locked && 'dirty')}
      >
        <td className="pg-st l0 pg-chk">
          <input
            type="checkbox"
            aria-label={`Select ${row.staff_name}`}
            checked={selected}
            disabled={locked || sourceLinked || selectDisabled}
            onChange={onToggleSelect}
            className="w-3.5 h-3.5 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
            title={locked ? `Cannot delete — status is ${row.status}` : sourceLinked ? 'Revenue rows are managed from the commission calculation' : undefined}
          />
        </td>
        <td className="pg-st l1 pg-name">
          <button
            type="button"
            className="pg-name-btn"
            onClick={open ? onClose : onOpen}
            title={`${row.staff_name} — open paycheck`}
          >
            {row.staff_name}
          </button>
        </td>
        {num(row.gross, 'pg-st l2 pg-gross')}
        {num(row.net, 'pg-st l3 pg-net')}
        <td className="pg-st l4 pg-act">
          {dirty && !locked && (
            <button
              type="button"
              className="pg-save"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? '…' : 'Save'}
            </button>
          )}
          {saved && <span className="text-xs font-serif italic text-ledger mr-1">✓</span>}
          {error && (
            <span className="text-xs font-serif italic text-danger mr-1" title={error}>
              !
            </span>
          )}
          <button
            ref={chevRef}
            type="button"
            className="icon-btn chev"
            aria-expanded={open}
            aria-label={open ? 'Close paycheck' : 'Open paycheck'}
            onClick={open ? onClose : onOpen}
          >
            ▾
          </button>
        </td>

        {showRevenueSplit && (
          <>
            <td className={cn('num g1', split?.basicPay === 0 && 'zero', split && split.basicPay < 0 && 'neg')} data-label="Basic pay" title={row.payout_split_version === 2 ? 'Net basic after employee statutory and PCB' : 'Saved basic payout'}>
              {split ? formatMoneyBare(split.basicPay) : '—'}
            </td>
            <td
              className={cn('num', split?.commissionBalance === 0 && 'zero')}
              data-label="Commission balance"
              title={split ? (row.payout_split_version === 2 ? 'Commission remaining after net basic and all employee/employer statutory. Recomputed when saved.' : 'Historical saved commission split') : undefined}
            >
              {split ? <span className={split.shortfall > 0 ? 'neg' : undefined}>{formatMoneyBare(split.commissionBalance)}</span> : '—'}
            </td>
          </>
        )}
        <td className="pg-ed g1">{cell('basic_salary')}</td>
        <td className="pg-ed">{cell('statutory_allowance')}</td>
        <td className="pg-ed">{cell('non_statutory_allowance')}</td>
        <td className="pg-ed">{cell('ot_amount')}</td>
        {row.commission_is_derived ? (
          <td className={cn('num derived', row.commission_amount === 0 && 'zero')}>
            {(row.commission_statements?.length ?? 0) > 1 ? (
              <button
                type="button"
                onClick={onOpen}
                className="text-accent underline decoration-dotted underline-offset-4"
                title="Open paycheck to view all commission statements behind this figure"
              >
                {formatMoneyBare(row.commission_amount)}
              </button>
            ) : statementHref ? (
              <a
                href={statementHref}
                title="This figure comes from the commission run — open the statement behind it"
              >
                {formatMoneyBare(row.commission_amount)}
              </a>
            ) : (
              <span title="Compute the commission run for this month to fill this in">
                {formatMoneyBare(row.commission_amount)}
              </span>
            )}
          </td>
        ) : (
          <td className="pg-ed">{cell('commission_amount')}</td>
        )}

        <td className="pg-ed g1">{cell('unpaid_leave_days', 1)}</td>
        <td className="pg-ed">{cell('deduction_amount')}</td>
        <td className="pg-ed">{cell('skbbk_amount')}</td>

        {num(row.epf_er, 'g1')}
        {num(row.socso_er)}
        {num(row.eis_er)}
      </tr>

      {open && (
        <PaycheckWindow
          row={row}
          period={period}
          index={index}
          count={count}
          edit={edit}
          dirtyList={dirtyList}
          locked={locked}
          isPending={isPending}
          saved={saved}
          error={error}
          onField={setField}
          onSave={handleSave}
          onClose={onClose}
          onStep={onStep}
        />
      )}
    </>
  )
}
