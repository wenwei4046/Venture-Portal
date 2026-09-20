'use client'

import { useId, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { moveEmployee, removeEmployeeMembership, terminateEmployee } from '../../../employee-actions'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import type { EmployeeDepartmentDestination } from '../../../_lib/employee-destinations'
import MenuPanel, { beside, hasSideSpace, hoverMayCollapse, openWithArrow, type MenuAnchor, type OpenMenu } from './ContextMenuPanel'
import styles from './membership-controls.module.css'

type Title = { id: string; name: string }
type Destination = { kind: 'subdepartment'; item: MembershipDestination } | { kind: 'department'; item: EmployeeDepartmentDestination }
type Confirmation = OpenMenu & { trigger: HTMLButtonElement; action: 'remove' | 'terminate' | 'move'; destination?: Destination; title?: Title }
const destinationKey = (destination: Destination) => destination.kind === 'department'
  ? `department:${destination.item.id}` : `subdepartment:${destination.item.schemeId}`

/** Exit actions are explicit confirmations inside the existing cascade, never hover writes. */
export default function EmployeeRemovalMenu({ id, person, currentDepartment, destinations, employeeDepartments,
  canManageEmployment, employmentToday, anchor, focus, onStackedChange, onBusyChange, onBack, onClose, onDone }: {
  id?: string
  person: { staffId: string; name: string; titleId: string | null }
  /** `isHome`: THIS PERSON is based here (2026-09-20), not the department's default. */
  currentDepartment: { schemeId: string; name: string; isHome: boolean }
  destinations: MembershipDestination[]
  employeeDepartments: EmployeeDepartmentDestination[]
  canManageEmployment: boolean
  employmentToday: string
  anchor: MenuAnchor
  focus: boolean
  onStackedChange: (stacked: boolean) => void
  onBusyChange: (busy: boolean) => void
  onBack: () => void
  onClose: () => void
  onDone: (note: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const writing = useRef(false)
  const moveButton = useRef<HTMLButtonElement>(null)
  const destinationButtons = useRef(new Map<string, HTMLButtonElement>())
  const restoreFocus = useRef<HTMLButtonElement | null>(null)
  const retryFocus = useRef<HTMLButtonElement | null>(null)
  const [moveMenu, setMoveMenu] = useState<OpenMenu | null>(null)
  const [titleMenu, setTitleMenu] = useState<(OpenMenu & { destination: Destination }) | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [movesStacked, setMovesStacked] = useState(false)
  const [titlesStacked, setTitlesStacked] = useState(false)
  const [confirmationStacked, setConfirmationStacked] = useState(false)
  const [rootStacked, setRootStacked] = useState(false)
  const [lastWorkingDay, setLastWorkingDay] = useState(employmentToday)
  const [error, setError] = useState<string | null>(null)
  const movesId = useId(), titlesId = useId(), confirmationId = useId(), dateId = useId()
  const source = destinations.find(item => item.schemeId === currentDepartment.schemeId)
  const siblings = destinations.filter(item => item.departmentId === source?.departmentId)
  const otherDepartments = employeeDepartments.filter(item => item.id !== source?.departmentId)
  const sourceIssue = !source?.memberStaffIds.includes(person.staffId) ? 'This membership is no longer available. Refresh the chart.' : null
  // Everywhere else in the department they still work (user, 2026-09-20).
  // Leaving one department is allowed while another is left; leaving the LAST
  // one is leaving the company, which is what Terminate employee records.
  // Oldest first, because that is the one the database moves a base to.
  const elsewhere = destinations.filter(item => item.departmentId === source?.departmentId
    && item.schemeId !== currentDepartment.schemeId && item.memberStaffIds.includes(person.staffId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.subDepartmentId.localeCompare(b.subDepartmentId))
  const removeReason = sourceIssue
    ?? (elsewhere.length === 0
      ? `This is the only department ${person.name} works in. Use Terminate employee to record that they have left the company.`
      : null)
  // Their base moves with them: the roster has to describe one of the charts
  // they are still on, and the oldest of them is the one the database picks.
  const newBase = currentDepartment.isHome ? (elsewhere[0] ?? null) : null

  function reasonFor(destination: Destination): string | null {
    if (sourceIssue) return sourceIssue
    if (destination.kind === 'department') {
      if (!canManageEmployment) return 'Requires People Management permission.'
      if (destination.item.id === source?.departmentId) return 'Current company department'
      return destination.item.titles.length ? null : 'No available titles in this department.'
    }
    const item = destination.item
    if (item.schemeId === currentDepartment.schemeId) return 'Current sub-department'
    // A move always leaves them somewhere, so the "only department" refusal
    // that stops a bare removal has no say here.
    if (item.departmentId !== source?.departmentId || !item.eligibleStaffIds.includes(person.staffId)) return 'Outside this person’s department'
    // Joining an existing destination is a move out of the source only.
    if (item.memberStaffIds.includes(person.staffId)) return null
    return item.unavailableReason ?? (item.titles.length ? null : 'No available titles in this sub-department.')
  }
  function safeBack() { if (!writing.current) onBack() }
  function safeClose() { if (!writing.current) onClose() }
  function backFromMoves() {
    if (writing.current) return
    setMoveMenu(null); setTitleMenu(null); setConfirmation(null)
    setMovesStacked(false); setTitlesStacked(false); setConfirmationStacked(false); setError(null)
    restoreFocus.current = moveButton.current
  }
  function backFromTitles() {
    if (writing.current) return
    restoreFocus.current = titleMenu ? destinationButtons.current.get(destinationKey(titleMenu.destination)) ?? null : null
    setTitleMenu(null); setConfirmation(null); setTitlesStacked(false); setConfirmationStacked(false); setError(null)
  }
  function backFromConfirmation() {
    if (writing.current) return
    restoreFocus.current = confirmation?.trigger ?? null
    setConfirmation(null); setConfirmationStacked(false); setError(null)
  }
  function openMoves(takeFocus: boolean) {
    if (writing.current || !moveButton.current) return
    const nextAnchor = beside(moveButton.current)
    if (!takeFocus && !hasSideSpace(nextAnchor)) return
    setMoveMenu({ anchor: nextAnchor, focus: takeFocus }); setTitleMenu(null); setConfirmation(null)
    setTitlesStacked(false); setConfirmationStacked(false); setError(null)
  }
  function openConfirmation(action: Confirmation['action'], trigger: HTMLButtonElement, destination?: Destination, title?: Title) {
    if (writing.current || (action === 'remove' && removeReason) || (action === 'terminate' && (!canManageEmployment || sourceIssue))
      || (destination && reasonFor(destination))) return
    setConfirmation({ action, trigger, destination, title, anchor: beside(trigger), focus: true })
    if (action !== 'move') { setMoveMenu(null); setTitleMenu(null); setMovesStacked(false); setTitlesStacked(false) }
    setError(null)
  }
  /** Hovering off the row that opened the move list takes the list with it. */
  function collapseMoves(row: HTMLButtonElement | null, panel: HTMLDivElement) {
    if (writing.current || confirmation || row === moveButton.current) return
    if (!moveMenu && !titleMenu) return
    if (!hoverMayCollapse(panel)) return
    setMoveMenu(null); setTitleMenu(null); setMovesStacked(false); setTitlesStacked(false); setError(null)
  }
  function collapseTitles(row: HTMLButtonElement | null, panel: HTMLDivElement) {
    if (writing.current || confirmation || !titleMenu) return
    if (row && row === destinationButtons.current.get(destinationKey(titleMenu.destination))) return
    if (!hoverMayCollapse(panel)) return
    setTitleMenu(null); setTitlesStacked(false); setError(null)
  }
  function openDestination(destination: Destination, takeFocus: boolean) {
    const trigger = destinationButtons.current.get(destinationKey(destination))
    if (writing.current || reasonFor(destination) || !trigger) return
    const nextAnchor = beside(trigger)
    if (!takeFocus && !hasSideSpace(nextAnchor)) return
    if (destination.kind === 'subdepartment' && destination.item.memberStaffIds.includes(person.staffId)) {
      // Confirmation requires a click/Right, even when the destination already exists.
      if (!takeFocus) return
      setTitleMenu(null); setTitlesStacked(false)
      openConfirmation('move', trigger, destination)
    } else {
      setTitleMenu({ destination, anchor: nextAnchor, focus: takeFocus }); setConfirmation(null)
      setConfirmationStacked(false); setError(null)
    }
  }

  useLayoutEffect(() => {
    restoreFocus.current?.focus({ preventScroll: true }); restoreFocus.current = null
  }, [moveMenu, titleMenu, confirmation])
  useLayoutEffect(() => {
    if (!pending && error && retryFocus.current?.isConnected) retryFocus.current.focus({ preventScroll: true })
  }, [pending, error])

  function save() {
    if (writing.current || !confirmation || sourceIssue) return
    if (confirmation.action === 'terminate' && (!canManageEmployment || !lastWorkingDay || !employmentToday || lastWorkingDay > employmentToday)) return
    if (confirmation.action === 'remove' && removeReason) return
    if (confirmation.destination && reasonFor(confirmation.destination)) return
    retryFocus.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    writing.current = true; onBusyChange(true); setError(null)
    const data = new FormData()
    data.set('staff_id', person.staffId)
    data.set('source_scheme_id', currentDepartment.schemeId)
    if (confirmation.destination) {
      const destination = confirmation.destination
      data.set('destination_kind', destination.kind)
      data.set('destination_id', destination.kind === 'department' ? destination.item.id : destination.item.schemeId)
      if (confirmation.title) data.set('title_id', confirmation.title.id)
    }
    if (confirmation.action === 'terminate') data.set('resignation_date', lastWorkingDay)
    startTransition(async () => {
      try {
        const result = await (confirmation.action === 'move' ? moveEmployee(data)
          : confirmation.action === 'remove' ? removeEmployeeMembership(data) : terminateEmployee(data))
        if (!result.ok) { setError(result.note ?? 'Could not save this change. Please try again.'); return }
        const note = confirmation.action === 'move' ? `${person.name} moved to ${confirmation.destination!.item.name}.`
          : confirmation.action === 'remove' ? `${person.name} removed from ${currentDepartment.name}.`
            : `${person.name} marked as no longer working. Last working day: ${lastWorkingDay}.`
        onDone(result.note ?? note)
      } catch {
        setError('Could not save this change. Please try again.')
      } finally { writing.current = false; onBusyChange(false) }
    })
  }

  function destinationRow(destination: Destination) {
    const key = destinationKey(destination), item = destination.item, reason = reasonFor(destination)
    const existing = destination.kind === 'subdepartment' && destination.item.memberStaffIds.includes(person.staffId)
    const expanded = titleMenu && destinationKey(titleMenu.destination) === key
      || confirmation?.destination && destinationKey(confirmation.destination) === key
    return <button key={key} ref={button => { if (button) destinationButtons.current.set(key, button); else destinationButtons.current.delete(key) }}
      type="button" role="menuitem" tabIndex={-1} aria-label={item.name} disabled={pending || !!reason}
      aria-haspopup={existing ? 'dialog' : 'menu'} aria-expanded={!!expanded} title={reason ?? undefined}
      onMouseEnter={() => openDestination(destination, false)} onClick={() => openDestination(destination, true)}
      onKeyDown={event => openWithArrow(event, () => openDestination(destination, true))}>
      <span className={styles.rowCopy}><span>{item.name}</span><small>{reason ?? (existing ? 'Already a member · keep its title and upline' : destination.kind === 'department' ? 'Change company department' : 'Choose a title')}</small></span>
      {!reason ? <span className={styles.chevron} aria-hidden>›</span> : null}
    </button>
  }

  const confirmationLabel = confirmation?.action === 'move' ? `Confirm move of ${person.name}`
    : confirmation?.action === 'remove' ? `Remove ${person.name} from ${currentDepartment.name}` : `Terminate ${person.name}`
  const destination = confirmation?.destination
  const directConfirmation = confirmation && confirmation.action !== 'move'
  return <>
    <MenuPanel id={id} label={`Remove ${person.name}`} anchor={anchor} submenu focus={focus}
      hidden={(!!moveMenu && movesStacked) || (!!directConfirmation && confirmationStacked)} onRowHover={collapseMoves}
      onStackedChange={stacked => { setRootStacked(stacked); onStackedChange(stacked) }} onBack={safeBack} onClose={safeClose}>
      {rootStacked ? <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={safeBack}>‹ Back</button> : null}
      <div className={styles.menuHeading}>{person.name} · {currentDepartment.name}</div>
      <button ref={moveButton} type="button" role="menuitem" tabIndex={-1} aria-haspopup="menu"
        aria-expanded={!!moveMenu} aria-controls={moveMenu ? movesId : undefined} disabled={pending || !!sourceIssue}
        onMouseEnter={() => openMoves(false)} onClick={() => openMoves(true)} onKeyDown={event => openWithArrow(event, () => openMoves(true))}>
        <span>Move to other department</span><span className={styles.chevron} aria-hidden>›</span>
      </button>
      <button type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog" disabled={pending || !!removeReason}
        title={removeReason ?? undefined} onClick={event => openConfirmation('remove', event.currentTarget)}>
        <span className={styles.rowCopy}><span>Remove from this department</span>
          {removeReason ? <small>{removeReason}</small>
            : newBase ? <small>Their base moves to {newBase.name}</small> : null}</span>
      </button>
      <button type="button" role="menuitem" tabIndex={-1} aria-haspopup="dialog" disabled={pending || !canManageEmployment || !!sourceIssue}
        onClick={event => openConfirmation('terminate', event.currentTarget)}>
        <span className={styles.rowCopy}><span>Terminate employee</span><small>{canManageEmployment ? 'No longer working for the company' : 'Requires People Management permission.'}</small></span>
      </button>
    </MenuPanel>

    {moveMenu ? <MenuPanel id={movesId} label={`Move ${person.name} to department`} anchor={moveMenu.anchor} submenu focus={moveMenu.focus}
      hidden={(!!titleMenu && titlesStacked) || (!!confirmation && !titleMenu && confirmationStacked)}
      onRowHover={collapseTitles} onStackedChange={setMovesStacked} onBack={backFromMoves} onClose={safeClose}>
      {movesStacked ? <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={backFromMoves}>‹ Back</button> : null}
      <div className={styles.menuHeading}>Move {person.name} to</div>
      <div className={styles.groupHeading}>{source?.departmentName ?? 'Current department'} · Sub-departments</div>
      {siblings.map(item => destinationRow({ kind: 'subdepartment', item }))}
      <div className={styles.groupHeading}>Other departments</div>
      {canManageEmployment ? otherDepartments.map(item => destinationRow({ kind: 'department', item }))
        : <p className={styles.hint}>Moving to another main department requires People Management permission.</p>}
      {canManageEmployment && !otherDepartments.length ? <p className={styles.hint}>No other departments available.</p> : null}
    </MenuPanel> : null}

    {titleMenu ? <MenuPanel id={titlesId} label={`Move ${person.name} to ${titleMenu.destination.item.name} as`}
      anchor={titleMenu.anchor} submenu focus={titleMenu.focus} hidden={!!confirmation && confirmationStacked}
      onStackedChange={setTitlesStacked} onBack={backFromTitles} onClose={safeClose}>
      {titlesStacked ? <button type="button" role="menuitem" tabIndex={-1} disabled={pending} onClick={backFromTitles}>‹ Back</button> : null}
      <div className={styles.menuHeading}>Title in {titleMenu.destination.item.name}</div>
      {titleMenu.destination.item.titles.map(title => <button key={title.id} type="button" role="menuitem" tabIndex={-1}
        disabled={pending || !!reasonFor(titleMenu.destination)} aria-haspopup="dialog"
        onClick={event => openConfirmation('move', event.currentTarget, titleMenu.destination, title)}>{title.name}</button>)}
      <p className={styles.hint}>Choose a title, then confirm the move. No reporting line is copied.</p>
    </MenuPanel> : null}

    {confirmation ? <MenuPanel id={confirmationId} label={confirmationLabel} anchor={confirmation.anchor} submenu dialog focus
      onStackedChange={setConfirmationStacked} onBack={backFromConfirmation} onClose={safeClose}>
      <div className={styles.menuHeading}>{confirmationLabel}</div>
      <p className={styles.confirmCopy}>
        {confirmation.action === 'remove' ? newBase
          ? <>Remove <strong>{person.name}</strong> from <strong>{currentDepartment.name}</strong>. <strong>{newBase.name}</strong> becomes the department they are based in, and their company reporting line follows them to whoever they already earn under there. Employment and every other membership remain.</>
          : <>Remove <strong>{person.name}</strong> from <strong>{currentDepartment.name}</strong> only. Their other memberships and employment remain.</>
          : confirmation.action === 'terminate' ? <>Mark <strong>{person.name}</strong> as no longer working. They leave active staff lists and hierarchy charts. Their record and payroll history remain.</>
          : destination?.kind === 'department' ? <>Move <strong>{person.name}</strong> to <strong>{destination.item.name}</strong> as {confirmation.title?.name}. This changes their company department and title, ends memberships in {source?.departmentName}, and clears their company reporting line.</>
          : confirmation.title ? <>Move <strong>{person.name}</strong> from <strong>{currentDepartment.name}</strong> to <strong>{destination?.item.name}</strong> as {confirmation.title.name}. Set a new upline there after moving. Other memberships remain.</>
          : <>Remove <strong>{person.name}</strong> from <strong>{currentDepartment.name}</strong>. Their existing membership in <strong>{destination?.item.name}</strong> keeps its title and reporting line.</>}
      </p>
      {confirmation.action === 'terminate' ? <>
        <label className={styles.dateField} htmlFor={dateId}>Last working day
          <input id={dateId} type="date" value={lastWorkingDay} max={employmentToday} required disabled={pending}
            onChange={event => { setLastWorkingDay(event.target.value); setError(null) }} />
        </label>
        <p className={styles.hint}>Linked account settings are managed separately in People Management.</p>
      </> : null}
      <button type="button" disabled={pending} onClick={backFromConfirmation}>Cancel</button>
      <button type="button" className={confirmation.action === 'move' ? undefined : styles.danger}
        disabled={pending || (confirmation.action === 'terminate' && (!lastWorkingDay || !employmentToday || lastWorkingDay > employmentToday))}
        onClick={save}>{confirmation.action === 'move' ? 'Confirm move' : confirmation.action === 'remove' ? 'Confirm removal' : 'Confirm termination'}</button>
      {pending ? <p role="status" className={styles.hint}>Saving…</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    </MenuPanel> : null}
  </>
}
