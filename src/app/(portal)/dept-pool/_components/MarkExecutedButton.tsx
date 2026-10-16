'use client'

import { useState, useTransition, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { executeHrCostingInWords } from '../hr-actions'

// Mark executed asks first on the computer (2026-10-16 — the user: the
// desktop's one-way steps ask first, as the phone app's do since 2026-10-15).
// Nothing on the portal sets a submission back, so Department Pools, the
// submissions page and HR Costing (where it reads *Execute transfers*) open the
// phone's question — the month, and its total where the page shows one — and a
// refusal stays in it, in words.

export default function MarkExecutedButton({
  id,
  month,
  total,
  label = 'Mark executed',
  className,
}: {
  id: string
  /** "September 2026". */
  month: string
  /** The submission's total as the page writes it ("RM 48,210.00"), where it shows one. */
  total?: string
  /** The page's own word for the step (HR Costing: *Execute transfers*). */
  label?: string
  className: string
}) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const open = (e: MouseEvent) => {
    // On the submissions page the button sits in a <summary>: asking must not fold the month open.
    e.preventDefault()
    e.stopPropagation()
    setError(null)
    setAsking(true)
  }
  const close = () => {
    if (!busy) setAsking(false)
  }
  const confirm = () => {
    setError(null)
    start(async () => {
      try {
        const res = await executeHrCostingInWords(id)
        if (!res.ok) return setError(res.reason)
        setAsking(false)
        flash('Marked executed')
        router.refresh()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {label}
      </button>
      <FinDialog open={asking} onClose={close} title={`Mark ${month} executed?`} sub={total ? `HR costing · ${total}` : 'HR costing'} locked={busy}>
        <DialogConfirm text="This cannot be undone." confirmLabel={busy ? 'Marking…' : 'Mark executed'} busy={busy} error={error} onCancel={close} onConfirm={confirm} />
      </FinDialog>
    </>
  )
}
