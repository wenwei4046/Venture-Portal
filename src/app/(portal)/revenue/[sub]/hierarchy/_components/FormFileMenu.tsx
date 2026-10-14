'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import MenuPanel, { beside, type MenuAnchor } from './ContextMenuPanel'
import styles from './membership-controls.module.css'

/**
 * The uploaded form's right-click menu (2026-10-14, the user: "right click
 * 然后按 view，同时也可以按 remove。因为如果我 upload 错的话，我需要 remove 掉"):
 * the file's name, *View* and *Remove…* — on the page's own paper menu
 * (`MenuPanel`, as a person's or a bill's). Remove sits behind an adjacent
 * confirmation whose last control alone is danger (DESIGN.md › Membership
 * context menu); it stays open while the form is saved and says why when the
 * save is refused.
 */
export default function FormFileMenu({
  name,
  anchor,
  removing,
  error,
  onView,
  onRemove,
  onClose,
  onKeyClose,
}: {
  name: string
  anchor: MenuAnchor
  /** Remove is being saved: nothing closes the menu meanwhile. */
  removing: boolean
  error: string | null
  onView: () => void
  onRemove: () => void
  onClose: () => void
  /** Closed from the keys (Esc, ←, Tab): focus goes back to the chip. */
  onKeyClose?: () => void
}) {
  const boundary = useRef<HTMLDivElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<HTMLButtonElement | null>(null)
  const [confirm, setConfirm] = useState<MenuAnchor | null>(null)
  const [stacked, setStacked] = useState(false)
  const confirmId = useId()

  function close() {
    if (removing) return
    onClose()
    onKeyClose?.()
  }

  useEffect(() => {
    // While Remove is saved nothing closes the menu: its answer lands here.
    if (removing) return
    const outside = (event: PointerEvent) => {
      if (!boundary.current?.contains(event.target as Node)) onClose()
    }
    const dismiss = (event: Event) => {
      if (!(event.target instanceof Node && boundary.current?.contains(event.target))) onClose()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [onClose, removing])

  useLayoutEffect(() => {
    restoreFocus.current?.focus({ preventScroll: true })
    restoreFocus.current = null
  }, [confirm])

  function back() {
    if (removing) return
    restoreFocus.current = removeButton.current
    setConfirm(null)
    setStacked(false)
  }

  // Portalled outside the sheet: `sheet-theme` brings its palette along.
  return createPortal(
    <div ref={boundary} className={`${styles.layer} sheet-theme`} onContextMenu={event => event.preventDefault()}>
      <MenuPanel label={`Uploaded form ${name}`} anchor={anchor} focus hidden={!!confirm && stacked} onBack={close} onClose={close}>
        <div className={styles.menuHeading}>{name}</div>
        <button type="button" role="menuitem" tabIndex={-1} disabled={removing} onClick={onView}>
          View
        </button>
        <button
          ref={removeButton}
          type="button"
          role="menuitem"
          tabIndex={-1}
          aria-haspopup="dialog"
          aria-expanded={!!confirm}
          aria-controls={confirm ? confirmId : undefined}
          disabled={removing}
          onClick={() => {
            if (removeButton.current) setConfirm(beside(removeButton.current))
          }}
        >
          Remove…
        </button>
      </MenuPanel>

      {confirm ? (
        <MenuPanel id={confirmId} label={`Remove ${name}`} anchor={confirm} submenu dialog focus onStackedChange={setStacked} onBack={back} onClose={close}>
          <div className={styles.menuHeading}>Remove this form?</div>
          <p className={styles.confirmCopy}>
            Members download the built form until another is uploaded. <strong>{name}</strong> is deleted.
          </p>
          <button type="button" disabled={removing} onClick={back}>
            Cancel
          </button>
          <button type="button" className={styles.danger} disabled={removing} onClick={onRemove}>
            <strong>Remove</strong>
          </button>
          {removing ? <p role="status" className={styles.hint}>Removing…</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        </MenuPanel>
      ) : null}
    </div>,
    document.body,
  )
}
