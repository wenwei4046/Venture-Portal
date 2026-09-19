'use client'

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { addMemberWithCurrentTitle } from '../../../hierarchy-actions'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import type { PopAnchor } from './MovePopover'
import styles from './membership-controls.module.css'

interface MembershipPerson { staffId: string; name: string; titleId: string | null }
interface MenuAnchor extends PopAnchor { right?: number; parentTop?: number }
interface OpenMenu { anchor: MenuAnchor; focus: boolean }

function beside(button: HTMLButtonElement): MenuAnchor {
  const row = button.getBoundingClientRect()
  const panel = button.closest('[role="menu"]')!.getBoundingClientRect()
  return { left: panel.left, right: panel.right, top: row.top, bottom: row.bottom, parentTop: panel.top }
}

/** One boundary for the root and all its portalled, cascading submenus. */
export default function PersonContextMenu({ person, sourceSchemeId, destinations, anchor, startAtDepartments = false, onUpline, onAdded, onClose }: {
  person: MembershipPerson
  sourceSchemeId: string
  destinations: MembershipDestination[]
  anchor: PopAnchor
  startAtDepartments?: boolean
  onUpline?: () => void
  onAdded: (note: string) => void
  onClose: () => void
}) {
  const boundary = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef<HTMLButtonElement | null>(null)
  const retryFocus = useRef<HTMLButtonElement | null>(null)
  const writing = useRef(false)
  const [pending, startTransition] = useTransition()
  const [departmentMenu, setDepartmentMenu] = useState<OpenMenu | null>(startAtDepartments ? { anchor, focus: true } : null)
  const [departmentsStacked, setDepartmentsStacked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const departmentMenuId = useId()
  const groups = [...new Map(destinations.map(item => [item.departmentId, item.departmentName])).entries()]

  function reasonFor(item: MembershipDestination) {
    if (item.memberStaffIds.includes(person.staffId)) return 'Already a member'
    if (item.unavailableReason) return item.unavailableReason
    if (!item.eligibleStaffIds.includes(person.staffId)) return 'Outside this person’s department'
    if (!person.titleId) return 'No current title to keep'
    if (!item.titles.some(title => title.id === person.titleId)) return 'Current title is not configured here'
    return null
  }
  function close() { if (!writing.current) onClose() }
  function backToActions() {
    if (writing.current) return
    if (startAtDepartments) { onClose(); return }
    setDepartmentMenu(null)
    setError(null)
    setDepartmentsStacked(false)
    restoreFocus.current = addButton.current
  }
  function openDepartments(focus: boolean) {
    if (writing.current || !addButton.current) return
    setDepartmentMenu({ anchor: beside(addButton.current), focus })
    setError(null)
  }
  function save(item: MembershipDestination) {
    if (writing.current || reasonFor(item)) return
    retryFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    writing.current = true
    setError(null)
    const data = new FormData()
    data.set('staff_id', person.staffId)
    data.set('source_scheme_id', sourceSchemeId)
    data.set('scheme_id', item.schemeId)
    startTransition(async () => {
      try {
        const result = await addMemberWithCurrentTitle(data)
        if (!result.ok) { setError(result.note ?? 'Could not add this member. Please try again.'); return }
        onAdded(`${person.name} added to ${item.departmentName} / ${item.name}. Existing memberships are kept.`)
      } catch {
        setError('Could not add this member. Please try again.')
      } finally { writing.current = false }
    })
  }

  useLayoutEffect(() => {
    // Wait for a replaced parent to be visible, then restore its exact row.
    restoreFocus.current?.focus({ preventScroll: true })
    restoreFocus.current = null
  }, [departmentMenu])
  useLayoutEffect(() => {
    if (!pending && error && retryFocus.current?.isConnected) retryFocus.current.focus({ preventScroll: true })
  }, [pending, error])

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!writing.current && !boundary.current?.contains(event.target as Node)) onClose()
    }
    const dismiss = (event: Event) => {
      // Scrolling a long submenu must not dismiss it.
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

  return createPortal(<div ref={boundary} className={styles.layer} onContextMenu={event => event.preventDefault()}>
    {!startAtDepartments ? <MenuPanel label={`Actions for ${person.name}`} anchor={anchor} focus
      hidden={!!departmentMenu && departmentsStacked} onBack={close} onClose={close}>
      <div className={styles.menuHeading}>{person.name}</div>
      <button ref={addButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="menu"
        aria-expanded={!!departmentMenu} aria-controls={departmentMenu ? departmentMenuId : undefined}
        disabled={pending} onMouseEnter={() => openDepartments(false)} onClick={() => openDepartments(true)}
        onKeyDown={event => openWithArrow(event, () => openDepartments(true))}>
        <span>Add to department</span><span aria-hidden className={styles.chevron}>›</span>
      </button>
      {onUpline ? <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
        onMouseEnter={() => { if (!pending) { setDepartmentMenu(null); setDepartmentsStacked(false) } }}
        onClick={onUpline}>Change upline</button> : null}
    </MenuPanel> : null}

    {departmentMenu ? <MenuPanel id={departmentMenuId} label={`Add ${person.name} to department`}
      anchor={departmentMenu.anchor} submenu={!startAtDepartments} focus={departmentMenu.focus}
      onStackedChange={setDepartmentsStacked}
      onBack={backToActions} onClose={close}>
      {!startAtDepartments && departmentsStacked ? <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={backToActions}>‹ Back</button> : null}
      <div className={styles.menuHeading}>Add {person.name} to</div>
      {groups.map(([id, name]) => <Fragment key={id}>
        <div className={styles.groupHeading}>{name}</div>
        {destinations.filter(item => item.departmentId === id).map(item => {
          const reason = reasonFor(item)
          const title = item.titles.find(title => title.id === person.titleId)
          return <button key={item.schemeId} type="button" role="menuitem" tabIndex={-1} aria-label={item.name}
            disabled={pending || !!reason} title={reason ?? `Add to ${item.name} as ${title?.name}, keeping their current title`}
            onClick={() => save(item)}>
            <span className={styles.rowCopy}><span>{item.name}</span><small>{reason ?? `Keep ${title?.name}`}</small></span>
            {item.memberStaffIds.includes(person.staffId) ? <span className={styles.chevron} aria-hidden>✓</span> : null}
          </button>
        })}
      </Fragment>)}
      {!destinations.some(item => !reasonFor(item)) ? <p className={styles.hint}>No additional sub-departments available.</p> : null}
      {pending ? <p role="status" className={styles.hint}>Adding…</p> : <p className={styles.hint}>Keeps their current title and existing memberships.</p>}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </MenuPanel> : null}
  </div>, document.body)
}

function openWithArrow(event: KeyboardEvent, open: () => void) {
  if (event.key !== 'ArrowRight') return
  event.preventDefault()
  event.stopPropagation()
  open()
}

/** Position beside a parent row; replace it in place only when neither side fits. */
function MenuPanel({ id, label, anchor, submenu = false, hidden = false, focus, onStackedChange, onBack, onClose, children }: {
  id?: string
  label: string
  anchor: MenuAnchor
  submenu?: boolean
  hidden?: boolean
  focus: boolean
  onStackedChange?: (stacked: boolean) => void
  onBack: () => void
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: anchor.left, top: anchor.bottom })
  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const place = () => {
      const { width, height } = menu.getBoundingClientRect()
      const right = (anchor.right ?? anchor.left) - 1
      const left = anchor.left - width + 1
      const stacked = submenu && right + width > window.innerWidth - 8 && left < 8
      const x = !submenu ? anchor.left : right + width <= window.innerWidth - 8 ? right : left >= 8 ? left : anchor.left
      const y = submenu ? stacked ? anchor.parentTop ?? anchor.top : anchor.top : anchor.bottom
      setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - height - 8)) })
      onStackedChange?.(stacked)
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(menu)
    return () => observer?.disconnect()
  }, [anchor, submenu, onStackedChange])
  useLayoutEffect(() => {
    if (focus && !hidden) (ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? ref.current)?.focus({ preventScroll: true })
  }, [focus, hidden, anchor])

  return <div ref={ref} id={id} role="menu" tabIndex={-1} aria-label={label} className={styles.menu}
    style={{ ...position, visibility: hidden ? 'hidden' : undefined }} onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape' || event.key === 'ArrowLeft') { event.preventDefault(); onBack(); return }
      if (event.key === 'Tab') { onClose(); return }
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (!buttons.length) return
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>{children}</div>
}
