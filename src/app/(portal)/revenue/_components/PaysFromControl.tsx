'use client'

import { useState, useTransition } from 'react'
import { formatIntlDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { clearFirstPaidMonth, setFirstPaidMonth } from '../cutover-actions'

interface Props {
  subDepartmentId: string
  cutover: { firstPaidMonth: string; setAt: string; setByName: string | null; note: string | null } | null
}

function monthName(period: string): string {
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function day(iso: string): string {
  return formatIntlDate(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }, 'en-GB')
}

/**
 * The first month the portal pays (user 2026-09-26: VP 从九月开始付).
 *
 * Every month before it was settled outside the portal: its bills never ride
 * into a run, the ERP may not change them, and what the ERP changes on one is
 * a drop or an upsell to confirm. Without it, the first run the portal pays
 * would pay every month since the feed began again.
 */
export default function PaysFromControl({ subDepartmentId, cutover }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [month, setMonth] = useState(cutover ? cutover.firstPaidMonth.slice(0, 7) : '')
  const [note, setNote] = useState(cutover?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
        setEditing(false)
        router.refresh()
      } catch (err) {
        const text = err instanceof Error ? err.message : 'That did not save'
        if (!text.includes('NEXT_REDIRECT')) setError(text)
      }
    })
  }

  return (
    <section aria-label="When the portal starts paying" className="mb-8 border border-hairline rounded-card bg-surface-2 px-4 py-3">
      {editing ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.045em] mb-1">The portal pays from</span>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              aria-label="First month the portal pays"
              className="px-2 py-1.5 bg-surface border border-hairline rounded-control text-sm text-ink"
            />
          </label>
          <label className="block flex-1 min-w-[14rem]">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.045em] mb-1">Why (optional)</span>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. June–August paid from the claim forms"
              className="w-full px-2 py-1.5 bg-surface border border-hairline rounded-control text-sm text-ink"
            />
          </label>
          <button
            type="button"
            disabled={pending || !/^\d{4}-\d{2}$/.test(month)}
            onClick={() => run(() => setFirstPaidMonth(subDepartmentId, `${month}-01`, note))}
            className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          {cutover ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm('Let the portal pay every month again? Bills of earlier months will carry into the next run until a run pays them.')) {
                  run(() => clearFirstPaidMonth(subDepartmentId))
                }
              }}
              className="text-xs hover:text-danger hover:underline underline-offset-2 px-2 py-2"
            >
              Pay every month
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { setEditing(false); setError(null) }}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {cutover ? (
            <>
              <span className="text-sm">
                The portal pays from <strong className="font-semibold">{monthName(cutover.firstPaidMonth)}</strong>
              </span>
              <span className="text-xs">
                Earlier months were settled by hand: their bills never carry into a run, and a change
                the ERP makes to one is a drop or an upsell to confirm.
              </span>
              <span className="text-[11px]">
                {cutover.setByName ? `${cutover.setByName} · ` : ''}{day(cutover.setAt)}{cutover.note ? ` · “${cutover.note}”` : ''}
              </span>
            </>
          ) : (
            <span className="text-xs">
              The portal pays every month: a bill of an earlier month rides into the next run until a
              run pays it. If earlier months were paid by hand, set the first month the portal pays.
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors"
          >
            {cutover ? 'Change' : 'Set the first month…'}
          </button>
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-danger mt-2">{error}</p> : null}
    </section>
  )
}
