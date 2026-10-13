'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatMoneyBare } from '@/lib/utils'
import { calculateRevenuePayrollSplit } from '@/lib/revenue-payroll'
import {
  dirtyFields,
  editFromRow,
  formatAmount,
  isStatutoryField,
  parseAmount,
  PAYROLL_FIELD_LABELS,
  PAYROLL_EDIT_FIELDS,
  rowUpdateFromEdit,
  TYPED_STATUTORY_HINT,
  type PayrollEdit,
  type PayrollEditField,
} from '@/lib/payroll-grid'
import { updatePayrollRow, type PayrollRowUpdate } from '../actions'
import { usePayrollDraft } from './PayrollDraftContext'
import AmountInput from './AmountInput'
import PaycheckWindow from './PaycheckWindow'
import RevenueCommissionEditor from './RevenueCommissionEditor'
import { adjustRevenueCommission, type RevenueCommissionAdjustmentInput } from '../commission-actions'
import type { StatusView } from '@/lib/payroll-lifecycle'
import type { PayrollRowData } from './PayrollGrid'
import type { RowMenuAnchor } from './PayrollRowMenu'

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
  /** Where this person's pay stands — the frozen Status column. */
  status: StatusView
  /** This row's paycheck window is up. */
  open: boolean
  onOpen: () => void
  onClose: () => void
  onStep: (dir: -1 | 1) => void
  selected: boolean
  onToggleSelect: () => void
  selectDisabled: boolean
  /** Why the tick box is disabled (a submitted row, a salesperson, a director). */
  selectHint?: string
  /** Open this person's menu — right-click, or the ⋯ button. */
  onMenu: (anchor: RowMenuAnchor) => void
}

/**
 * One person, one line. The row owns the working copy of the sixteen editable
 * figures — nine inputs and, since 2026-09-30, the seven statutory ones; the
 * paycheck window renders from — and writes to — that same state, so it is a
 * second view of the row rather than a copy of it. The name or the ⋯ menu
 * opens it (the row's own ▾ went 2026-09-30: it did what those two do).
 */
export default function PayrollRow({
  row,
  period,
  index,
  count,
  alt,
  hidden,
  showRevenueSplit = false,
  status,
  open,
  onOpen,
  onClose,
  onStep,
  selected,
  onToggleSelect,
  selectDisabled,
  selectHint,
  onMenu,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [edit, setEdit] = useState<PayrollEdit>(() => editFromRow(row))
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [commissionInputError, setCommissionInputError] = useState<string | null>(null)
  const saveRef = useRef<HTMLButtonElement>(null)
  const reviewResultRef = useRef<((saved: boolean) => void) | null>(null)
  const requestReviewRef = useRef<() => Promise<boolean>>(null)
  const trRef = useRef<HTMLTableRowElement>(null)
  const nameRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const savedEditRef = useRef(editFromRow(row))

  // Directors are keyed on Director Salary; everybody past draft waits in
  // their batch (Unlock, or Resubmit, to change them).
  const director = row.scope === 'directors'
  const locked = row.status !== 'draft' || director
  const revenuePayroll = row.revenue_payroll ?? row.source === 'commission'
  const split = revenuePayroll ? calculateRevenuePayrollSplit(row) : null
  const reviewedCommissionSource = row.commission_confirmed_amount ?? row.commission_synced_amount
  const commissionEditable = !!split && row.payout_split_version === 2 && reviewedCommissionSource != null
  const dirtyList = dirtyFields(edit, row, { commissionDerived: row.commission_is_derived && !commissionEditable })
  const commissionDirty = commissionEditable && (dirtyList.includes('commission_amount') || !!commissionInputError)
  const regularDirty = dirtyList.some(field => field !== 'commission_amount' || !row.commission_is_derived)
  const dirty = dirtyList.length > 0 || commissionDirty
  const statementHref = row.commission_statements?.[0]?.href ?? row.commission_statement_href
  const typed = new Set(row.statutory_typed ?? [])
  // PCB is somebody's only on PCB; withholding tax and "none" compute it as 0.
  const taxMode = row.tax_mode ?? (row.withholding_tax > 0 ? 'withholding' : 'pcb')

  // Sync clean fields after a server refresh while retaining the user's
  // unsaved work, including a Gross Commission amount awaiting review.
  // Nothing saved moved (the first run, or a refresh that left this row
  // alone) → no setState at all: a no-op update queued while the page
  // hydrates can sit unprocessed in a low lane, and every later render then
  // re-derives `edit` as a new object (2026-09-30, the grid froze in a loop).
  useEffect(() => {
    const previous = savedEditRef.current
    const next = editFromRow(row)
    savedEditRef.current = next
    const derivedCommission = row.commission_is_derived && !commissionEditable
    if (!derivedCommission && PAYROLL_EDIT_FIELDS.every(field => previous[field] === next[field])) return
    setEdit(current => {
      const merged = { ...current }
      for (const field of PAYROLL_EDIT_FIELDS) {
        if ((field === 'commission_amount' && derivedCommission) || current[field] === previous[field]) {
          merged[field] = next[field]
        }
      }
      return PAYROLL_EDIT_FIELDS.some(field => merged[field] !== current[field]) ? merged : current
    })
  }, [row, commissionEditable])

  // Report pending edits to the page-level draft context — powers the
  // header Save button and blocks Submit to Finance while unsaved. Keyed on
  // the figures, not on `edit`'s identity, so a re-derived but equal `edit`
  // reports nothing — reporting re-renders every row on the page.
  const { setRowEdit, setCommissionReview } = usePayrollDraft()
  const draftKey = regularDirty && !locked
    ? JSON.stringify(rowUpdateFromEdit(edit, row, { commissionDerived: row.commission_is_derived }))
    : null
  useEffect(() => {
    setRowEdit(row.id, draftKey ? (JSON.parse(draftKey) as PayrollRowUpdate) : null)
  }, [row.id, draftKey, setRowEdit])
  useEffect(() => () => setRowEdit(row.id, null), [row.id, setRowEdit])
  useEffect(() => {
    setCommissionReview(row.id, commissionDirty && !locked ? () => requestReviewRef.current!() : null)
    return () => setCommissionReview(row.id, null)
  }, [row.id, commissionDirty, locked, setCommissionReview])
  useEffect(() => () => { reviewResultRef.current?.(false) }, [])

  // Opening scrolls the row into view (‹ › in the window can land anywhere
  // in the list); closing hands focus back to the row's name.
  useEffect(() => {
    if (open) {
      trRef.current?.scrollIntoView({ block: 'nearest' })
      wasOpen.current = true
    } else if (wasOpen.current) {
      wasOpen.current = false
      nameRef.current?.focus({ preventScroll: true })
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
    if (commissionDirty) {
      void requestReviewRef.current?.()
      return
    }
    startTransition(async () => {
      try {
        await updatePayrollRow(row.id, rowUpdateFromEdit(edit, row, { commissionDerived: row.commission_is_derived }))
        setSaved(true)
        router.refresh()
        setTimeout(() => setSaved(false), 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  requestReviewRef.current = () => {
    if (commissionInputError) {
      setError(commissionInputError)
      return Promise.resolve(false)
    }
    if (locked || isPending || reviewOpen || reviewResultRef.current || !commissionEditable) return Promise.resolve(false)
    setError(null)
    setSaved(false)
    setReviewOpen(true)
    return new Promise(resolve => { reviewResultRef.current = resolve })
  }

  function closeReview() {
    setReviewOpen(false)
    reviewResultRef.current?.(false)
    reviewResultRef.current = null
  }

  async function handleCommissionAdjustment(input: RevenueCommissionAdjustmentInput) {
    // Send only changed ordinary inputs. The dedicated action saves these and
    // the reviewed adjustment atomically, so a rejected adjustment saves neither.
    const update: Partial<PayrollEdit> = {}
    for (const field of dirtyList) {
      if (field !== 'commission_amount') update[field] = Number(edit[field].toFixed(2))
    }
    await adjustRevenueCommission(row.id, input, update)
    setEdit(current => ({ ...current, ...update, commission_amount: input.gross }))
    setCommissionInputError(null)
    setSaved(true)
    reviewResultRef.current?.(true)
    reviewResultRef.current = null
    router.refresh()
    setTimeout(() => setSaved(false), 1500)
  }

  // An editable figure — a field on a draft row, a bare figure once the
  // month has been submitted. A statutory figure somebody typed carries its
  // accent dot either way.
  const cell = (field: PayrollEditField, decimals = 2) => {
    const manual = isStatutoryField(field) && typed.has(field)
    return locked ? (
      <span
        className={cn('num', row[field] === 0 && 'zero', manual && 'manual')}
        title={manual ? TYPED_STATUTORY_HINT : undefined}
      >
        {formatAmount(row[field], decimals)}
      </span>
    ) : (
      <AmountInput
        value={edit[field]}
        onChange={v => setField(field, v)}
        decimals={decimals}
        disabled={isPending}
        dirty={dirtyList.includes(field)}
        manual={manual}
        title={manual ? TYPED_STATUTORY_HINT : undefined}
        aria-label={`${PAYROLL_FIELD_LABELS[field]} — ${row.staff_name}`}
      />
    )
  }

  // PCB is typed only for somebody on PCB. The others have none to type:
  // their People record sets withholding tax (it sits in net) or no tax.
  const pcbCell = taxMode === 'pcb' ? cell('pcb') : (
    <span
      className="num zero"
      title={taxMode === 'withholding'
        ? `No PCB — withholding tax RM ${formatMoneyBare(row.withholding_tax)} applies instead (their People record)`
        : 'No PCB — their People record sets no tax'}
    >
      —
    </span>
  )

  const num = (value: number, extra?: string) => (
    <td className={cn('num', value === 0 && 'zero', extra)}>{formatMoneyBare(value)}</td>
  )

  const grossCommission = (row.commission_statements?.length ?? 0) > 1 ? (
    <button
      type="button"
      onClick={onOpen}
      className="text-accent underline decoration-dotted underline-offset-4"
      title="Open paycheck to view all commission statements behind this gross commission"
    >
      {formatMoneyBare(row.commission_amount)}
    </button>
  ) : statementHref ? (
    <a href={statementHref} title="Gross commission from the commission run — open the source statement">
      {formatMoneyBare(row.commission_amount)}
    </a>
  ) : (
    <span title="Gross commission before basic and statutory allocations">
      {formatMoneyBare(row.commission_amount)}
    </span>
  )

  return (
    <>
      <tr
        ref={trRef}
        hidden={hidden}
        className={cn('pg-row', alt && 'alt', open && 'open', dirty && !locked && 'dirty', director && 'director')}
        onContextMenu={event => {
          if (event.shiftKey) return
          event.preventDefault()
          onMenu({ left: event.clientX, top: event.clientY, bottom: event.clientY })
        }}
      >
        <td className="pg-st l0 pg-chk">
          <input
            type="checkbox"
            aria-label={`Select ${row.staff_name}`}
            checked={selected}
            disabled={selectDisabled}
            onChange={onToggleSelect}
            className="w-3.5 h-3.5 accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:outline-none"
            title={selectHint}
          />
        </td>
        <td className="pg-st l1 pg-name">
          {director ? (
            <a className="pg-name-btn" href={row.director_href ?? undefined} title={`${row.staff_name} — keyed on Director Salary`}>
              {row.staff_name}
            </a>
          ) : (
            <button
              ref={nameRef}
              type="button"
              className="pg-name-btn"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={open ? onClose : onOpen}
              title={`${row.staff_name} — open paycheck`}
            >
              {row.staff_name}
            </button>
          )}
        </td>
        <td className="pg-st l2 pg-status" title={status.detail}>
          <span className={cn('chip', status.tone !== 'muted' && status.tone)}>
            <span className="dot" />
            {status.label}
          </span>
        </td>
        {num(row.gross, 'pg-st l3 pg-gross')}
        {num(row.net, 'pg-st l4 pg-net')}
        <td className="pg-st l5 pg-act">
          {dirty && !locked && (
            <button
              ref={saveRef}
              type="button"
              className="pg-save"
              onClick={handleSave}
              disabled={isPending || reviewOpen}
            >
              {isPending ? '…' : 'Save'}
            </button>
          )}
          {saved && <span className="text-xs font-bold text-ledger mr-1">✓</span>}
          {error && (
            <span className="text-xs font-bold text-danger mr-1" title={error}>
              !
            </span>
          )}
          <button
            type="button"
            className="icon-btn more"
            aria-haspopup="menu"
            data-payroll-menu-trigger
            aria-label={`Actions for ${row.staff_name}`}
            title="Actions — or right-click the row"
            onClick={event => {
              const r = event.currentTarget.getBoundingClientRect()
              onMenu({ left: r.left, top: r.top, bottom: r.bottom })
            }}
          >
            ⋯
          </button>
        </td>

        {showRevenueSplit && (
          <>
            <td className={cn('num g1', split?.basicPay === 0 && 'zero', split && split.basicPay < 0 && 'neg')} data-label="Basic pay" title={row.payout_split_version === 2 ? 'Net basic after employee statutory and PCB' : 'Saved basic payout'}>
              {split ? formatMoneyBare(split.basicPay) : '—'}
            </td>
            <td
              className={cn(commissionEditable && !locked ? 'pg-ed' : 'num', split && !commissionEditable && row.commission_is_derived && 'derived', split && row.commission_amount === 0 && 'zero')}
              data-label="Gross Commission"
            >
              {split ? commissionEditable ? (
                <div className="relative" onChangeCapture={event => {
                  if (!(event.target instanceof HTMLInputElement)) return
                  setCommissionInputError(parseAmount(event.target.value) === null
                    ? 'Enter a valid Gross Commission amount of zero or more.' : null)
                }}>
                  {locked ? formatMoneyBare(row.commission_amount) : <AmountInput
                    value={edit.commission_amount}
                    onChange={value => setField('commission_amount', Math.round((value + Number.EPSILON) * 100) / 100)}
                    disabled={isPending || reviewOpen}
                    dirty={commissionDirty}
                    aria-label={`Gross Commission — ${row.staff_name}`}
                    aria-invalid={!!commissionInputError}
                    className={row.commission_adjustment_amount ? '!pl-5' : undefined}
                  />}
                  {!!row.commission_adjustment_amount && <button
                    type="button"
                    className="absolute inset-y-0 left-0 flex w-5 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    aria-label={`Commission adjustment ${row.commission_adjustment_amount > 0 ? '+' : '-'}RM ${formatMoneyBare(Math.abs(row.commission_adjustment_amount))} — ${row.staff_name}. Open details`}
                    title={`Adjustment ${row.commission_adjustment_amount > 0 ? '+' : '-'}RM ${formatMoneyBare(Math.abs(row.commission_adjustment_amount))}${row.commission_adjustment_reason ? ` · ${row.commission_adjustment_reason}` : ''}. Open paycheck for details.`}
                    onClick={onOpen}
                  ><span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" /></button>}
                </div>
              ) : <>
                {grossCommission}
                {row.payout_split_version === 2 && !locked && <span className="block text-xs text-muted" title="Confirm or sync the Revenue source before recording a payroll adjustment">Source needed</span>}
              </> : '—'}
            </td>
          </>
        )}
        <td className="pg-ed g1">{cell('basic_salary')}</td>
        <td className="pg-ed">{cell('statutory_allowance')}</td>
        <td className="pg-ed">{cell('non_statutory_allowance')}</td>
        <td className="pg-ed">{cell('ot_amount')}</td>
        {split ? (
          <td
            className={cn('num', split.commissionBalance === 0 && 'zero', split.shortfall > 0 && 'neg')}
            data-label="Balance"
            title={row.payout_split_version === 2 ? 'Commission remaining after net basic and all employee/employer statutory. Recomputed when saved.' : 'Historical saved commission split'}
          >
            {formatMoneyBare(split.commissionBalance)}
          </td>
        ) : row.commission_is_derived ? (
          <td className={cn('num derived', row.commission_amount === 0 && 'zero')}>
            {grossCommission}
          </td>
        ) : (
          <td className="pg-ed">{cell('commission_amount')}</td>
        )}

        <td className="pg-ed g1">{cell('unpaid_leave_days', 1)}</td>
        <td className="pg-ed">{cell('deduction_amount')}</td>
        <td className="pg-ed">{cell('skbbk_amount')}</td>
        <td className="pg-ed">{cell('epf_ee')}</td>
        <td className="pg-ed">{cell('socso_ee')}</td>
        <td className="pg-ed">{cell('eis_ee')}</td>
        <td className={taxMode === 'pcb' ? 'pg-ed' : 'num'}>{pcbCell}</td>

        <td className="pg-ed g1">{cell('epf_er')}</td>
        <td className="pg-ed">{cell('socso_er')}</td>
        <td className="pg-ed">{cell('eis_er')}</td>
      </tr>

      {commissionEditable && <RevenueCommissionEditor
        open={reviewOpen}
        requestedGross={edit.commission_amount}
        baseAmount={reviewedCommissionSource!}
        currentAdjustment={row.commission_adjustment_amount ?? 0}
        currentGross={row.commission_amount}
        staffName={row.staff_name}
        disabled={locked || isPending}
        returnFocusRef={saveRef}
        onClose={closeReview}
        onSave={handleCommissionAdjustment}
      />}

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
