'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoneyBare } from '@/lib/utils'
import { topupSummary, type SubmitPreview } from '@/lib/payroll-lifecycle'
import { submitPayrollBatch } from '../actions'
import { usePayrollDraft } from './PayrollDraftContext'

interface Props {
  period: string
  /** Everybody Completed and waiting — what this press would send. */
  preview: SubmitPreview
}

/**
 * Submit to Finance (unified Payroll, 2026-09-27): sends the people Completed
 * since the last batch. It stays here after every press — Finance's three
 * today, HR's five next week — and where each batch's money stands is shown
 * with the batches, never in place of this button.
 */
export default function SubmitToFinanceButton({ period, preview }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const { dirtyCount } = usePayrollDraft()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        const batch = await submitPayrollBatch(period, preview.people, preview.ctc)
        setConfirming(false)
        setDone(`Batch #${batch.batchNo} sent · ${batch.people} ${batch.people === 1 ? 'person' : 'people'} · RM ${formatMoneyBare(batch.total)}`)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Submit failed')
        setConfirming(false)
        router.refresh()
      }
    })
  }

  // Unsaved inline edits would not be in the batch — save first.
  if (dirtyCount > 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button disabled className="bg-accent text-sm px-4 py-2 rounded-control opacity-40 cursor-not-allowed" title="Save your edits first">
          Submit to Finance
        </button>
        <span className="chip alert">
          <span className="dot" />
          {dirtyCount} unsaved row{dirtyCount > 1 ? 's' : ''} — save first
        </span>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="bg-surface border border-accent rounded-lg px-4 py-3 max-w-xl" role="dialog" aria-label="Submit to Finance">
          <p className="text-sm">
            Send <strong className="font-bold">{preview.people} {preview.people === 1 ? 'person' : 'people'}</strong> to Finance ·
            {' '}CTC <span className="font-mono tabular-nums font-medium">RM {formatMoneyBare(preview.ctc)}</span>?
          </p>
          <table className="text-xs mt-2 w-full">
            <tbody>
              {preview.byDept.map(d => (
                <tr key={d.dept}>
                  <td className="py-0.5 pr-3">{d.dept}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{d.people}</td>
                  <td className="py-0.5 text-right font-mono tabular-nums">{formatMoneyBare(d.ctc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs mt-2">
            Only people Completed since the last batch go; the rest stay here.
            {preview.topups > 0 ? ` ${topupSummary(preview.topups, preview.secondPayrolls)} send${preview.topups === 1 ? 's' : ''} only the difference.` : ''}
            {' '}Finance funds the CTC (gross + employer statutory) of this batch alone.
          </p>
          <div className="flex items-center justify-end gap-3 mt-3">
            <button onClick={() => setConfirming(false)} disabled={isPending} className="text-xs hover:underline underline-offset-2">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="bg-accent hover:bg-accent-hover text-sm px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
            >
              {isPending ? 'Submitting…' : `Submit batch · RM ${formatMoneyBare(preview.ctc)}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const nobody = preview.people === 0
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => { setDone(null); setError(null); setConfirming(true) }}
        disabled={nobody}
        title={nobody ? 'Nobody is Completed yet — tick people and press Complete (salespeople close on Comm Cal, Directors complete on Director Salary)' : undefined}
        className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Submit to Finance{nobody ? '' : ` · ${preview.people}`}
      </button>
      {nobody && !done && <span className="text-xs">Nobody completed and waiting</span>}
      {done && <span className="chip ledger" role="status"><span className="dot" />{done}</span>}
      {error && <span className="text-sm text-danger max-w-sm text-right" role="alert">{error}</span>}
    </div>
  )
}
