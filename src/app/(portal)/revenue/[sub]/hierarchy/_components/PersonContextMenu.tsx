'use client'

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { addMember, changeMemberTitle } from '../../../hierarchy-actions'
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

function hasSideSpace(anchor: MenuAnchor) {
  const width = (anchor.right ?? anchor.left) - anchor.left
  return (anchor.right ?? anchor.left) - 1 + width <= window.innerWidth - 8 || anchor.left - width + 1 >= 8
}

/** One boundary for the root and all its portalled, cascading submenus. */
export default function PersonContextMenu({ person, currentDepartment, destinations, anchor, startAtDepartments = false, onUpline, onAdded, onClose }: {
  person: MembershipPerson
  currentDepartment?: { schemeId: string; name: string; isHome: boolean }
  destinations: MembershipDestination[]
  anchor: PopAnchor
  startAtDepartments?: boolean
  onUpline?: () => void
  onAdded: (note: string) => void
  onClose: () => void
}) {
  const boundary = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const changeTitleButton = useRef<HTMLButtonElement>(null)
  const destinationButtons = useRef(new Map<string, HTMLButtonElement>())
  const restoreFocus = useRef<HTMLButtonElement | null>(null)
  const retryFocus = useRef<HTMLButtonElement | null>(null)
  const writing = useRef(false)
  const [pending, startTransition] = useTransition()
  const [departmentMenu, setDepartmentMenu] = useState<OpenMenu | null>(startAtDepartments ? { anchor, focus: true } : null)
  const [departmentsStacked, setDepartmentsStacked] = useState(false)
  const [titleMenu, setTitleMenu] = useState<(OpenMenu & { schemeId: string; mode: 'add' | 'change' }) | null>(null)
  const [titlesStacked, setTitlesStacked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const departmentMenuId = useId()
  const titleMenuId = useId()
  const currentDestination = destinations.find(item => item.schemeId === currentDepartment?.schemeId)
  const selectedDestination = destinations.find(item => item.schemeId === titleMenu?.schemeId)
  const changingTitle = titleMenu?.mode === 'change'
  const groups = [...new Map(destinations.map(item => [item.departmentId, item.departmentName])).entries()]

  function reasonFor(item: MembershipDestination) {
    if (item.memberStaffIds.includes(person.staffId)) return 'Already a member'
    if (item.unavailableReason) return item.unavailableReason
    if (!item.eligibleStaffIds.includes(person.staffId)) return 'Outside this person’s department'
    if (!item.titles.length) return 'Set up a title on this sub-department’s ladder first.'
    return null
  }
  function titleChangeReason() {
    if (currentDepartment?.isHome) return 'Company title is managed in People Management.'
    if (!currentDestination?.titles.length) return 'No available titles in this sub-department.'
    if (!currentDestination.eligibleStaffIds.includes(person.staffId)) return 'This membership cannot be edited here.'
    if (!currentDestination.memberStaffIds.includes(person.staffId)) return 'No longer a member of this sub-department.'
    return null
  }
  function close() { if (!writing.current) onClose() }
  function backToActions() {
    if (writing.current) return
    if (startAtDepartments) { onClose(); return }
    setDepartmentMenu(null)
    setTitleMenu(null)
    setTitlesStacked(false)
    setError(null)
    setDepartmentsStacked(false)
    restoreFocus.current = addButton.current
  }
  function openDepartments(focus: boolean) {
    if (writing.current || !addButton.current) return
    const nextAnchor = beside(addButton.current)
    // A hover must not replace the row under the pointer with a save action.
    // Narrow menus require an explicit click or Right-arrow to go deeper.
    if (!focus && !hasSideSpace(nextAnchor)) return
    setDepartmentMenu({ anchor: nextAnchor, focus })
    setTitleMenu(null)
    setTitlesStacked(false)
    setError(null)
  }
  function openTitles(item: MembershipDestination, focus: boolean) {
    const button = destinationButtons.current.get(item.schemeId)
    if (writing.current || reasonFor(item) || !button) return
    const nextAnchor = beside(button)
    if (!focus && !hasSideSpace(nextAnchor)) return
    setTitleMenu({ schemeId: item.schemeId, mode: 'add', anchor: nextAnchor, focus })
    setError(null)
  }
  function openChangeTitles(focus: boolean) {
    if (writing.current || titleChangeReason() || !currentDestination || !changeTitleButton.current) return
    const nextAnchor = beside(changeTitleButton.current)
    if (!focus && !hasSideSpace(nextAnchor)) return
    setDepartmentMenu(null)
    setDepartmentsStacked(false)
    setTitleMenu({ schemeId: currentDestination.schemeId, mode: 'change', anchor: nextAnchor, focus })
    setError(null)
  }
  function backToDepartments() {
    if (writing.current) return
    restoreFocus.current = changingTitle ? changeTitleButton.current
      : titleMenu ? destinationButtons.current.get(titleMenu.schemeId) ?? null : null
    setTitleMenu(null)
    setTitlesStacked(false)
    setError(null)
  }
  function save(item: MembershipDestination, title: MembershipDestination['titles'][number]) {
    if (writing.current || (changingTitle ? titleChangeReason() || title.id === person.titleId : reasonFor(item))
      || !item.titles.some(option => option.id === title.id)) return
    retryFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    writing.current = true
    setError(null)
    const data = new FormData()
    data.set('staff_id', person.staffId)
    data.set('scheme_id', item.schemeId)
    data.set('title_id', title.id)
    startTransition(async () => {
      try {
        const result = await (changingTitle ? changeMemberTitle(data) : addMember(data))
        if (!result.ok) { setError(result.note ?? 'Could not save this membership. Please try again.'); return }
        onAdded(changingTitle ? `${person.name} is now ${title.name} in ${item.name}.`
          : `${person.name} added to ${item.departmentName} / ${item.name} as ${title.name}. Set their upline in ${item.name}.`)
      } catch {
        setError('Could not save this membership. Please try again.')
      } finally { writing.current = false }
    })
  }

  useLayoutEffect(() => {
    // Wait for a replaced parent to be visible, then restore its exact row.
    restoreFocus.current?.focus({ preventScroll: true })
    restoreFocus.current = null
  }, [departmentMenu, titleMenu])
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
      hidden={(!!departmentMenu && departmentsStacked) || (changingTitle && titlesStacked)} onBack={close} onClose={close}>
      <div className={styles.menuHeading}>{person.name}</div>
      <button ref={addButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="menu"
        aria-expanded={!!departmentMenu} aria-controls={departmentMenu ? departmentMenuId : undefined}
        disabled={pending} onMouseEnter={() => openDepartments(false)} onClick={() => openDepartments(true)}
        onKeyDown={event => openWithArrow(event, () => openDepartments(true))}>
        <span>Add to department</span><span aria-hidden className={styles.chevron}>›</span>
      </button>
      {currentDepartment ? <button ref={changeTitleButton} type="button" role="menuitem" tabIndex={-1} aria-label="Change title"
        aria-haspopup="menu" aria-expanded={changingTitle} aria-controls={changingTitle ? titleMenuId : undefined}
        disabled={pending || !!titleChangeReason()} title={titleChangeReason() ?? `Choose a title in ${currentDepartment.name}`}
        onMouseEnter={() => openChangeTitles(false)} onClick={() => openChangeTitles(true)}
        onKeyDown={event => openWithArrow(event, () => openChangeTitles(true))}>
        <span className={styles.rowCopy}><span>Change title</span>{titleChangeReason() ? <small>{titleChangeReason()}</small> : null}</span>
        {!titleChangeReason() ? <span aria-hidden className={styles.chevron}>›</span> : null}
      </button> : null}
      {onUpline ? <button type="button" role="menuitem" tabIndex={-1} disabled={pending}
        onMouseEnter={() => { if (!writing.current) { setDepartmentMenu(null); setDepartmentsStacked(false); setTitleMenu(null); setTitlesStacked(false) } }}
        onClick={onUpline}>Change upline</button> : null}
    </MenuPanel> : null}

    {departmentMenu ? <MenuPanel id={departmentMenuId} label={`Add ${person.name} to department`}
      anchor={departmentMenu.anchor} submenu={!startAtDepartments} focus={departmentMenu.focus}
      hidden={!!titleMenu && titlesStacked}
      onStackedChange={setDepartmentsStacked}
      onBack={backToActions} onClose={close}>
      {!startAtDepartments && departmentsStacked ? <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={backToActions}>‹ Back</button> : null}
      <div className={styles.menuHeading}>Add {person.name} to</div>
      {groups.map(([id, name]) => <Fragment key={id}>
        <div className={styles.groupHeading}>{name}</div>
        {destinations.filter(item => item.departmentId === id).map(item => {
          const reason = reasonFor(item)
          return <button key={item.schemeId} ref={button => {
            if (button) destinationButtons.current.set(item.schemeId, button)
            else destinationButtons.current.delete(item.schemeId)
          }} type="button" role="menuitem" tabIndex={-1} aria-label={item.name}
            aria-haspopup="menu" aria-expanded={titleMenu?.schemeId === item.schemeId}
            aria-controls={titleMenu?.schemeId === item.schemeId ? titleMenuId : undefined}
            disabled={pending || !!reason} title={reason ?? `Choose a title in ${item.name}`}
            onMouseEnter={() => openTitles(item, false)} onClick={() => openTitles(item, true)}
            onKeyDown={event => openWithArrow(event, () => openTitles(item, true))}>
            <span className={styles.rowCopy}><span>{item.name}</span>{reason ? <small>{reason}</small> : null}</span>
            <span className={styles.chevron} aria-hidden>{item.memberStaffIds.includes(person.staffId) ? '✓' : !reason ? '›' : null}</span>
          </button>
        })}
      </Fragment>)}
      {!destinations.some(item => !reasonFor(item)) ? <p className={styles.hint}>No additional sub-departments available.</p> : null}
    </MenuPanel> : null}

    {titleMenu && selectedDestination ? <MenuPanel id={titleMenuId}
      label={changingTitle ? `Change ${person.name} title in ${selectedDestination.name}` : `Add ${person.name} to ${selectedDestination.name} as`}
      anchor={titleMenu.anchor} submenu focus={titleMenu.focus} onStackedChange={setTitlesStacked}
      onBack={backToDepartments} onClose={close}>
      {titlesStacked ? <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={backToDepartments}>‹ Back</button> : null}
      <div className={styles.menuHeading}>{changingTitle ? `Title in ${selectedDestination.name}` : `Add to ${selectedDestination.name} as…`}</div>
      {selectedDestination.titles.map(title => <button key={title.id} type="button" role="menuitem" tabIndex={-1}
        aria-label={title.name} disabled={pending || (changingTitle ? !!titleChangeReason() || title.id === person.titleId : !!reasonFor(selectedDestination))}
        onClick={() => save(selectedDestination, title)}>
        <span className={styles.rowCopy}><span>{title.name}</span>{title.id === person.titleId ? <small>Current title</small> : null}</span>
        {changingTitle && title.id === person.titleId ? <span className={styles.chevron} aria-hidden>✓</span> : null}
      </button>)}
      {pending ? <p role="status" className={styles.hint}>{changingTitle ? 'Saving…' : 'Adding…'}</p>
        : <p className={styles.hint}>{changingTitle ? `Changes title in ${selectedDestination.name} only. Its upline stays the same.`
          : `No upline is copied. Set it in ${selectedDestination.name} after adding.`}</p>}
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
