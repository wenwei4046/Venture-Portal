'use client'

import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  boxesOf,
  cellMap,
  cellsOutOfStep,
  sameTicks,
  templateTicks,
  ticksOfPerson,
  toggleBox,
  toggleRow,
  viewCount,
  TAB_VIEWS,
  type PersonBox,
  type TabView,
} from '@/lib/permission-tabs'
import type { PersonAccessData } from '../_lib/person-permissions'
import PersonPermissions from './PersonPermissions'
import TabMatrix from './TabMatrix'
import { clearLegacyExceptions, setPersonTabs } from '../people/permission-actions'
import s from './tab-matrix.module.css'

type TemplateAccessData = Extract<PersonAccessData, { kind: 'template' }>

/** How many tabs a person's access opens — the Permissions tab's count. */
export function accessCount(access: PersonAccessData): number {
  if (access.kind === 'legacy') return access.rows.filter(r => r.override ?? r.inherited).length
  const ticks = ticksOfPerson(access.template, access, access.cellKeys)
  return TAB_VIEWS.reduce((n, v) => n + viewCount(v.id, ticks).seen, 0)
}

/**
 * One person's permissions (2026-10-11, the HR revamp's person window): their
 * title's template, view by view and tab by tab, with a red dot on a box
 * changed for them alone — and, for whoever manages permissions, Reset to
 * title and Save. While their title has no template yet they follow the old
 * per-key view — their account's role and its exceptions — unchanged.
 */
export default function PersonAccess({
  access,
  canEdit,
  onSaved,
  personName,
  footSlot,
}: {
  access: PersonAccessData
  canEdit: boolean
  /** The card reloads itself; the full page needs only the refresh. */
  onSaved?: () => void
  /** "Anthony" in "A red dot marks a box changed for Anthony only." */
  personName?: string
  /** The person window's footer, where Reset to title and Save stand (the handoff's). */
  footSlot?: HTMLElement | null
}) {
  if (access.kind === 'legacy') {
    return <PersonPermissions userId={access.userId} rows={access.rows} source={access.source} canEdit={canEdit} />
  }
  return <TemplateAccess access={access} canEdit={canEdit} onSaved={onSaved} personName={personName} footSlot={footSlot} />
}

function TemplateAccess({
  access,
  canEdit,
  onSaved,
  personName,
  footSlot,
}: {
  access: TemplateAccessData
  canEdit: boolean
  onSaved?: () => void
  personName?: string
  footSlot?: HTMLElement | null
}) {
  const router = useRouter()
  const base = useMemo(() => templateTicks(access.template, access.cellKeys), [access.template, access.cellKeys])
  const saved = useMemo(() => ticksOfPerson(access.template, access, access.cellKeys), [access])
  // Their boxes were saved over another template (their title moved since): the
  // database still grants what those cells gave, so Save puts the boxes in force.
  const outOfStep = useMemo(
    () => access.boxes.length > 0 && cellsOutOfStep(cellMap(access.template.grants), saved, access.cells),
    [access, saved],
  )
  const [draft, setDraft] = useState<Set<string> | null>(null)
  const ticks = draft ?? saved
  const [view, setView] = useState<TabView>(() => TAB_VIEWS.find(v => viewCount(v.id, saved).seen > 0)?.id ?? 'hr')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const changes = boxesOf(base, ticks).length
  const dirty = (draft !== null && !sameTicks(draft, saved)) || outOfStep
  const who = personName?.trim() || 'this person'

  function save(boxes: PersonBox[]) {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const result = await setPersonTabs({ userId: access.userId, templateId: access.template.id, boxes })
      if (!result.ok) return setError(result.reason)
      setDraft(null)
      onSaved?.()
      router.refresh()
    })
  }

  function clearLegacy() {
    setError(null)
    startTransition(async () => {
      const result = await clearLegacyExceptions(access.userId)
      if (!result.ok) return setError(result.reason)
      onSaved?.()
      router.refresh()
    })
  }

  const actions = canEdit ? (
    <span className={s.footActions}>
      {changes > 0 ? (
        <button type="button" className={s.footGhost} disabled={pending} onClick={() => setDraft(new Set(base))}>Reset to title</button>
      ) : null}
      <button type="button" className={s.footSave} disabled={!dirty || pending} onClick={() => save(boxesOf(base, ticks))}>
        {pending ? 'Saving…' : 'Save'}
      </button>
    </span>
  ) : null

  return (
    <section>
      {error ? <p className={s.error} role="alert">{error}</p> : null}
      {outOfStep ? (
        <p className={s.legacy} role="status">
          {who === 'this person' ? 'Their' : `${who}’s`} own boxes were saved over another template. Until somebody saves them here, the database still grants what they gave there.
        </p>
      ) : null}
      {access.legacy.length > 0 ? (
        <p className={s.legacy}>
          Older exceptions from before templates still apply on top:{' '}
          {access.legacy.map(l => `${l.label} ${l.granted ? 'granted' : 'denied'}`).join(' · ')}.{' '}
          {canEdit ? <button type="button" className={s.all} disabled={pending} onClick={clearLegacy}>Clear them</button> : null}
        </p>
      ) : null}
      <p className={s.lead}>
        From title <b>{access.titleName}</b>. A red dot marks a box changed for {who} only.
        {changes > 0 ? ` ${changes} ${changes === 1 ? 'change' : 'changes'} from the title.` : ''}
      </p>
      <TabMatrix
        ticks={ticks}
        base={base}
        view={view}
        onView={setView}
        canEdit={canEdit}
        compact
        onToggle={(tabId, action) => setDraft(toggleBox(ticks, tabId, action))}
        onRow={tabId => setDraft(toggleRow(ticks, tabId))}
      />
      {actions && footSlot ? createPortal(actions, footSlot) : actions ? <div className={s.inlineFoot}>{actions}</div> : null}
    </section>
  )
}
