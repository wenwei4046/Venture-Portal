'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { excludeOrder, includeOrder, moveOrder, setOrderBrand, shareOrder, unshareOrder, type BillBrandResult, type BillCountResult } from '../../../../run-actions'
import type { BillCountAction } from '@/lib/commission/bill-exclusion'
import type { BillBrandAction, BrandOption } from '@/lib/commission/bill-brand'
import { moveProblem, type BillMoveAction, type BillMoveResult } from '@/lib/commission/bill-move'
import {
  defaultPartFor, holdersLine, parsePart, partsAfter, shareProblem, sharePct,
  type BillShareAction, type BillShareAnswer, type BillShareResult, type ShareCandidate, type ShareHolder,
} from '@/lib/commission/bill-share'
import MenuPanel, { beside, type MenuAnchor } from '../../../hierarchy/_components/ContextMenuPanel'
import styles from '../../../hierarchy/_components/membership-controls.module.css'
import { Select, inSoftMenu } from '@/components/hrv/select'

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

/** What *Brand for the margin* did. */
export interface BillBrandOutcome {
  orderId: string
  orderNo: string
  result: BillBrandResult
}

/** What *Share this bill…* did — a share, a changed part, or a stop. */
export interface BillShareOutcome {
  orderId: string
  orderNo: string
  result: BillShareResult
  /** Set once the notice's Undo has put it back: nothing left to undo. */
  undone?: boolean
}

/** What *Move to another salesperson…* did (2026-10-12). */
export interface BillMoveOutcome {
  result: BillMoveResult
  /** Set once the notice's Undo has moved it back: nothing left to undo. */
  undone?: boolean
}

interface Props {
  bill: BillMenuBill
  anchor: MenuAnchor
  monthLabel: string
  /** Another link the right-click landed on — the salesperson's bills, the venue. */
  link?: { href: string; label: string } | null
  /**
   * *Brand for the margin* (2026-09-27): only on a bill nothing names a brand
   * for, or one given its brand here. Null or absent: no row.
   */
  brand?: { action: BillBrandAction; options: readonly BrandOption[] } | null
  /**
   * *Share this bill…* (2026-09-30): who holds the bill now, and the team it
   * may be shared with. Null or absent: no row.
   */
  share?: { action: BillShareAction; candidates: readonly ShareCandidate[] } | null
  /**
   * *Move to another salesperson…* (2026-10-12): whose the bill is, and the
   * team it may go to. Null or absent: no row.
   */
  move?: { action: BillMoveAction; candidates: readonly ShareCandidate[] } | null
  onClose: () => void
  onDone: (outcome: BillMenuOutcome) => void
  onBrandDone?: (outcome: BillBrandOutcome) => void
  onShareDone?: (outcome: BillShareOutcome) => void
  onMoveDone?: (outcome: BillMoveOutcome) => void
}

/**
 * A bill's right-click menu on Sales orders (2026-09-27): open it, and decide
 * whether it counts. *Don't count this bill…* takes it out of the month the
 * way an ERP cancellation does and stays out through every ERP re-send;
 * *Count this bill again* undoes it. Same paper panels as the hierarchy's
 * person menu (DESIGN.md › Membership context menu): the write sits behind an
 * adjacent confirmation, never a hover, and an error stays in the panel.
 *
 * *Share this bill…* (2026-09-30) opens a small form beside the menu: who
 * with, their part (50% to start), Save. The bill then sits on both ledgers,
 * each holder's part at their own rate; *Cancel share with …* — a line of the
 * menu itself since 2026-10-12, and in the panel — gives a part back to the
 * owner.
 */
export default function BillContextMenu({ bill, anchor, monthLabel, link = null, brand = null, share = null, move = null, onClose, onDone, onBrandDone, onShareDone, onMoveDone }: Props) {
  const router = useRouter()
  const boundary = useRef<HTMLDivElement>(null)
  const countButton = useRef<HTMLButtonElement>(null)
  const brandButton = useRef<HTMLButtonElement>(null)
  const shareButton = useRef<HTMLButtonElement>(null)
  const moveButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<HTMLButtonElement | null>(null)
  const writing = useRef(false)
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<{ anchor: MenuAnchor } | null>(null)
  const [confirmStacked, setConfirmStacked] = useState(false)
  const [brandPanel, setBrandPanel] = useState<{ anchor: MenuAnchor } | null>(null)
  const [brandStacked, setBrandStacked] = useState(false)
  const [sharePanel, setSharePanel] = useState<{ anchor: MenuAnchor } | null>(null)
  const [shareStacked, setShareStacked] = useState(false)
  const [shareWith, setShareWith] = useState('')
  const [partText, setPartText] = useState('50')
  const [movePanel, setMovePanel] = useState<{ anchor: MenuAnchor } | null>(null)
  const [moveStacked, setMoveStacked] = useState(false)
  const [moveTo, setMoveTo] = useState('')
  const [moveNote, setMoveNote] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const noteId = useId()
  const confirmId = useId()
  const brandId = useId()
  const shareId = useId()
  const shareWithId = useId()
  const partId = useId()
  const moveId = useId()
  const moveToId = useId()
  const moveNoteId = useId()
  const action = bill.action
  const nameOf = (code: string) => brand?.options.find(o => o.code === code)?.name ?? code

  function close() {
    if (!writing.current) onClose()
  }

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      // A row's ⋯ toggles the menu itself; closing here would reopen it on the click.
      if (event.target instanceof Element && event.target.closest('[data-bill-menu-trigger]')) return
      // The Share list's soft menu lives on <body>: a pick there is the menu's own work.
      if (inSoftMenu(event.target)) return
      if (!writing.current && !boundary.current?.contains(event.target as Node)) onClose()
    }
    const dismiss = (event: Event) => {
      // Scrolling the table moves the bill out from under its menu (scrolling the soft menu's list does not).
      if (inSoftMenu(event.target)) return
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
  }, [confirm, brandPanel, sharePanel, movePanel])

  function openConfirm() {
    if (writing.current || !countButton.current) return
    setError(null)
    setBrandPanel(null)
    setSharePanel(null)
    setMovePanel(null)
    setConfirm({ anchor: beside(countButton.current) })
  }

  function openBrand() {
    if (writing.current || !brandButton.current) return
    setError(null)
    setConfirm(null)
    setSharePanel(null)
    setMovePanel(null)
    setBrandPanel({ anchor: beside(brandButton.current) })
  }

  // ── Move to another salesperson (2026-10-12) ─────────────────────────────
  // Who it goes to (the team, never whoever has it now) and, if they like,
  // why; Move writes it. A bill already moved can go back to the salesperson
  // the ERP names from the same panel.
  const moveAction = move?.action ?? null
  const moveCandidates = (move?.candidates ?? []).filter(c => c.staffId !== moveAction?.owner.staffId)
  const moveTarget = moveCandidates.find(c => c.staffId === moveTo) ?? null
  const moveIssue = moveAction ? moveProblem(moveAction.owner, moveTo) : null

  function openMove() {
    if (writing.current || !moveButton.current || !moveAction) return
    setError(null)
    setConfirm(null)
    setBrandPanel(null)
    setSharePanel(null)
    setMoveTo('')
    setMoveNote('')
    setMovePanel({ anchor: beside(moveButton.current) })
  }

  function backFromMove() {
    if (writing.current) return
    restoreFocus.current = moveButton.current
    setMovePanel(null)
    setMoveStacked(false)
    setError(null)
  }

  function runMove(staffId: string | null) {
    if (writing.current) return
    writing.current = true
    setError(null)
    startTransition(async () => {
      try {
        const answer = await moveOrder(bill.orderId, staffId, moveNote)
        // A refusal comes back as words (a closed month, a paid run): it stays in the panel.
        if (!answer.ok) {
          setError(answer.reason)
          return
        }
        router.refresh()
        writing.current = false
        onMoveDone?.({ result: answer.result })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      } finally {
        writing.current = false
      }
    })
  }

  function moveRow() {
    if (!moveAction) return null
    if (moveAction.kind === 'locked') {
      return (
        <button type="button" role="menuitem" tabIndex={-1} disabled title={moveAction.reason}>
          Move to another salesperson
        </button>
      )
    }
    return (
      <button ref={moveButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog"
        aria-expanded={!!movePanel} aria-controls={movePanel ? moveId : undefined} disabled={pending}
        title={moveAction.named ? `Moved here from ${moveAction.named.name}` : undefined} onClick={openMove}>
        Move to another salesperson…
      </button>
    )
  }

  // ── Share this bill (2026-09-30) ─────────────────────────────────────────
  // Who with, and their part; Save writes it. The owner is never offered —
  // their part is what nobody else holds — and a holder already on the bill
  // can be given a new part the same way, or let go of below.
  const shareAction = share?.action ?? null
  const owner = shareAction ? { staffId: shareAction.ownerStaffId, name: shareAction.ownerName } : null
  const holders: ShareHolder[] = shareAction?.parts ?? []
  const candidates = (share?.candidates ?? []).filter(c => c.staffId !== owner?.staffId)
  const target = candidates.find(c => c.staffId === shareWith) ?? null
  const part = parsePart(partText)
  const problem = owner ? shareProblem(holders, owner, shareWith, part) : null
  const heldBy = (staffId: string) => holders.find(h => h.staffId === staffId && h.staffId !== owner?.staffId) ?? null

  function openShare() {
    if (writing.current || !shareButton.current || !shareAction) return
    setError(null)
    setConfirm(null)
    setBrandPanel(null)
    setMovePanel(null)
    setShareWith('')
    setPartText(String(defaultPartFor(holders, shareAction.ownerStaffId, '')))
    setSharePanel({ anchor: beside(shareButton.current) })
  }

  function backFromShare() {
    if (writing.current) return
    restoreFocus.current = shareButton.current
    setSharePanel(null)
    setShareStacked(false)
    setError(null)
  }

  function chooseShareWith(staffId: string) {
    setShareWith(staffId)
    setError(null)
    if (owner && staffId) setPartText(String(defaultPartFor(holders, owner.staffId, staffId)))
  }

  function runShareWrite(write: () => Promise<BillShareAnswer>) {
    if (writing.current) return
    writing.current = true
    setError(null)
    startTransition(async () => {
      try {
        const answer = await write()
        // A refusal comes back as words (a closed month, a paid run): it stays in the panel.
        if (!answer.ok) {
          setError(answer.reason)
          return
        }
        router.refresh()
        writing.current = false
        onShareDone?.({ orderId: bill.orderId, orderNo: bill.orderNo, result: answer.result })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      } finally {
        writing.current = false
      }
    })
  }

  function saveShare() {
    if (problem || part === null || !shareWith) return
    runShareWrite(() => shareOrder(bill.orderId, shareWith, part))
  }

  // ONE LINE A ROW (2026-10-12, the user: "delete the description on the
  // selection, make it clean and nice"). What a row's second line said is its
  // tooltip now — why a row is shut, who holds a shared bill — and the panel
  // it opens says the rest.
  function shareRow() {
    if (!shareAction) return null
    const shared = holders.length > 1 ? holdersLine(holders) : null
    if (shareAction.kind === 'locked') {
      return (
        <button type="button" role="menuitem" tabIndex={-1} disabled
          title={[shared, shareAction.reason].filter(Boolean).join(' — ')}>
          Share this bill
        </button>
      )
    }
    return (
      <button ref={shareButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog"
        aria-expanded={!!sharePanel} aria-controls={sharePanel ? shareId : undefined} disabled={pending}
        title={shared ?? undefined} onClick={openShare}>
        Share this bill…
      </button>
    )
  }

  // CANCEL SHARE (2026-10-12, the user: "for those shared bill, can pick cancel
  // share as well — at ADRIAN's side press cancel share to ANTHONY, then
  // ANTHONY's side will not have the share"): one line per holder, wherever
  // the bill's menu opens — the owner's ledger, the holder's, All bills. One
  // click; the owner takes the part back, and the notice offers Undo.
  function cancelShareRows() {
    if (!shareAction || !owner) return null
    return holders.filter(h => h.staffId !== owner.staffId).map(h => (
      <button key={h.staffId} type="button" role="menuitem" tabIndex={-1}
        disabled={pending || shareAction.kind === 'locked'}
        title={shareAction.kind === 'locked' ? shareAction.reason : `${owner.name} takes the ${sharePct(h.pct)} back`}
        onClick={() => runShareWrite(() => unshareOrder(bill.orderId, h.staffId))}>
        Cancel share with {h.name}
      </button>
    ))
  }

  function backFromBrand() {
    if (writing.current) return
    restoreFocus.current = brandButton.current
    setBrandPanel(null)
    setBrandStacked(false)
    setError(null)
  }

  function runBrand(code: string | null) {
    if (writing.current) return
    writing.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await setOrderBrand(bill.orderId, code)
        router.refresh()
        writing.current = false
        onBrandDone?.({ orderId: bill.orderId, orderNo: bill.orderNo, result })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      } finally {
        writing.current = false
      }
    })
  }

  function brandRow() {
    if (!brand) return null
    const picked = brand.action.picked
    if (brand.action.kind === 'locked') {
      return (
        <button type="button" role="menuitem" tabIndex={-1} disabled title={brand.action.reason}>
          Brand for the margin
        </button>
      )
    }
    return (
      <button ref={brandButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog"
        aria-expanded={!!brandPanel} aria-controls={brandPanel ? brandId : undefined} disabled={pending}
        title={picked ? `Picked here: ${nameOf(picked)}` : 'Nothing on this bill names a brand'} onClick={openBrand}>
        Brand for the margin…
      </button>
    )
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
            title={`Takes it out of ${monthLabel}'s commission`} onClick={openConfirm}>
            Don&apos;t count this bill…
          </button>
        )
      case 'include':
        return (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => run(false)}
            title={[bill.exclusionDetail, action.stillOut ? `It still will not count: ${action.stillOut}` : null].filter(Boolean).join(' — ') || undefined}>
            Count this bill again
          </button>
        )
      case 'locked':
        return (
          <button type="button" role="menuitem" tabIndex={-1} disabled title={action.reason}>
            {action.excludedByHand ? 'Count this bill again' : "Don't count this bill"}
          </button>
        )
      case 'unavailable':
        return (
          <button type="button" role="menuitem" tabIndex={-1} disabled title={`Already not counted — ${action.reason}`}>
            Don&apos;t count this bill
          </button>
        )
    }
  }

  // Portalled outside the sheet: `sheet-theme` brings its palette along.
  return createPortal(
    <div ref={boundary} className={`${styles.layer} sheet-theme`} onContextMenu={event => event.preventDefault()}>
      <MenuPanel label={`Actions for ${bill.orderNo}`} anchor={anchor} focus
        hidden={(!!confirm && confirmStacked) || (!!brandPanel && brandStacked) || (!!sharePanel && shareStacked) || (!!movePanel && moveStacked)}
        onBack={close} onClose={close}>
        <div className={styles.menuHeading}>{bill.orderNo}{bill.who ? ` · ${bill.who}` : ''}</div>
        <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => open(bill.href, false)}>
          Open bill
        </button>
        <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={() => open(bill.href, true)}>
          Open bill in new tab
        </button>
        {link ? (
          <button type="button" role="menuitem" tabIndex={-1} disabled={pending} title={link.label} onClick={() => open(link.href, true)}>
            Open link in new tab
          </button>
        ) : null}
        {shareRow()}
        {cancelShareRows()}
        {moveRow()}
        {countRow()}
        {brandRow()}
        {!confirm && !brandPanel && !sharePanel && !movePanel && pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
        {!confirm && !brandPanel && !sharePanel && !movePanel && error ? <p role="alert" className={styles.error}>{error}</p> : null}
      </MenuPanel>

      {movePanel && moveAction ? (
        <MenuPanel id={moveId} label={`Move ${bill.orderNo}`} anchor={movePanel.anchor} submenu dialog focus
          onStackedChange={setMoveStacked} onBack={backFromMove} onClose={close}>
          <div className={styles.menuHeading}>Move {bill.orderNo}</div>
          <p className={styles.confirmCopy}>
            {moveAction.owner.staffId ? `${moveAction.owner.name}'s bill` : 'A bill no salesperson is matched to'}
            {moveAction.named ? ` (the ERP names ${moveAction.named.name})` : ''}
            {holders.length > 1 ? `, shared ${holdersLine(holders)}` : ''}. It becomes the new
            salesperson&apos;s — their sales, at their rate, with their upline&apos;s override — and stays theirs
            whatever the ERP sends next.
          </p>
          <label className={styles.dateField} htmlFor={moveToId}>
            Move to
            <Select bare id={moveToId} data-autofocus value={moveTo} disabled={pending}
              onChange={event => { setMoveTo(event.target.value); setError(null) }}>
              <option value="">Choose a salesperson…</option>
              {moveCandidates.map(c => {
                // A holder takes all of it; their part comes back when it leaves them.
                const held = heldBy(c.staffId)
                return (
                  <option key={c.staffId} value={c.staffId} disabled={!!c.closed}>
                    {c.name}{held ? ` — holds ${sharePct(held.pct)}` : ''}{c.closed ? ` — ${c.closed}` : ''}
                  </option>
                )
              })}
            </Select>
          </label>
          <label className={styles.dateField} htmlFor={moveNoteId}>
            Why (optional)
            <input id={moveNoteId} type="text" value={moveNote} maxLength={500} disabled={pending}
              placeholder="e.g. keyed under the wrong name"
              onChange={event => { setMoveNote(event.target.value); setError(null) }}
              onKeyDown={event => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                if (!moveIssue && moveTarget) runMove(moveTarget.staffId)
              }} />
          </label>
          <button type="button" disabled={pending} onClick={backFromMove}>Cancel</button>
          <button type="button" className={styles.primary} disabled={pending || !!moveIssue || !moveTarget}
            onClick={() => moveTarget && runMove(moveTarget.staffId)}>
            {moveTarget ? `Move to ${moveTarget.name}` : 'Move'}
          </button>
          {moveAction.named && moveAction.named.staffId !== moveAction.owner.staffId ? (
            <>
              <div className={styles.groupHeading}>Moved here</div>
              <button type="button" disabled={pending} onClick={() => runMove(moveAction.named?.staffId ?? null)}>
                {moveAction.named.staffId ? `Give it back to ${moveAction.named.name}` : 'Give it back — to no salesperson'}
              </button>
            </>
          ) : null}
          {pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </MenuPanel>
      ) : null}

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

      {brandPanel && brand ? (
        <MenuPanel id={brandId} label={`Brand for ${bill.orderNo}`} anchor={brandPanel.anchor} submenu dialog focus
          onStackedChange={setBrandStacked} onBack={backFromBrand} onClose={close}>
          <div className={styles.menuHeading}>Which brand is {bill.orderNo} for?</div>
          <p className={styles.confirmCopy}>
            Nothing on this bill names a brand. Pick the brand of the fair it was sold at: its margin is judged on
            that brand&apos;s ladder, and it stays through every ERP re-send.
          </p>
          {brand.options.map(option => (
            <button key={option.code} type="button" disabled={pending || option.code === brand.action.picked}
              onClick={() => runBrand(option.code)}>
              {option.name}{option.code === brand.action.picked ? ' (picked)' : ''}
            </button>
          ))}
          {brand.action.picked ? (
            <button type="button" disabled={pending} onClick={() => runBrand(null)}>Take the pick off</button>
          ) : null}
          <button type="button" disabled={pending} onClick={backFromBrand}>Cancel</button>
          {pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </MenuPanel>
      ) : null}

      {sharePanel && shareAction && owner ? (
        <MenuPanel id={shareId} label={`Share ${bill.orderNo}`} anchor={sharePanel.anchor} submenu dialog focus
          onStackedChange={setShareStacked} onBack={backFromShare} onClose={close}>
          <div className={styles.menuHeading}>Share {bill.orderNo}</div>
          <p className={styles.confirmCopy}>
            {owner.name}&apos;s bill{holders.length > 1 ? `, now ${holdersLine(holders)}` : ''}. Each holder is paid on
            their own part at their own rate, and their upline earns the override on it.
          </p>
          <label className={styles.dateField} htmlFor={shareWithId}>
            Share with
            <Select bare id={shareWithId} data-autofocus value={shareWith} disabled={pending}
              onChange={event => chooseShareWith(event.target.value)}>
              <option value="">Choose a salesperson…</option>
              {candidates.map(c => {
                const held = heldBy(c.staffId)
                return (
                  <option key={c.staffId} value={c.staffId} disabled={!!c.closed}>
                    {c.name}{held ? ` — holds ${sharePct(held.pct)}` : ''}{c.closed ? ` — ${c.closed}` : ''}
                  </option>
                )
              })}
            </Select>
          </label>
          <label className={styles.dateField} htmlFor={partId}>
            Their part
            <span className={styles.partField}>
              <input id={partId} type="number" inputMode="decimal" min={1} max={99} step={1} value={partText}
                disabled={pending}
                onChange={event => { setPartText(event.target.value); setError(null) }}
                onKeyDown={event => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  saveShare()
                }} />
              %
            </span>
          </label>
          {/* What Save would leave, as it will be read everywhere after. */}
          <p className={styles.confirmCopy} aria-live="polite">
            {!shareWith
              ? `${owner.name} keeps what nobody else holds.`
              : problem ?? (target && part !== null ? holdersLine(partsAfter(holders, owner, target, part)) : '')}
          </p>
          <button type="button" disabled={pending} onClick={backFromShare}>Cancel</button>
          <button type="button" className={styles.primary} disabled={pending || !!problem} onClick={saveShare}>
            Save
          </button>
          {holders.length > 1 ? (
            <>
              <div className={styles.groupHeading}>Shared now</div>
              {holders.filter(h => h.staffId !== owner.staffId).map(h => (
                <button key={h.staffId} type="button" disabled={pending}
                  onClick={() => runShareWrite(() => unshareOrder(bill.orderId, h.staffId))}>
                  <span className={styles.rowCopy}>
                    <span>Cancel share with {h.name}</span>
                    <small>{owner.name} takes the {sharePct(h.pct)} back</small>
                  </span>
                </button>
              ))}
            </>
          ) : null}
          {pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </MenuPanel>
      ) : null}
    </div>,
    document.body,
  )
}
