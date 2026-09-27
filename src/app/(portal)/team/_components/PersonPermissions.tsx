'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setUserPermission } from '../permissions/permission-actions'

export interface PersonPermissionRow {
  key: string
  label: string
  section: string
  /** What their title (or role) gives them, before any exception. */
  inherited: boolean
  /** The exception on this person, if there is one. */
  override: boolean | null
}

/**
 * One person's exceptions to their title.
 *
 * Three states per row, not two, because "allowed" and "not denied" are
 * different facts: a row can follow the title, be granted despite it, or be
 * denied despite it. Denial has to be storable or you could never hold one
 * person back from something the title has to keep for everybody else.
 */
export default function PersonPermissions({
  userId,
  rows,
  source,
  canEdit,
}: {
  userId: string
  rows: PersonPermissionRow[]
  /** Where the inherited column comes from — a title, or the account's role. */
  source: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const sections = [...new Set(rows.map(r => r.section))]
  const exceptions = rows.filter(r => r.override !== null).length

  function set(key: string, value: boolean | null) {
    if (!canEdit) return
    setError(null)
    setBusy(key)
    startTransition(async () => {
      try {
        await setUserPermission(userId, key, value)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save')
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <section className="mt-10">
      <div className="sect-head">
        <h2>Permissions</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {exceptions === 0 ? 'NO EXCEPTIONS' : `${exceptions} EXCEPTION${exceptions === 1 ? '' : 'S'}`}
        </span>
      </div>

      <p className="text-sm mb-4 max-w-2xl">
        Inherited from {source}. An exception applies to this person alone and
        overrides it either way.
      </p>

      {error ? <div className="sheet-danger mt-0 mb-4">{error}</div> : null}

      <div className="table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Permission</th>
              <th className="text-center">Inherited</th>
              <th className="text-center">Effective</th>
              <th className="text-right">Exception</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(section => (
              <PermissionSection
                key={section}
                section={section}
                rows={rows.filter(r => r.section === section)}
                canEdit={canEdit}
                busy={busy}
                pending={pending}
                onSet={set}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PermissionSection({
  section,
  rows,
  canEdit,
  busy,
  pending,
  onSet,
}: {
  section: string
  rows: PersonPermissionRow[]
  canEdit: boolean
  busy: string | null
  pending: boolean
  onSet: (key: string, value: boolean | null) => void
}) {
  return (
    <>
      {/* A band row between sections, in the sheet's band tone. */}
      <tr>
        <td colSpan={4} className="bg-chrome/50 text-[10px] font-semibold uppercase tracking-[0.06em]">
          {section}
        </td>
      </tr>
      {rows.map(r => {
        const effective = r.override ?? r.inherited
        return (
          <tr key={r.key}>
            <td>{r.label}</td>
            <td className="text-center">
              {r.inherited ? <span className="text-ledger">✓</span> : <span>·</span>}
            </td>
            {/* An exception is the heavier glyph: a grant is a bold tick, a
                denial a bold red dot — the Exception column says it in words. */}
            <td className="text-center">
              {effective ? (
                <span className={r.override === true ? 'text-ledger font-bold' : 'text-ledger'}>✓</span>
              ) : (
                <span className={r.override === false ? 'text-danger font-bold' : undefined}>·</span>
              )}
            </td>
            <td className="text-right whitespace-nowrap">
              <span className="inline-flex items-center gap-2">
                {/* The exception itself, as a word on a wash. */}
                {r.override === true ? (
                  <span className="chip accent">
                    <span className="dot" aria-hidden />
                    granted
                  </span>
                ) : r.override === false ? (
                  <span className="chip danger">
                    <span className="dot" aria-hidden />
                    denied
                  </span>
                ) : canEdit ? null : (
                  '—'
                )}
                {canEdit && r.override !== null ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onSet(r.key, null)}
                    className="text-xs px-2 py-0.5 rounded-control border border-hairline bg-surface hover:bg-surface-2 transition-colors disabled:opacity-50"
                  >
                    {busy === r.key ? '…' : 'Follow title'}
                  </button>
                ) : null}
                {canEdit && r.override !== true && r.inherited === false ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onSet(r.key, true)}
                    className="text-xs px-2 py-0.5 rounded-control border border-accent bg-surface hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    Grant
                  </button>
                ) : null}
                {canEdit && r.override !== false && r.inherited === true ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onSet(r.key, false)}
                    className="text-xs px-2 py-0.5 rounded-control border border-danger/40 bg-surface text-danger hover:bg-danger-bg transition-colors disabled:opacity-50"
                  >
                    Deny
                  </button>
                ) : null}
              </span>
            </td>
          </tr>
        )
      })}
    </>
  )
}
