'use client'

import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  boxesOf,
  cellMap,
  cellsOutOfStep,
  heldTabs,
  sameTicks,
  templateTicks,
  ticksOfPerson,
  toggleBox,
  toggleColumn,
  toggleRow,
  toggleView,
  viewCount,
  TAB_VIEWS,
  type PersonBox,
  type TabView,
} from '@/lib/permission-tabs'
import { sameReachTicks, toggleReach, type ReachTick } from '@/lib/sub-department-reach'
import { sameSensitiveTicks, sensitiveOf, toggleSensitive, type SensitiveTick } from '@/lib/person-sensitive'
import { SENSITIVE_FIELDS } from '@/lib/permission-matrix'
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
  bare = false,
}: {
  access: PersonAccessData
  canEdit: boolean
  /** The card reloads itself; the full page needs only the refresh. */
  onSaved?: () => void
  /** "Anthony" in "Anthony’s own boxes were saved over another template." */
  personName?: string
  /** The person window's footer, where Reset to title and Save stand (the handoff's). */
  footSlot?: HTMLElement | null
  /** Inside a well that carries the title already (a person's page, 2026-10-16). */
  bare?: boolean
}) {
  if (access.kind === 'legacy') {
    return <PersonPermissions userId={access.userId} rows={access.rows} source={access.source} canEdit={canEdit} bare={bare} />
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
  // Their sub-departments on the Revenue tabs (2026-10-16): their own ticks over what they handle.
  const [reachDraft, setReachDraft] = useState<ReachTick[] | null>(null)
  const savedReach = access.reach?.ticks ?? []
  const reachTicks = reachDraft ?? savedReach
  // Their own Salary / NRIC / Bank over the template's (2026-10-16): what they see, and what a ticked tab opens.
  const [sensDraft, setSensDraft] = useState<SensitiveTick[] | null>(null)
  const sensTicks = sensDraft ?? access.ownSensitive
  const sensitive = useMemo(() => sensitiveOf(access.template.sensitive, sensTicks), [access.template.sensitive, sensTicks])
  const [view, setView] = useState<TabView>(() => TAB_VIEWS.find(v => viewCount(v.id, saved).seen > 0)?.id ?? 'hr')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const changes = boxesOf(base, ticks).length + reachTicks.length + sensTicks.length
  const reachDirty = reachDraft !== null && !sameReachTicks(reachDraft, savedReach)
  const sensDirty = sensDraft !== null && !sameSensitiveTicks(sensDraft, access.ownSensitive)
  const dirty = (draft !== null && !sameTicks(draft, saved)) || outOfStep || reachDirty || sensDirty
  const who = personName?.trim() || 'this person'
  // Their sensitive fields (the template's with their own over them) and the kind decide what a ticked tab opens.
  const held = useMemo(() => heldTabs(ticks, sensitive, access.template.baseRole, access.cellKeys), [ticks, sensitive, access])

  function save(boxes: PersonBox[]) {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const result = await setPersonTabs({
        userId: access.userId,
        templateId: access.template.id,
        boxes,
        ...(access.reach ? { reach: reachTicks } : {}),
        sensitive: sensTicks,
      })
      if (!result.ok) return setError(result.reason)
      setDraft(null)
      setReachDraft(null)
      setSensDraft(null)
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
        <button type="button" className={s.footGhost} disabled={pending} onClick={() => { setDraft(new Set(base)); setReachDraft([]); setSensDraft([]) }}>Reset to title</button>
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
      {/* Their own Salary / NRIC / Bank (2026-10-16): ticked where they see it, the red dot where it is theirs alone. */}
      <div className={s.sensRow} role="group" aria-label="Sensitive fields">
        <span className={s.sensHead}>Sensitive fields</span>
        <span className={s.subs}>
          {SENSITIVE_FIELDS.map(f => {
            const on = sensitive.includes(f.key)
            return (
              <button key={f.key} type="button" role="checkbox" aria-checked={on} aria-label={`Sensitive fields · ${f.label}`} disabled={!canEdit}
                className={`${s.sub} ${on ? s.subOn : ''}`} onClick={() => setSensDraft(toggleSensitive(access.template.sensitive, sensTicks, f.key))}>
                <span className={s.subTick} aria-hidden>{on ? '✓' : ''}</span>
                {f.label}
                {sensTicks.some(t => t.field === f.key) ? <span className={s.dot} aria-label="changed for this person" /> : null}
              </button>
            )
          })}
        </span>
      </div>
      <TabMatrix
        ticks={ticks}
        base={base}
        view={view}
        onView={setView}
        canEdit={canEdit}
        compact
        held={held}
        reach={access.reach ? { person: access.reach, ticks: reachTicks, onToggle: (area, sub) => setReachDraft(toggleReach(access.reach!, reachTicks, area, sub)) } : undefined}
        onToggle={(tabId, action) => setDraft(toggleBox(ticks, tabId, action))}
        onRow={tabId => setDraft(toggleRow(ticks, tabId))}
        onColumn={action => setDraft(toggleColumn(ticks, view, action))}
        onAll={() => setDraft(toggleView(ticks, view))}
      />
      {actions && footSlot ? createPortal(actions, footSlot) : actions ? <div className={s.inlineFoot}>{actions}</div> : null}
    </section>
  )
}
