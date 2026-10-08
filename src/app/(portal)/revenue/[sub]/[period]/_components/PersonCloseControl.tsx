'use client'

import { useState } from 'react'
import { formatMoney, formatIntlDate } from '@/lib/utils'
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
  /** Their bills paid on but priced RM 0 in the ERP: closing asks first. */
  unpriced?: readonly string[]
  onClose: () => void
  onCloseAndNext: () => void
  onReopen: () => void
}

function stamp(at: string): string {
  return formatIntlDate(new Date(at), {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur',
  })
}

/**
 * Close one salesperson from inside their ledger (2026-09-27) — the walnut
 * header's middle, where the user asked for it. Open: Close, or Close & next
 * for going down the list one person at a time. Closed: who closed it and
 * when, and Reopen.
 */
export default function PersonCloseControl({ name, total, monthLabel, close, liveTotal, nextName, busy, disabledReason, unpriced = [], onClose, onCloseAndNext, onReopen }: Props) {
  const working = busy !== null
  // One person closes without asking — unless a bill of theirs would close at
  // RM 0 because the ERP has no price for it yet.
  const [ask, setAsk] = useState<'close' | 'next' | null>(null)
  const go = (which: 'close' | 'next') => {
    if (unpriced.length > 0 && ask !== which) { setAsk(which); return }
    setAsk(null)
    if (which === 'close') onClose()
    else onCloseAndNext()
  }

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

  if (ask) {
    const list = unpriced.join(', ')
    return (
      <div className={c.hero}>
        <div className={c.heroAsk} role="group" aria-label={`Confirm closing ${name}`}>
          <p>{list} {unpriced.length === 1 ? 'is' : 'are'} paid but priced RM 0 in the ERP. Closed now, {unpriced.length === 1 ? 'it stays' : 'they stay'} at RM 0 in {name}&apos;s {monthLabel}.</p>
          <div className={c.heroButtons}>
            <button type="button" className={c.heroPrimary} disabled={working || !!disabledReason} onClick={() => go(ask)}>
              <SheetIcon name="lock" />{busy === 'close' ? 'Closing…' : ask === 'next' ? 'Close anyway & next →' : 'Close anyway'}
            </button>
            <button type="button" className={c.heroSecondary} onClick={() => setAsk(null)}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={c.hero}>
      <div className={c.heroButtons}>
        <button type="button" className={c.heroPrimary} disabled={working || !!disabledReason} title={disabledReason ?? undefined} onClick={() => go('close')}>
          <SheetIcon name="lock" />{busy === 'close' ? 'Closing…' : `Close ${name}`}
        </button>
        {nextName ? (
          <button type="button" className={c.heroSecondary} disabled={working || !!disabledReason} title={disabledReason ?? `Close ${name}, then open ${nextName}`} onClick={() => go('next')}>
            Close &amp; next →
          </button>
        ) : null}
      </div>
      <p className={c.heroNote}>{disabledReason ?? `Locks ${formatMoney(total)} for ${monthLabel}`}</p>
    </div>
  )
}
