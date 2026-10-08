'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ACTIONS,
  type PersonCells,
  cellOf,
  cyclePersonCell,
  effectiveGrants,
  exceptionCounts,
  heldCells,
  keyList,
  personCellsToRows,
  pruneExceptions,
} from '@/lib/permission-matrix'
import type { PersonAccessData } from '../_lib/person-permissions'
import PersonPermissions from './PersonPermissions'
import PermissionCell from './PermissionCell'
import { clearLegacyExceptions, setPersonCells } from '../people/permission-actions'

/** How many keys a person's access comes to — the Permissions tab's count. */
export function accessCount(access: PersonAccessData): number {
  if (access.kind === 'legacy') return access.rows.filter(r => r.override ?? r.inherited).length
  return keyList(effectiveGrants(access.template.grants, access.cells), access.template.sensitive, access.functions).length
}

/**
 * One person's permissions (2026-10-08): their title's template — the matrix
 * the Permissions tab draws, compact — with the cells raised or lowered for
 * them alone ringed in walnut, and changeable by whoever manages permissions
 * (user: role 只是初始启动 … 后续在后台每个人真正的 permission 都可以再去改).
 *
 * While their title has no template yet they follow the old per-key view —
 * their account's role and its exceptions — unchanged.
 */
export default function PersonAccess({
  access,
  canEdit,
  onSaved,
}: {
  access: PersonAccessData
  canEdit: boolean
  /** The card reloads itself; the full page needs only the refresh. */
  onSaved?: () => void
}) {
  if (access.kind === 'legacy') {
    return <PersonPermissions userId={access.userId} rows={access.rows} source={access.source} canEdit={canEdit} />
  }
  return <TemplateAccess access={access} canEdit={canEdit} onSaved={onSaved} />
}

function TemplateAccess({
  access,
  canEdit,
  onSaved,
}: {
  access: Extract<PersonAccessData, { kind: 'template' }>
  canEdit: boolean
  onSaved?: () => void
}) {
  const router = useRouter()
  const { template, functions, cellKeys } = access
  const [draft, setDraft] = useState<PersonCells | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [showHeld, setShowHeld] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const own = draft ?? access.cells
  const effective = useMemo(() => effectiveGrants(template.grants, own), [template.grants, own])
  const { raised, lowered } = exceptionCounts(template.grants, own)
  const dirty = draft !== null && JSON.stringify(pruneExceptions(template.grants, draft)) !== JSON.stringify(pruneExceptions(template.grants, access.cells))
  const held = useMemo(
    () => heldCells(effective, template.sensitive, template.baseRole, cellKeys, functions),
    [effective, template, cellKeys, functions],
  )
  const rows = functions.filter(
    fn => showAll || fn.actions.some(a => cellOf(effective, fn.key, a) !== 'none' || `${fn.key}.${a}` in own),
  )

  function save() {
    if (!draft || pending) return
    setError(null)
    startTransition(async () => {
      const result = await setPersonCells(access.userId, personCellsToRows(pruneExceptions(template.grants, draft)))
      if (!result.ok) {
        setError(result.reason)
        return
      }
      setDraft(null)
      onSaved?.()
      router.refresh()
    })
  }

  function clearLegacy() {
    setError(null)
    startTransition(async () => {
      const result = await clearLegacyExceptions(access.userId)
      if (!result.ok) {
        setError(result.reason)
        return
      }
      onSaved?.()
      router.refresh()
    })
  }

  return (
    <section className="mt-2">
      <div className="sect-head">
        <h2>Permissions</h2>
        <span className="rule" aria-hidden />
        <span className="count">{keyList(effective, template.sensitive, functions).length} KEYS</span>
      </div>

      {error ? <div className="sheet-danger mt-0 mb-4">{error}</div> : null}

      {access.legacy.length > 0 ? (
        <div className="sheet-warning mt-0 mb-3 flex flex-wrap items-start justify-between gap-3">
          <span>
            Older exceptions from before templates still apply on top:{' '}
            {access.legacy.map(l => `${l.label} ${l.granted ? 'granted' : 'denied'}`).join(' · ')}.
          </span>
          {canEdit ? (
            <button type="button" className="perm-link shrink-0 text-[11px]" disabled={pending} onClick={clearLegacy}>
              Clear them
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2.5 px-3 py-2.5 border border-accent rounded-[8px] bg-accent-bg text-[12px] leading-[1.55] mb-3">
        <span className="flex-1">
          Template <b className="font-bold">{template.name}</b>, from the title {access.titleName}.{' '}
          {raised + lowered > 0
            ? `${raised} raised, ${lowered} lowered for this person only.`
            : canEdit
              ? 'Click a cell to change it for this person only.'
              : 'Nothing changed for this person alone.'}
        </span>
        {canEdit && raised + lowered > 0 ? (
          <button type="button" className="perm-link shrink-0 text-[11px]" onClick={() => setDraft({})}>
            Back to template
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="perm-matrix compact">
          <thead>
            <tr>
              <th>Function</th>
              {ACTIONS.map(a => (
                <th key={a.key}>{a.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(fn => (
              <tr key={fn.key} className="fn">
                <td>{fn.label}</td>
                {ACTIONS.map(a => (
                  <td key={a.key}>
                    <PermissionCell
                      fn={fn}
                      action={a.key}
                      cell={cellOf(effective, fn.key, a.key)}
                      small
                      changed={`${fn.key}.${a.key}` in own}
                      onClick={canEdit ? () => setDraft(cyclePersonCell(template.grants, own, fn, a.key)) : undefined}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-surface" style={{ boxShadow: '0 0 0 2px rgb(var(--walnut))' }} aria-hidden />
          Changed for this person
        </span>
        {held.length > 0 ? (
          <button type="button" className="perm-link" onClick={() => setShowHeld(s => !s)}>
            {held.length} held for now
          </button>
        ) : null}
        <button type="button" className="perm-link ml-auto" onClick={() => setShowAll(s => !s)}>
          {showAll ? 'Only what they have' : `Show all ${functions.length} functions`}
        </button>
      </div>
      {showHeld && held.length > 0 ? (
        <ul className="perm-held mt-2 rounded-[8px] list-none">
          {held.map(h => (
            <li key={h.key}>
              <b className="font-bold">{h.label}</b> — {h.reason}.
            </li>
          ))}
        </ul>
      ) : null}

      {canEdit && dirty ? (
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="bg-accent hover:bg-accent-hover text-ink text-[13px] font-medium px-4 py-2 rounded-control transition-colors disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save their permissions'}
          </button>
          <button type="button" className="perm-link text-[11px]" onClick={() => setDraft(null)}>
            Discard changes
          </button>
        </div>
      ) : null}
    </section>
  )
}
