'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { topupKindLabel, type RowActions, type StatusView, type TopupKind } from '@/lib/payroll-lifecycle'
import MenuPanel, { beside, type MenuAnchor } from '../../../revenue/[sub]/hierarchy/_components/ContextMenuPanel'
import styles from '../../../revenue/[sub]/hierarchy/_components/membership-controls.module.css'
import { PAYROLL_FIELD_LABELS } from '@/lib/payroll-grid'
import {
  cancelPayrollResubmit,
  completePayrollRows,
  resetStaffStatutoryToLookup,
  resubmitPayrollRow,
  unlockPayrollRows,
} from '../actions'
import type { PayrollRowData } from './PayrollGrid'

export type RowMenuAnchor = MenuAnchor

interface Props {
  row: PayrollRowData
  period: string
  anchor: RowMenuAnchor
  actions: RowActions
  status: StatusView
  /** Staff only: open their paycheck window. */
  onOpenPaycheck?: () => void
  onClose: () => void
  onDone: (message: string) => void
}

/**
 * A person's right-click menu on HR › Payroll (unified Payroll, 2026-09-27).
 * Somebody already sent to Finance can be unlocked for another payment, two
 * ways that work alike but are recorded apart (user 2026-09-27: 以后要 track
 * 的话，就容易 track 回：哪一些是写错要 resubmit，哪一些是属于 second payroll):
 * **Resubmit…** corrects something sent; **Second payroll…** is a planned
 * second payment, e.g. a sub-department that pays on the 15th. Either way the
 * amounts may only go up and the next batch sends only the difference. Each
 * write sits behind its own adjacent confirmation, like the bill menu's
 * (DESIGN.md › Membership context menu). One line a row, like the bill menu
 * (2026-10-12): what a row's second line said is its tooltip, and the
 * Shift + right-click hint at the foot went.
 */
export default function PayrollRowMenu({ row, period, anchor, actions, status, onOpenPaycheck, onClose, onDone }: Props) {
  const router = useRouter()
  const boundary = useRef<HTMLDivElement>(null)
  const resubmitButton = useRef<HTMLButtonElement>(null)
  const secondButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<HTMLButtonElement | null>(null)
  const writing = useRef(false)
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<{ anchor: MenuAnchor; kind: TopupKind } | null>(null)
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

  const opener = (kind: TopupKind) => (kind === 'second_payroll' ? secondButton : resubmitButton).current

  function ask(kind: TopupKind) {
    const button = opener(kind)
    if (writing.current || !button) return
    setError(null)
    setConfirm({ anchor: beside(button), kind })
  }

  const sourceHref = row.origin === 'revenue' ? row.comm_cal_href ?? null : row.origin === 'director' ? row.director_href ?? null : null
  // A draft whose statutory is not all JADUAL's: figures typed on the grid
  // (2026-09-30), or the InfoTech file's. Reset gives all seven back to JADUAL.
  const typedNames = (row.statutory_typed ?? []).map(f => PAYROLL_FIELD_LABELS[f]).join(', ')
  const canReset = row.scope === 'staff' && row.status === 'draft' && (!!typedNames || !!row.statutory_overridden_at)

  // Portalled outside the sheet: `sheet-theme` brings its palette along.
  return createPortal(
    <div ref={boundary} className={`${styles.layer} sheet-theme`} onContextMenu={event => event.preventDefault()}>
      <MenuPanel label={`Actions for ${row.staff_name}`} anchor={anchor} focus hidden={!!confirm && confirmStacked}
        onBack={close} onClose={close}>
        <div className={styles.menuHeading}>
          {row.staff_name} · {row.dept_name}
          <span className="block text-[11px] mt-0.5" title={status.detail}>{status.label}</span>
        </div>

        {onOpenPaycheck ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => { onOpenPaycheck(); onClose() }}>
            Open paycheck
          </button>
        ) : null}
        {sourceHref ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => go(sourceHref, false)}>
            Open on {where}
          </button>
        ) : null}

        {actions.complete ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
            onClick={() => run(async () => {
              const r = await completePayrollRows(period, [row.id])
              return r.unchanged ? `${row.staff_name}: nothing changed — back as sent` : `${row.staff_name} completed — Submit to Finance when ready`
            })}>
            Complete
          </button>
        ) : null}
        {actions.unlock ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
            onClick={() => run(async () => {
              await unlockPayrollRows(period, [row.id])
              return `${row.staff_name} unlocked — editable again`
            })}>
            Unlock
          </button>
        ) : null}
        {canReset ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
            title={`${typedNames ? `Typed by hand: ${typedNames}` : 'From the InfoTech file'} — JADUAL works them out again`}
            onClick={() => run(async () => {
              await resetStaffStatutoryToLookup(row.id)
              return `${row.staff_name}: EPF, SOCSO, EIS and PCB are JADUAL's again`
            })}>
            Reset statutory to JADUAL
          </button>
        ) : null}

        {actions.resubmit ? (
          <>
            <button ref={resubmitButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog"
              aria-expanded={confirm?.kind === 'resubmit'} aria-controls={confirm?.kind === 'resubmit' ? confirmId : undefined}
              title="A correction to what was sent — only the difference goes"
              disabled={pending} onClick={() => ask('resubmit')}>
              Resubmit…
            </button>
            <button ref={secondButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog"
              aria-expanded={confirm?.kind === 'second_payroll'} aria-controls={confirm?.kind === 'second_payroll' ? confirmId : undefined}
              title={`A planned second payment for ${month} (e.g. the 15th) — only the difference goes`}
              disabled={pending} onClick={() => ask('second_payroll')}>
              Second payroll…
            </button>
          </>
        ) : (row.status === 'submitted' || row.status === 'paid') ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled
            title={actions.hint === 'This month is closed for good' ? actions.hint : `Paid before batches existed — change it on ${where ?? 'its own page'}`}>
            Resubmit · Second payroll
          </button>
        ) : null}

        {actions.cancelResubmit ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
            onClick={() => run(async () => {
              await cancelPayrollResubmit(period, row.scope, row.id)
              return `${row.staff_name} is back as sent`
            })}>
            Put back as sent
          </button>
        ) : null}

        {!confirm && pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
        {!confirm && error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </MenuPanel>

      {confirm ? (
        <MenuPanel id={confirmId} label={`${topupKindLabel(confirm.kind)} ${row.staff_name}`} anchor={confirm.anchor} submenu dialog focus
          onStackedChange={setConfirmStacked}
          onBack={() => {
            if (writing.current) return
            restoreFocus.current = opener(confirm.kind)
            setConfirm(null)
            setConfirmStacked(false)
            setError(null)
          }}
          onClose={close}>
          <div className={styles.menuHeading}>
            {confirm.kind === 'second_payroll' ? `A second payroll for ${row.staff_name}?` : `Resubmit ${row.staff_name}?`}
          </div>
          <p className={styles.confirmCopy}>
            {confirm.kind === 'second_payroll'
              ? <>A planned second payment of their <strong>{month}</strong> pay — e.g. a sub-department that pays on the 15th — recorded as a second payroll, not a correction.</>
              : <>A correction: unlocks their <strong>{month}</strong> pay to put right what was sent — recorded as a resubmit.</>}
            {' '}Amounts can only go up — a deduction no PV pays yet, such as PCB, may come down.
            {where
              ? <> Change it on <strong>{where}</strong>{row.origin === 'revenue' ? ' (reopen and close them again)' : ' and Complete it there'}, </>
              : <> Edit the row and Complete it, </>}
            then Submit to Finance: the next batch asks Finance for the difference alone, and only the difference is paid.
          </p>
          <button type="button" disabled={pending} onClick={() => {
            restoreFocus.current = opener(confirm.kind)
            setConfirm(null)
            setConfirmStacked(false)
          }}>Cancel</button>
          <button type="button" disabled={pending} onClick={() => run(async () => {
            await resubmitPayrollRow(period, row.scope, row.id, confirm.kind)
            return confirm.kind === 'second_payroll'
              ? `${row.staff_name} unlocked for a second payroll — amounts can only go up`
              : `${row.staff_name} unlocked for a resubmit — amounts can only go up`
          })}>
            <strong>{confirm.kind === 'second_payroll' ? 'Second payroll' : 'Resubmit'}</strong>
          </button>
          {pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </MenuPanel>
      ) : null}
    </div>,
    document.body,
  )
}
