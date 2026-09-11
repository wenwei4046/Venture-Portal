'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { cn, formatMoneyBare } from '@/lib/utils'
import { parseAmount } from '@/lib/payroll-grid'
import AmountInput from './AmountInput'

export interface RevenueCommissionChange {
  gross: number
  expectedSynced: number
  expectedAdjustment: number
  reason: string
}

export interface RevenueCommissionEditorProps {
  baseAmount: number
  currentAdjustment: number
  currentGross: number
  disabled?: boolean
  staffName?: string
  onSave: (change: RevenueCommissionChange) => Promise<void> | void
}

interface Snapshot {
  base: number
  adjustment: number
  gross: number
}

const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100
const signedMoney = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '-' : ''}${formatMoneyBare(Math.abs(amount))}`
const amountError = 'Enter a finite Gross Commission amount of zero or more.'

/** A payroll adjustment to a synced commission pool; eligibility belongs to the caller. */
export default function RevenueCommissionEditor({
  baseAmount,
  currentAdjustment,
  currentGross,
  disabled = false,
  staffName,
  onSave,
}: RevenueCommissionEditorProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [requested, setRequested] = useState(currentGross)
  const [reason, setReason] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const savingRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const propsValid = [baseAmount, currentAdjustment, currentGross].every(Number.isFinite)
    && baseAmount >= 0 && currentGross >= 0
  const sourceChanged = !!snapshot && (baseAmount !== snapshot.base
    || currentAdjustment !== snapshot.adjustment || currentGross !== snapshot.gross)

  useEffect(() => {
    if (!snapshot) return
    dialogRef.current?.focus({ preventScroll: true })
    return () => triggerRef.current?.focus({ preventScroll: true })
  }, [snapshot])

  function open() {
    if (disabled || !propsValid) return
    setSnapshot({ base: baseAmount, adjustment: currentAdjustment, gross: currentGross })
    setRequested(roundMoney(currentGross))
    setReason('')
    setInputError(null)
    setError(null)
  }

  function close() {
    if (!savingRef.current) setSnapshot(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    if (event.key !== 'Tab') return
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')
    const first = controls?.[0], last = controls?.[controls.length - 1]
    if (!first || !last) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus()
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!snapshot || savingRef.current || disabled || sourceChanged || !propsValid) return
    const gross = roundMoney(requested)
    if (inputError || !Number.isFinite(gross) || gross < 0) { setError(amountError); return }
    if (!reason.trim()) { setError('Enter a reason for this adjustment.'); return }
    savingRef.current = true
    setPending(true)
    setError(null)
    try {
      await onSave({ gross, expectedSynced: snapshot.base, expectedAdjustment: snapshot.adjustment, reason: reason.trim() })
      setSnapshot(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the commission adjustment. Try again.')
    } finally {
      savingRef.current = false
      setPending(false)
    }
  }

  const requestedGross = roundMoney(requested)
  const adjustment = snapshot ? roundMoney(requestedGross - snapshot.base) : 0
  const difference = snapshot ? roundMoney(requestedGross - snapshot.gross) : 0
  const locked = pending || disabled || sourceChanged || !propsValid

  return <>
    <span className="inline-flex w-full flex-col items-end gap-1">
      <button ref={triggerRef} type="button" onClick={open} disabled={disabled || !propsValid}
        aria-label={staffName ? `Edit Gross Commission — ${staffName}` : 'Edit Gross Commission'}
        title="Edit Gross Commission"
        className="num inline-flex items-center gap-1 text-accent underline underline-offset-2 disabled:text-muted disabled:no-underline disabled:cursor-not-allowed">
        {Number.isFinite(currentGross) ? formatMoneyBare(currentGross) : 'Unavailable'}
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m10 3 3 3M3 10l7-7a2.1 2.1 0 0 1 3 3l-7 7-4 1 1-4Z" /></svg>
      </button>
      <span className="text-xs text-graphite" aria-label="Current commission adjustment" title="Current payroll adjustment to the Revenue source">Adj. <span className="num">{Number.isFinite(currentAdjustment) ? signedMoney(roundMoney(currentAdjustment)) : 'Unavailable'}</span></span>
    </span>
    {snapshot && createPortal(<>
      <div className="pg-scrim" style={{ zIndex: 70 }} onClick={close} aria-hidden="true" />
      <div ref={dialogRef} className="pg-win" style={{ maxWidth: 560, zIndex: 71 }} role="dialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="pg-win-h">
          <div className="min-w-0"><div className="page-eyebrow">PAYROLL ADJUSTMENT{staffName ? ` · ${staffName}` : ''}</div><h2 id={titleId}>Edit Gross Commission</h2></div>
          <div className="nav"><button type="button" className="icon-btn solid" onClick={close} disabled={pending} aria-label="Close commission editor">×</button></div>
        </div>
        <form onSubmit={save} noValidate className="p-4 sm:p-6">
          <p id={descriptionId} className="text-sm text-graphite mb-4">This changes the payroll amount. Revenue keeps its calculated commission; future syncs retain the payroll adjustment.</p>
          <table className="ledger-table w-full mb-4" aria-label="Commission adjustment summary">
            <thead><tr><th>Amount</th><th className="num">RM</th></tr></thead>
            <tbody>
              <tr><td>Synced from Revenue</td><td className="num">{formatMoneyBare(snapshot.base)}</td></tr>
              <tr><td>Current Gross Commission</td><td className="num">{formatMoneyBare(snapshot.gross)}</td></tr>
              <tr><td>Requested Gross Commission</td><td className="num">{inputError ? '—' : formatMoneyBare(requestedGross)}</td></tr>
              <tr><td>Difference from current</td><td className={cn('num', difference < 0 && 'neg')}>{inputError ? '—' : signedMoney(difference)}</td></tr>
              <tr><td>Payroll adjustment to Revenue source</td><td className={cn('num', adjustment < 0 && 'neg')}>{inputError ? '—' : signedMoney(adjustment)}</td></tr>
            </tbody>
          </table>
          <label className="block text-sm text-ink mb-3">
            Requested Gross Commission · RM
            <span className="block mt-1" onChangeCapture={event => {
              // AmountInput deliberately ignores invalid keystrokes. Track them here so
              // submitting cannot silently reuse the previous valid monetary value.
              if (!(event.target instanceof HTMLInputElement)) return
              const raw = event.target.value.replace(/^\s*RM\s*/i, '').replace(/[,\s]/g, '')
              const parsed = parseAmount(event.target.value)
              setInputError(raw === '' || raw === '.' || parsed === null || !Number.isFinite(roundMoney(parsed)) ? amountError : null)
              setError(null)
            }}>
              <AmountInput value={requested} onChange={setRequested} disabled={locked} dirty={requestedGross !== roundMoney(snapshot.gross)} aria-label="Requested Gross Commission" className="w-full" />
            </span>
          </label>
          <button type="button" className="text-xs text-accent underline underline-offset-2 mb-4 disabled:text-muted" disabled={locked}
            onClick={() => { setRequested(roundMoney(snapshot.base)); setInputError(null); setError(null) }}>Reset to Revenue source</button>
          <label className="block text-sm text-ink">Reason <span className="text-muted">(required)</span>
            <textarea value={reason} onChange={event => { setReason(event.target.value); setError(null) }} disabled={locked} required rows={3} maxLength={1000}
              aria-label="Adjustment reason" placeholder="For example: DN adjustment or dropped sales"
              className="block w-full rounded border border-hairline bg-surface text-ink px-3 py-2 mt-1" />
          </label>
          <p className="text-xs text-muted mt-2">Resetting to the source removes the payroll adjustment and also requires a reason.</p>
          {(sourceChanged || disabled || inputError || error || !propsValid) && <p role="alert" className="text-sm text-danger mt-3">
            {sourceChanged ? 'Revenue or payroll amounts changed while this editor was open. Cancel and reopen to review the latest amounts.'
              : disabled ? 'Commission editing is no longer available. Cancel to return to payroll.'
                : !propsValid ? 'Commission amounts are unavailable. Refresh payroll before editing.' : inputError ?? error}
          </p>}
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" className="pg-btn" onClick={close} disabled={pending}>Cancel</button>
            <button type="submit" className="pg-btn pri" disabled={locked || !!inputError}>{pending ? 'Saving…' : 'Save adjustment'}</button>
          </div>
        </form>
      </div>
    </>, document.body)}
  </>
}
