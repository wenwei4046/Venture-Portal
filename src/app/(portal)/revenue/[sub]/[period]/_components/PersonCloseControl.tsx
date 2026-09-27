'use client'

import { formatMoney } from '@/lib/utils'
import type { SalespersonClose } from '@/lib/commission/closes'
import { SheetIcon } from '@/components/sheet/SheetIcon'
import c from './close-controls.module.css'

interface Props {
  name: string
  /** The figure a close would lock — the live one on screen. */
  total: number
  /** "September 2026". */
  monthLabel: string
  close: SalespersonClose | undefined
  /** Closed, and the live month has moved since: the live figure. */
  liveTotal: number | null
  /** Who opens next after "Close & next", or null when nobody is left open. */
  nextName: string | null
  busy: 'close' | 'reopen' | null
  disabledReason: string | null
  onClose: () => void
  onCloseAndNext: () => void
  onReopen: () => void
}

function stamp(at: string): string {
  return new Date(at).toLocaleString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur',
  })
}

/**
 * Close one salesperson from inside their ledger (2026-09-27) — the walnut
 * header's middle, where the user asked for it. Open: Close, or Close & next
 * for going down the list one person at a time. Closed: who closed it and
 * when, and Reopen.
 */
export default function PersonCloseControl({ name, total, monthLabel, close, liveTotal, nextName, busy, disabledReason, onClose, onCloseAndNext, onReopen }: Props) {
  const working = busy !== null

  if (close) {
    return (
      <div className={c.hero} data-closed>
        <div className={c.stamp}>
          <SheetIcon name="lock" />
          <div>
            <strong>Closed</strong>
            <span>{stamp(close.closedAt)}{close.closedByName ? ` · ${close.closedByName}` : ''}</span>
          </div>
        </div>
        {liveTotal !== null ? (
          <p className={c.heroLive}>Live now {formatMoney(liveTotal)} ({liveTotal - close.total >= 0 ? '+' : ''}{formatMoney(liveTotal - close.total)})</p>
        ) : null}
        <button type="button" className={c.heroQuiet} disabled={working} onClick={onReopen}>
          {busy === 'reopen' ? 'Reopening…' : 'Reopen'}
        </button>
      </div>
    )
  }

  return (
    <div className={c.hero}>
      <div className={c.heroButtons}>
        <button type="button" className={c.heroPrimary} disabled={working || !!disabledReason} title={disabledReason ?? undefined} onClick={onClose}>
          <SheetIcon name="lock" />{busy === 'close' ? 'Closing…' : `Close ${name}`}
        </button>
        {nextName ? (
          <button type="button" className={c.heroSecondary} disabled={working || !!disabledReason} title={disabledReason ?? `Close ${name}, then open ${nextName}`} onClick={onCloseAndNext}>
            Close &amp; next →
          </button>
        ) : null}
      </div>
      <p className={c.heroNote}>{disabledReason ?? `Locks ${formatMoney(total)} for ${monthLabel}`}</p>
    </div>
  )
}
