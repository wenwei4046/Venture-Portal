'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { RowActions, StatusView } from '@/lib/payroll-lifecycle'
import MenuPanel, { beside, type MenuAnchor } from '../../../revenue/[sub]/hierarchy/_components/ContextMenuPanel'
import styles from '../../../revenue/[sub]/hierarchy/_components/membership-controls.module.css'
import { cancelPayrollResubmit, completePayrollRows, resubmitPayrollRow, unlockPayrollRows } from '../actions'
import type { PayrollRowData } from './PayrollGrid'

export type RowMenuAnchor = MenuAnchor

interface Props {
  row: PayrollRowData
  period: string
  anchor: RowMenuAnchor
  byRightClick: boolean
  actions: RowActions
  status: StatusView
  /** Staff only: open their paycheck window. */
  onOpenPaycheck?: () => void
  onClose: () => void
  onDone: (message: string) => void
}

/**
 * A person's right-click menu on HR › Payroll (unified Payroll, 2026-09-27).
 * The one new move is **Resubmit…** on somebody already sent to Finance: it
 * unlocks their pay for a second payment — amounts may only go up, and the
 * next batch sends only the difference. The write sits behind an adjacent
 * confirmation, like the bill menu's (DESIGN.md › Membership context menu).
 */
export default function PayrollRowMenu({ row, period, anchor, byRightClick, actions, status, onOpenPaycheck, onClose, onDone }: Props) {
  const router = useRouter()
  const boundary = useRef<HTMLDivElement>(null)
  const resubmitButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<HTMLButtonElement | null>(null)
  const writing = useRef(false)
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<{ anchor: MenuAnchor } | null>(null)
  const [confirmStacked, setConfirmStacked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmId = useId()
  const month = new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const where = row.origin === 'revenue' ? 'Comm Cal' : row.origin === 'director' ? 'Director Salary' : null

  function close() {
    if (!writing.current) onClose()
  }

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-payroll-menu-trigger]')) return
      if (!writing.current && !boundary.current?.contains(event.target as Node)) onClose()
    }
    const dismiss = (event: Event) => {
      if (!writing.current && !(event.target instanceof Node && boundary.current?.contains(event.target))) onClose()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [onClose])

  useLayoutEffect(() => {
    restoreFocus.current?.focus({ preventScroll: true })
    restoreFocus.current = null
  }, [confirm])

  function run(action: () => Promise<string>) {
    if (writing.current) return
    writing.current = true
    setError(null)
    startTransition(async () => {
      try {
        const message = await action()
        router.refresh()
        writing.current = false
        onDone(message)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      } finally {
        writing.current = false
      }
    })
  }

  function go(href: string, newTab: boolean) {
    if (writing.current) return
    if (newTab) window.open(href, '_blank', 'noopener')
    else router.push(href)
    onClose()
  }

  const sourceHref = row.origin === 'revenue' ? row.comm_cal_href ?? null : row.origin === 'director' ? row.director_href ?? null : null

  // Portalled outside the sheet: `sheet-theme` brings its palette along.
  return createPortal(
    <div ref={boundary} className={`${styles.layer} sheet-theme`} onContextMenu={event => event.preventDefault()}>
      <MenuPanel label={`Actions for ${row.staff_name}`} anchor={anchor} focus hidden={!!confirm && confirmStacked}
        onBack={close} onClose={close}>
        <div className={styles.menuHeading}>
          {row.staff_name} · {row.dept_name}
          <span className="block text-[11px] mt-0.5">{status.label} — {status.detail}</span>
        </div>

        {onOpenPaycheck ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => { onOpenPaycheck(); onClose() }}>
            Open paycheck
          </button>
        ) : null}
        {sourceHref ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => go(sourceHref, false)}>
            <span className={styles.rowCopy}>
              <span>Open on {where}</span>
              <small>{row.origin === 'revenue' ? 'Close or reopen them there' : 'Keyed and Completed there'}</small>
            </span>
          </button>
        ) : null}

        {actions.complete ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
            onClick={() => run(async () => {
              const r = await completePayrollRows(period, [row.id])
              return r.unchanged ? `${row.staff_name}: nothing changed — back as sent` : `${row.staff_name} completed — Submit to Finance when ready`
            })}>
            <span className={styles.rowCopy}><span>Complete</span><small>The figures are checked — waits for the next batch</small></span>
          </button>
        ) : null}
        {actions.unlock ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
            onClick={() => run(async () => {
              await unlockPayrollRows(period, [row.id])
              return `${row.staff_name} unlocked — editable again`
            })}>
            <span className={styles.rowCopy}><span>Unlock</span><small>Back to an editable draft</small></span>
          </button>
        ) : null}

        {actions.resubmit ? (
          <button ref={resubmitButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog"
            aria-expanded={!!confirm} aria-controls={confirm ? confirmId : undefined} disabled={pending}
            onClick={() => {
              if (writing.current || !resubmitButton.current) return
              setError(null)
              setConfirm({ anchor: beside(resubmitButton.current) })
            }}>
            <span className={styles.rowCopy}>
              <span>Resubmit…</span>
              <small>A second payment for {month} — only the difference goes</small>
            </span>
          </button>
        ) : (row.status === 'submitted' || row.status === 'paid') ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled>
            <span className={styles.rowCopy}>
              <span>Resubmit</span>
              <small>{actions.hint === 'This month is closed for good' ? actions.hint : `Paid before batches existed — change it on ${where ?? 'its own page'}`}</small>
            </span>
          </button>
        ) : null}

        {actions.cancelResubmit ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
            onClick={() => run(async () => {
              await cancelPayrollResubmit(period, row.scope, row.id)
              return `${row.staff_name} is back as sent`
            })}>
            <span className={styles.rowCopy}><span>Put back as sent</span><small>Only while nothing has changed since</small></span>
          </button>
        ) : null}

        {!confirm && pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
        {!confirm && error ? <p role="alert" className={styles.error}>{error}</p> : null}
        {byRightClick ? <p className={styles.hint}>Shift + right-click opens the browser&apos;s own menu.</p> : null}
      </MenuPanel>

      {confirm ? (
        <MenuPanel id={confirmId} label={`Resubmit ${row.staff_name}`} anchor={confirm.anchor} submenu dialog focus
          onStackedChange={setConfirmStacked}
          onBack={() => {
            if (writing.current) return
            restoreFocus.current = resubmitButton.current
            setConfirm(null)
            setConfirmStacked(false)
            setError(null)
          }}
          onClose={close}>
          <div className={styles.menuHeading}>Resubmit {row.staff_name}?</div>
          <p className={styles.confirmCopy}>
            Unlocks their <strong>{month}</strong> pay for a second payment. Amounts can only go up.
            {where
              ? <> Change it on <strong>{where}</strong>{row.origin === 'revenue' ? ' (reopen and close them again)' : ' and Complete it there'}, </>
              : <> Edit the row and Complete it, </>}
            then Submit to Finance: the next batch asks Finance for the difference alone, and only the difference is paid.
          </p>
          <button type="button" disabled={pending} onClick={() => {
            restoreFocus.current = resubmitButton.current
            setConfirm(null)
            setConfirmStacked(false)
          }}>Cancel</button>
          <button type="button" disabled={pending} onClick={() => run(async () => {
            await resubmitPayrollRow(period, row.scope, row.id)
            return `${row.staff_name} unlocked for a resubmit — amounts can only go up`
          })}>
            <strong>Resubmit</strong>
          </button>
          {pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </MenuPanel>
      ) : null}
    </div>,
    document.body,
  )
}
