'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatMoneyBare } from '@/lib/utils'
import {
  dirtyFields,
  editFromRow,
  formatAmount,
  PAYROLL_FIELD_LABELS,
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

  const locked = row.status !== 'draft'
  const dirtyList = dirtyFields(edit, row, { commissionDerived: row.commission_is_derived })
  const dirty = dirtyList.length > 0

  // Report pending edits to the page-level draft context — powers the
  // header Save button and blocks Submit to Finance while unsaved.
  const { setRowEdit } = usePayrollDraft()
  useEffect(() => {
    setRowEdit(row.id, dirty && !locked ? edit : null)
  }, [row.id, dirty, locked, edit, setRowEdit])
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
        await updatePayrollRow(row.id, edit)
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
            disabled={locked || selectDisabled}
            onChange={onToggleSelect}
            className="w-3.5 h-3.5 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
            title={locked ? `Cannot delete — status is ${row.status}` : undefined}
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

        <td className="pg-ed g1">{cell('basic_salary')}</td>
        <td className="pg-ed">{cell('statutory_allowance')}</td>
        <td className="pg-ed">{cell('non_statutory_allowance')}</td>
        <td className="pg-ed">{cell('ot_amount')}</td>
        {row.commission_is_derived ? (
          <td className={cn('num derived', row.commission_amount === 0 && 'zero')}>
            {row.commission_statement_href ? (
              <a
                href={row.commission_statement_href}
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
