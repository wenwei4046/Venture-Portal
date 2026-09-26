'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { excludeOrder, includeOrder, type BillCountResult } from '../../../../run-actions'
import type { BillCountAction } from '@/lib/commission/bill-exclusion'
import MenuPanel, { beside, type MenuAnchor } from '../../../hierarchy/_components/ContextMenuPanel'
import styles from '../../../hierarchy/_components/membership-controls.module.css'

/** The one bill a menu is about, already resolved on the server. */
export interface BillMenuBill {
  orderId: string
  orderNo: string
  href: string
  /** Whose bill, for the heading. */
  who: string | null
  action: BillCountAction
  /** "Taken out by Principal on 27 Sep 2026 — duplicate", while it is out by hand. */
  exclusionDetail: string | null
}

export interface BillMenuOutcome {
  orderId: string
  orderNo: string
  /** True: it no longer counts. False: the hand let go of it. */
  excluded: boolean
  result: BillCountResult
}

interface Props {
  bill: BillMenuBill
  anchor: MenuAnchor
  monthLabel: string
  /** Another link the right-click landed on — the salesperson's bills, the venue. */
  link?: { href: string; label: string } | null
  /** Opened by a right-click, which is when the browser's own menu is worth a mention. */
  byRightClick?: boolean
  onClose: () => void
  onDone: (outcome: BillMenuOutcome) => void
}

/**
 * A bill's right-click menu on Sales orders (2026-09-27): open it, and decide
 * whether it counts. *Don't count this bill…* takes it out of the month the
 * way an ERP cancellation does and stays out through every ERP re-send;
 * *Count this bill again* undoes it. Same paper panels as the hierarchy's
 * person menu (DESIGN.md › Membership context menu): the write sits behind an
 * adjacent confirmation, never a hover, and an error stays in the panel.
 */
export default function BillContextMenu({ bill, anchor, monthLabel, link = null, byRightClick = false, onClose, onDone }: Props) {
  const router = useRouter()
  const boundary = useRef<HTMLDivElement>(null)
  const countButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<HTMLButtonElement | null>(null)
  const writing = useRef(false)
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<{ anchor: MenuAnchor } | null>(null)
  const [confirmStacked, setConfirmStacked] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()
  const confirmId = useId()
  const action = bill.action

  function close() {
    if (!writing.current) onClose()
  }

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      // A row's ⋯ toggles the menu itself; closing here would reopen it on the click.
      if (event.target instanceof Element && event.target.closest('[data-bill-menu-trigger]')) return
      if (!writing.current && !boundary.current?.contains(event.target as Node)) onClose()
    }
    const dismiss = (event: Event) => {
      // Scrolling the table moves the bill out from under its menu.
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

  function openConfirm() {
    if (writing.current || !countButton.current) return
    setError(null)
    setConfirm({ anchor: beside(countButton.current) })
  }

  function backFromConfirm() {
    if (writing.current) return
    restoreFocus.current = countButton.current
    setConfirm(null)
    setConfirmStacked(false)
    setError(null)
  }

  function run(excluding: boolean) {
    if (writing.current) return
    writing.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = excluding ? await excludeOrder(bill.orderId, note) : await includeOrder(bill.orderId)
        router.refresh()
        writing.current = false
        onDone({ orderId: bill.orderId, orderNo: bill.orderNo, excluded: excluding, result })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      } finally {
        writing.current = false
      }
    })
  }

  function open(href: string, newTab: boolean) {
    if (writing.current) return
    if (newTab) window.open(href, '_blank', 'noopener')
    else router.push(href)
    onClose()
  }

  function countRow() {
    switch (action.kind) {
      case 'exclude':
        return (
          <button ref={countButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog"
            aria-expanded={!!confirm} aria-controls={confirm ? confirmId : undefined} disabled={pending}
            onClick={openConfirm}>
            <span className={styles.rowCopy}>
              <span>Don&apos;t count this bill…</span>
              <small>Takes it out of {monthLabel}&apos;s commission</small>
            </span>
          </button>
        )
      case 'include':
        return (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => run(false)}>
            <span className={styles.rowCopy}>
              <span>Count this bill again</span>
              {bill.exclusionDetail ? <small>{bill.exclusionDetail}</small> : null}
              {action.stillOut ? <small>It still will not count: {action.stillOut}</small> : null}
            </span>
          </button>
        )
      case 'locked':
        return (
          <button type="button" role="menuitem" tabIndex={-1} disabled>
            <span className={styles.rowCopy}>
              <span>{action.excludedByHand ? 'Count this bill again' : "Don't count this bill"}</span>
              <small>{action.reason}</small>
            </span>
          </button>
        )
      case 'unavailable':
        return (
          <button type="button" role="menuitem" tabIndex={-1} disabled>
            <span className={styles.rowCopy}>
              <span>Don&apos;t count this bill</span>
              <small>Already not counted — {action.reason}</small>
            </span>
          </button>
        )
    }
  }

  // Portalled outside the sheet: `sheet-theme` brings its palette along.
  return createPortal(
    <div ref={boundary} className={`${styles.layer} sheet-theme`} onContextMenu={event => event.preventDefault()}>
      <MenuPanel label={`Actions for ${bill.orderNo}`} anchor={anchor} focus hidden={!!confirm && confirmStacked}
        onBack={close} onClose={close}>
        <div className={styles.menuHeading}>{bill.orderNo}{bill.who ? ` · ${bill.who}` : ''}</div>
        <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => open(bill.href, false)}>
          Open bill
        </button>
        <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => open(bill.href, true)}>
          Open bill in new tab
        </button>
        {link ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => open(link.href, true)}>
            <span className={styles.rowCopy}><span>Open link in new tab</span><small>{link.label}</small></span>
          </button>
        ) : null}
        {countRow()}
        {!confirm && pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
        {!confirm && error ? <p role="alert" className={styles.error}>{error}</p> : null}
        {/* Stays while the confirmation is open: a panel that lost a row would
            jump under the pointer that just chose from it. */}
        {byRightClick ? <p className={styles.hint}>Shift + right-click opens the browser&apos;s own menu.</p> : null}
      </MenuPanel>

      {confirm ? (
        <MenuPanel id={confirmId} label={`Don't count ${bill.orderNo}`} anchor={confirm.anchor} submenu dialog focus
          onStackedChange={setConfirmStacked} onBack={backFromConfirm} onClose={close}>
          <div className={styles.menuHeading}>Don&apos;t count {bill.orderNo}?</div>
          <p className={styles.confirmCopy}>
            It leaves <strong>{monthLabel}</strong>&apos;s commission — no commission on it, no group sales or
            override, no KPI or Open Bill — as if the ERP had cancelled it, and it stays out whatever the ERP
            sends next until somebody counts it again.
          </p>
          <label className={styles.dateField} htmlFor={noteId}>
            Why (optional)
            <input id={noteId} type="text" value={note} maxLength={500} disabled={pending}
              placeholder="e.g. duplicate of HC-SO-013251"
              onChange={event => { setNote(event.target.value); setError(null) }}
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                run(true)
              }} />
          </label>
          <button type="button" disabled={pending} onClick={backFromConfirm}>Cancel</button>
          <button type="button" className={styles.danger} disabled={pending} onClick={() => run(true)}>
            Don&apos;t count this bill
          </button>
          {pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </MenuPanel>
      ) : null}
    </div>,
    document.body,
  )
}
