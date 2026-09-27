'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/utils'
import { splitSelection } from '@/lib/commission/closes'
import { SheetIcon } from '@/components/sheet/SheetIcon'
import type { CloseTarget } from './useSalespersonCloses'
import c from './close-controls.module.css'

/** Everybody on the month's list, as the bar counts them. */
export interface CloseBarRow extends CloseTarget {
  closed: boolean
  /** Closed, and the live month has moved since. */
  changed: boolean
}

interface Props {
  /** "September 2026". */
  monthLabel: string
  rows: readonly CloseBarRow[]
  ticked: ReadonlySet<string>
  busy: 'close' | 'reopen' | null
  /** Why nobody can be closed right now (a draft on screen, a month settled by hand…). */
  disabledReason: string | null
  error: string
  notice: string
  onClose: (targets: CloseTarget[]) => void
  onReopen: (targets: CloseTarget[]) => void
  onClearTicks: () => void
}

type Ask = { kind: 'close' | 'reopen'; targets: CloseTarget[] } | null

function names(targets: readonly CloseTarget[]): string {
  const shown = targets.slice(0, 4).map(t => t.name).join(', ')
  return targets.length > 4 ? `${shown} and ${targets.length - 4} more` : shown
}

/**
 * The close bar above the list of salespeople (2026-09-27): how far the month
 * has been closed, and the one-click ways to close — the ticked people, or
 * everybody still open. Closing several at once asks first and names them;
 * closing one from their own ledger does not need to.
 */
export default function CloseBar({ monthLabel, rows, ticked, busy, disabledReason, error, notice, onClose, onReopen, onClearTicks }: Props) {
  const [ask, setAsk] = useState<Ask>(null)
  const closed = new Set(rows.filter(r => r.closed).map(r => r.staffId))
  const closedCount = closed.size
  const lockedTotal = rows.filter(r => r.closed).reduce((a, r) => a + r.total, 0)
  const open = rows.filter(r => !r.closed)
  const changed = rows.filter(r => r.changed)
  const { toClose, toReopen } = splitSelection(rows, ticked, closed)
  const allClosed = rows.length > 0 && open.length === 0
  const working = busy !== null
  const share = rows.length ? Math.round((closedCount / rows.length) * 100) : 0

  function confirm() {
    if (!ask) return
    if (ask.kind === 'close') onClose(ask.targets)
    else onReopen(ask.targets)
    setAsk(null)
  }

  return (
    <section className={c.bar} aria-label={`Close ${monthLabel}`} data-complete={allClosed || undefined}>
      <div className={c.barHead}>
        <span className={c.barIcon} aria-hidden><SheetIcon name={allClosed ? 'check' : 'lock'} /></span>
        <div className={c.barProgress}>
          <strong>
            {allClosed
              ? `${monthLabel} is closed — all ${rows.length} salespeople`
              : `${closedCount} of ${rows.length} closed`}
          </strong>
          <span>{closedCount > 0 ? `${formatMoney(lockedTotal)} locked` : `Close each salesperson once their ${monthLabel} is checked — their commission is then locked`}</span>
          <div className={c.meter} role="progressbar" aria-label="Salespeople closed" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={closedCount}>
            <span style={{ width: `${share}%` }} />
          </div>
        </div>

        {ask ? (
          <div className={c.ask} role="group" aria-label={ask.kind === 'close' ? 'Confirm close' : 'Confirm reopen'}>
            <p>
              {ask.kind === 'close'
                ? <>Close {ask.targets.length === 1 ? ask.targets[0].name : `${ask.targets.length} salespeople — ${names(ask.targets)} —`} and lock {formatMoney(ask.targets.reduce((a, t) => a + t.total, 0))} for {monthLabel}?</>
                : <>Reopen {ask.targets.length === 1 ? ask.targets[0].name : `${ask.targets.length} salespeople — ${names(ask.targets)}`}? Their live figure counts again until they are closed.</>}
            </p>
            <button type="button" className={c.primary} onClick={confirm}>
              {ask.kind === 'close' ? `Close ${ask.targets.length}` : `Reopen ${ask.targets.length}`}
            </button>
            <button type="button" className={c.quiet} onClick={() => setAsk(null)}>Cancel</button>
          </div>
        ) : (
          <div className={c.actions}>
            {toClose.length > 0 ? (
              <button type="button" className={c.primary} disabled={working || !!disabledReason} title={disabledReason ?? undefined}
                onClick={() => setAsk({ kind: 'close', targets: toClose })}>
                {busy === 'close' ? 'Closing…' : `Close ${toClose.length} ticked`}
              </button>
            ) : null}
            {toReopen.length > 0 ? (
              <button type="button" className={c.secondary} disabled={working}
                onClick={() => setAsk({ kind: 'reopen', targets: toReopen })}>
                {busy === 'reopen' ? 'Reopening…' : `Reopen ${toReopen.length}`}
              </button>
            ) : null}
            {ticked.size > 0 ? (
              <button type="button" className={c.quiet} disabled={working} onClick={onClearTicks}>Clear ticks</button>
            ) : open.length > 0 ? (
              <button type="button" className={c.primary} disabled={working || !!disabledReason} title={disabledReason ?? undefined}
                onClick={() => setAsk({ kind: 'close', targets: open })}>
                {busy === 'close' ? 'Closing…' : open.length === rows.length ? `Close all ${open.length}` : `Close the ${open.length} still open`}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {disabledReason && !allClosed ? <p className={c.hint}>{disabledReason}</p> : null}
      {changed.length > 0 ? (
        <p className={c.changed} role="note">
          <SheetIcon name="alert" />
          <span>
            {changed.length === 1 ? `${changed[0].name} has` : `${changed.length} closed salespeople have`} moved since they were closed
            {changed.length > 1 ? ` — ${names(changed)}` : ''}. The closed figure stands; reopen to take the new one.
          </span>
        </p>
      ) : null}
      {notice ? <p className={c.notice} role="status">{notice}</p> : null}
      {error ? <p className={c.error} role="alert">{error}</p> : null}
    </section>
  )
}
