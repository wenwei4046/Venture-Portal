'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { formatIntlDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { closeErpMonth, reopenErpMonth } from '../../../sync-actions'

export interface ErpFeedChipProps {
  period: string
  subDepartmentId: string
  monthLabel: string
  closed: {
    closedAt: string
    closedByName: string | null
    note: string | null
    /** 'before_cutover' = settled by hand, before the first month the portal pays. */
    reason?: 'closed' | 'before_cutover'
  } | null
  /** Deliveries the feed has held for this month and nobody has replayed. */
  held: number
  /** "September 2026" — the first month the portal pays, when one is set. */
  firstPaidLabel?: string | null
}

function when(iso: string): string {
  return formatIntlDate(new Date(iso), {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur',
  })
}

/**
 * The month's link to the Houzs ERP, and the switch that cuts it (2026-09-26).
 *
 * Live, every save in the ERP rewrites this month's bills within seconds.
 * Closed, the feed may not write into or out of the month: each delivery is
 * held with its payload, the bills stay exactly as they are, and every other
 * month keeps syncing. Reopening replays what was held, so closing loses
 * nothing. Click or right-click the chip — the same menu either way, because
 * a right-click alone is invisible on a phone.
 */
export default function ErpFeedChip({ period, subDepartmentId, monthLabel, closed, held, firstPaidLabel = null }: ErpFeedChipProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  function show() {
    setOpen(true)
    setConfirming(false)
    setError(null)
  }

  function run(action: () => Promise<string>) {
    setError(null)
    startTransition(async () => {
      try {
        setMessage(await action())
        setConfirming(false)
        setNote('')
        // The chip, the list of months and the held counts are the server's.
        router.refresh()
      } catch (err) {
        const text = err instanceof Error ? err.message : 'That did not save'
        if (!text.includes('NEXT_REDIRECT')) setError(text)
      }
    })
  }

  const settled = closed?.reason === 'before_cutover'
  const label = settled
    ? `Settled by hand${held > 0 ? ` · ${held} held` : ''}`
    : closed ? `ERP closed${held > 0 ? ` · ${held} held` : ''}` : 'Live from ERP'

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onContextMenu={e => {
          e.preventDefault()
          show()
        }}
        title={settled ? 'Settled by hand — the ERP cannot change it' : closed ? 'Closed to the ERP feed — click to reopen' : 'Fed live by the ERP — click or right-click to close this month to it'}
        className={[
          'font-mono text-[11px] uppercase tracking-[0.02em] border px-3 py-2 rounded-control bg-surface hover:bg-surface-2 transition-colors',
          settled ? 'text-graphite border-hairline' : closed ? 'text-alert border-alert' : 'text-ledger border-hairline',
        ].join(' ')}
      >
        <span aria-hidden className="mr-1.5">{settled ? '✓' : closed ? '■' : '●'}</span>
        {label}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={`${monthLabel} and the ERP feed`}
          className="absolute right-0 top-full mt-2 z-30 w-[min(22rem,calc(100vw-2rem))] bg-surface border border-hairline rounded-card shadow-lg p-4 text-left"
        >
          {settled ? (
            <>
              <div className="font-serif text-[15px] text-ink mb-1">Settled by hand</div>
              <p className="font-serif italic text-sm text-graphite mb-2">
                {monthLabel} was paid outside the portal{firstPaidLabel ? ` — the portal pays from ${firstPaidLabel}` : ''}.
                The ERP cannot change its bills: what it changes on one comes up as a drop or an
                upsell to confirm at the top of the month you are paying.
              </p>
              {closed?.note ? <p className="font-serif text-sm text-ink mb-2">“{closed.note}”</p> : null}
              <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-graphite">
                {held} {held === 1 ? 'delivery' : 'deliveries'} held · change the first paid month on Comm Cal to hand it back
              </p>
            </>
          ) : closed ? (
            <>
              <div className="font-serif text-[15px] text-ink mb-1">Closed to the ERP feed</div>
              <p className="font-serif italic text-sm text-graphite mb-2">
                {closed.closedByName ? `${closed.closedByName} closed ${monthLabel}` : `${monthLabel} was closed`} on {when(closed.closedAt)}.
                The ERP cannot change its bills; everything it sent since is held, nothing lost.
              </p>
              {closed.note ? <p className="font-serif text-sm text-ink mb-2">“{closed.note}”</p> : null}
              <p className="font-mono text-[11px] uppercase tracking-[0.02em] text-graphite mb-3">
                {held} {held === 1 ? 'delivery' : 'deliveries'} held
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(async () => {
                  const r = await reopenErpMonth(period, subDepartmentId)
                  return r.held === 0
                    ? `${monthLabel} is live again. Nothing was waiting.`
                    : `${monthLabel} is live again. ${r.replay.replayed} replayed: ${r.replay.applied} applied, ${r.replay.stillHeld} still held.`
                })}
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
              >
                {pending ? 'Reopening…' : held > 0 ? `Reopen and replay ${held}` : 'Reopen to the feed'}
              </button>
            </>
          ) : confirming ? (
            <>
              <div className="font-serif text-[15px] text-ink mb-1">Close {monthLabel} to the ERP feed?</div>
              <p className="font-serif italic text-sm text-graphite mb-3">
                The bills stay exactly as they are now. Whatever the ERP sends about {monthLabel} from here
                on is held, not written — and other months keep syncing. Reopen any time to replay it.
              </p>
              <label className="block font-mono text-[10.5px] uppercase tracking-[0.02em] text-graphite mb-1" htmlFor={`erp-close-note-${period}`}>
                Why (optional)
              </label>
              <input
                id={`erp-close-note-${period}`}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. paid from the claim form"
                className="w-full px-2 py-1.5 bg-paper border border-hairline rounded-control text-sm text-ink mb-3"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(async () => {
                    await closeErpMonth(period, subDepartmentId, note)
                    return `${monthLabel} is closed to the ERP feed.`
                  })}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
                >
                  {pending ? 'Closing…' : 'Close month'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="font-serif italic text-sm text-graphite hover:text-ink px-3 py-2"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="font-serif text-[15px] text-ink mb-1">Live from the ERP</div>
              <p className="font-serif italic text-sm text-graphite mb-3">
                Every save in the ERP updates {monthLabel}&apos;s bills within seconds.
              </p>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
              >
                Close this month to the ERP feed…
              </button>
            </>
          )}
          {message ? <p role="status" className="font-serif italic text-sm text-ledger mt-3">{message}</p> : null}
          {error ? <p role="alert" className="font-serif italic text-sm text-danger mt-3">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
