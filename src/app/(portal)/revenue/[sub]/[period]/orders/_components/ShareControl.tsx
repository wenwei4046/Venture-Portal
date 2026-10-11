'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { shareOrder, unshareOrder } from '../../../../run-actions'
import type { BillShareAnswer } from '@/lib/commission/bill-share'
import { Select } from '@/components/hrv/select'

export interface ShareHolder {
  staffId: string
  name: string
  /** 0.5 = half the bill. */
  pct: number
}

export interface TeamMember {
  staffId: string
  name: string
}

interface Props {
  orderId: string
  /** The owner — never offered as somebody to share with. */
  ownerStaffId: string
  ownerName: string
  shares: ShareHolder[]
  team: TeamMember[]
  disabled: boolean
  disabledReason?: string
}

function pctLabel(p: number): string {
  const v = Math.round(p * 1000) / 10
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}%`
}

/**
 * Share a bill with another team member, in the row of the bill (2026-09-24).
 *
 * Two people often close one customer together at a fair, and the hand-kept
 * claim form always said so ("Share with Lucas RM7500"). Default 50/50. Each
 * part is paid at its holder's OWN rate, and the part climbs its holder's OWN
 * upline line — so a member from another team brings their uplines' override
 * with them (`lib/commission/shares.ts`).
 *
 * The owner's part is shown, not stored: it is what nobody else holds.
 */
export default function ShareControl({
  orderId,
  ownerStaffId,
  ownerName,
  shares,
  team,
  disabled,
  disabledReason,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [staffId, setStaffId] = useState('')
  const [pct, setPct] = useState('50')

  const given = shares.reduce((a, s) => a + s.pct, 0)
  const offered = team.filter(m => m.staffId !== ownerStaffId)

  function run(action: () => Promise<BillShareAnswer>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      try {
        // A refusal comes back as words (a closed month, a paid run) — production
        // would show only a digest of a thrown one.
        const answer = await action()
        if (!answer.ok) return setError(answer.reason)
        after?.()
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  function save() {
    const p = Number(pct) / 100
    if (!staffId) return setError('Pick who to share with')
    if (!(p > 0 && p < 1)) return setError('A share is between 0% and 100%')
    run(() => shareOrder(orderId, staffId, p), () => {
      setOpen(false)
      setStaffId('')
      setPct('50')
    })
  }

  return (
    <div className="mt-1">
      {shares.length > 0 ? (
        <div className="font-mono text-[10.5px] leading-snug">
          <div>{ownerName} {pctLabel(1 - given)}</div>
          {shares.map(s => (
            <div key={s.staffId} className="flex items-center gap-1">
              <span className="font-bold">+ {s.name} {pctLabel(s.pct)}</span>
              {disabled ? null : (
                <button
                  type="button"
                  onClick={() => run(() => unshareOrder(orderId, s.staffId))}
                  disabled={isPending}
                  className="text-muted hover:text-danger disabled:opacity-40"
                  title={`Stop sharing with ${s.name} — ${ownerName} holds that part again`}
                  aria-label={`Stop sharing with ${s.name}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {disabled ? (
        shares.length === 0 ? null : (
          <span className="sr-only">{disabledReason}</span>
        )
      ) : open ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 bg-surface border border-hairline rounded-control p-1.5">
          <Select bare
            value={staffId}
            onChange={e => setStaffId(e.target.value)}
            aria-label="Share with"
            className="px-1.5 py-1 bg-surface border border-hairline rounded text-xs text-ink max-w-[10rem]"
          >
            <option value="">Share with…</option>
            {offered.map(m => (
              <option key={m.staffId} value={m.staffId}>
                {m.name}
              </option>
            ))}
          </Select>
          <input
            type="number"
            min={1}
            max={99}
            step={1}
            value={pct}
            onChange={e => setPct(e.target.value)}
            aria-label="Their part, percent"
            className="w-14 px-1.5 py-1 bg-surface border border-hairline rounded text-xs text-ink text-right"
          />
          <span className="text-xs">%</span>
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="font-mono text-[10px] px-2 py-1 rounded-control bg-accent hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            {isPending ? '…' : 'Share'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setError(null)
            }}
            className="font-mono text-[10px] px-1.5 py-1 hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          onContextMenu={e => {
            e.preventDefault()
            setOpen(true)
          }}
          className="font-mono text-[10px] uppercase tracking-wide text-muted hover:text-accent mt-0.5"
          title="Share this bill with another team member — each is paid on their part at their own rate"
        >
          Share…
        </button>
      )}
      {error ? <div className="text-danger text-[11px] mt-0.5">{error}</div> : null}
    </div>
  )
}
