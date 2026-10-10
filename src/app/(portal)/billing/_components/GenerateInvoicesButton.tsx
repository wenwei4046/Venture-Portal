'use client'

import { useState, useTransition } from 'react'
import dayjs from 'dayjs'
import { backdropDismiss } from '@/components/modal-dismiss'
import { generateMonthlyInvoices, type GenerateInvoicesResult } from '../actions'

interface Props {
  currentPeriod: string
  modes?: string[]       // e.g. ['marketing_project'] — null = all
  label?: string         // button label override
  description?: string   // confirmation description override
  /** Arrive asking for the confirmation — picked from a page-head menu. */
  autoOpen?: boolean
  /** No button of its own: the confirmation and the result are a dialog
   *  (2026-10-10, the handoff's "+ Create Invoice ▾" menu). */
  hideTrigger?: boolean
}

export default function GenerateInvoicesButton({
  currentPeriod,
  modes,
  label = 'Generate invoices',
  description,
  autoOpen = false,
  hideTrigger = false,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(autoOpen)
  const [result, setResult] = useState<GenerateInvoicesResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('period_month', currentPeriod)
    if (modes) formData.append('modes', modes.join(','))

    startTransition(async () => {
      try {
        const res = await generateMonthlyInvoices(formData)
        setResult(res)
        setConfirming(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const periodLabel = dayjs(currentPeriod).format('MMMM YYYY')
  const modeLabel = modes ? modes.join(', ') : 'all modes'

  // From a menu: the confirmation, then what was generated, in a dialog.
  if (hideTrigger) {
    if (!confirming && !result) return null
    const close = () => {
      if (isPending) return
      setConfirming(false)
      setResult(null)
      setError(null)
    }
    return (
      <div
        className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
        {...backdropDismiss(close)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-md my-12 p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-serif text-lg text-ink mb-2">{label}</h3>
          {result ? (
            <>
              <p className="text-sm text-ledger mb-1">
                {result.generated} generated{result.skipped > 0 ? `, ${result.skipped} preserved` : ''}
              </p>
              {Object.entries(result.mode_counts).some(([, n]) => n > 0) ? (
                <p className="font-mono text-xs text-muted mb-4">
                  {Object.entries(result.mode_counts)
                    .filter(([, n]) => n > 0)
                    .map(([mode, n]) => `${mode}: ${n}`)
                    .join(' · ')}
                </p>
              ) : null}
              <button type="button" onClick={close} className="bil-btn">
                Close
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-graphite mb-4">
                {description ?? `Generate draft invoices for ${periodLabel} (${modeLabel}). Already-issued invoices will be preserved.`}
              </p>
              {error ? (
                <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 mb-3 text-xs font-sans">{error}</div>
              ) : null}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending}
                  className="bg-accent hover:bg-accent-hover text-ink font-sans font-medium text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? 'Generating…' : 'Yes, generate'}
                </button>
                <button type="button" onClick={close} className="text-sm text-graphite hover:text-ink font-sans">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="confirm-slide-in bg-surface border border-hairline rounded-md p-5 max-w-md">
        <h3 className="font-serif text-lg text-ink mb-2">{label}</h3>
        <p className="font-serif italic text-graphite text-sm mb-4">
          {description ?? `Generate draft invoices for ${periodLabel} (${modeLabel}). Already-issued invoices will be preserved.`}
        </p>

        {error ? (
          <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 mb-3 text-xs font-sans">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Generating…' : 'Yes, generate'}
          </button>
          <button
            type="button"
            onClick={() => { setConfirming(false); setError(null) }}
            className="text-sm text-graphite hover:text-ink font-sans"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {result ? (
        <div className="text-right text-xs">
          <div className="font-serif italic text-ledger">
            {result.generated} generated
            {result.skipped > 0 ? `, ${result.skipped} preserved` : ''}
          </div>
          {Object.entries(result.mode_counts).some(([, n]) => n > 0) ? (
            <div className="font-mono text-xs text-muted mt-1">
              {Object.entries(result.mode_counts)
                .filter(([, n]) => n > 0)
                .map(([mode, n]) => `${mode}: ${n}`)
                .join(' · ')}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-accent hover:text-accent-hover font-serif italic"
      >
        {label}
      </button>
    </div>
  )
}
