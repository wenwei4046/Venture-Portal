'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resetTitleToRoleDefaults, setTitlePermissions } from '../permission-actions'

export interface PermissionDef {
  key: string
  label: string
  section: string
  scope: string
  description: string | null
}

export interface MatrixTitle {
  id: string
  name: string
  departmentName: string | null
  people: number
  /** Null while the title has no rows — it inherits its holders' role. */
  granted: string[] | null
}

export interface RoleDefaults {
  role: string
  keys: string[]
}

/**
 * The permission matrix.
 *
 * A title at a time rather than a 20-column grid: the question somebody
 * actually arrives with is "what can a Marketing Executive do", and a wall of
 * ticks 20 wide answers it worse than a list does.
 *
 * The distinction the whole model rests on is drawn at the top of the panel: a
 * title either INHERITS (no rows, its holders fall back to the role their
 * account was created with) or is CONFIGURED (its list is the answer, and the
 * role stops being consulted). Ticking anything crosses that line, so the UI
 * says so before you cross it rather than after.
 */
export default function PermissionMatrix({
  defs,
  titles,
  roleDefaults,
  canEdit,
}: {
  defs: PermissionDef[]
  titles: MatrixTitle[]
  roleDefaults: RoleDefaults[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(titles[0]?.id ?? null)
  const [draft, setDraft] = useState<Set<string> | null>(null)

  const selected = titles.find(t => t.id === selectedId) ?? null

  const sections = useMemo(() => {
    const map = new Map<string, PermissionDef[]>()
    for (const d of defs) {
      const list = map.get(d.section)
      if (list) list.push(d)
      else map.set(d.section, [d])
    }
    return [...map.entries()]
  }, [defs])

  // What the panel shows: the draft being edited, else what is stored, else
  // nothing (an inheriting title starts from an empty list, and the hint says
  // where its holders' access actually comes from).
  const shown = draft ?? new Set(selected?.granted ?? [])
  const inheriting = selected?.granted === null && draft === null
  const dirty = draft !== null

  function pick(title: MatrixTitle) {
    setSelectedId(title.id)
    setDraft(null)
    setNote(null)
    setError(null)
  }

  function toggle(key: string) {
    if (!canEdit) return
    setDraft(prev => {
      const next = new Set(prev ?? selected?.granted ?? [])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function save() {
    if (!selected || !draft) return
    setError(null)
    startTransition(async () => {
      try {
        await setTitlePermissions(selected.id, [...draft])
        setNote(`${selected.name} now has its own permissions.`)
        setDraft(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save')
      }
    })
  }

  function reset() {
    if (!selected) return
    setError(null)
    startTransition(async () => {
      try {
        await resetTitleToRoleDefaults(selected.id)
        setNote(`${selected.name} is back to inheriting from the account's role.`)
        setDraft(null)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reset')
      }
    })
  }

  return (
    <section className="mb-12">
      <div className="sect-head">
        <h2>Permissions</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {defs.length} {defs.length === 1 ? 'PERMISSION' : 'PERMISSIONS'}
        </span>
      </div>

      {error ? <div className="sheet-danger">{error}</div> : null}
      {note && !error ? <div className="sheet-notice">{note}</div> : null}

      {/* Two framed wells in the sheet's table tone: the titles on the left,
          the one being read on the right. */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Titles */}
        <div className="border border-[rgb(var(--sheet-table-border))] rounded-lg bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[rgb(var(--sheet-table-rule))] bg-[rgb(var(--sheet-table-head))]">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Titles</span>
          </div>
          <ul className="max-h-[520px] overflow-y-auto">
            {titles.map(t => {
              const active = t.id === selectedId
              return (
                <li key={t.id}>
                  {/* The title being read: a peach wash with an orange marker,
                      the sheet's way of saying "this one" — never orange
                      lettering. */}
                  <button
                    type="button"
                    onClick={() => pick(t)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full text-left px-4 py-2.5 border-b border-hairline last:border-0 transition-colors ${
                      active
                        ? 'bg-accent-bg shadow-[inset_3px_0_0_rgb(var(--accent))]'
                        : 'hover:bg-surface-2'
                    }`}
                  >
                    <div className={`text-sm truncate ${active ? 'font-semibold' : ''}`}>
                      {t.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[10px] truncate">
                        {t.departmentName ?? 'no department'}
                      </span>
                      {t.granted === null ? (
                        <span className="chip shrink-0">inherits</span>
                      ) : (
                        <span className="chip accent shrink-0">{t.granted.length} set</span>
                      )}
                      {t.people > 0 ? (
                        <span
                          className="font-mono text-[10px] ml-auto shrink-0"
                          title={`${t.people} ${t.people === 1 ? 'person holds' : 'people hold'} this title`}
                        >
                          {t.people}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* The selected title's permissions */}
        <div className="border border-[rgb(var(--sheet-table-border))] rounded-lg bg-surface">
          {!selected ? (
            <div className="p-10 text-center text-sm">
              No titles yet. Add one above.
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-hairline flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <div className="sheet-heading">{selected.name}</div>
                  <div className="sheet-subtitle max-w-xl">
                    {inheriting ? (
                      <>
                        Inherits from whatever role each holder&apos;s account was
                        created with. Tick anything and this list becomes the
                        answer instead.
                      </>
                    ) : (
                      <>
                        This list is the answer for everybody holding this title.
                        The role their account was created with is no longer
                        consulted.
                      </>
                    )}
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-3 shrink-0">
                    {selected.granted !== null ? (
                      <button
                        type="button"
                        onClick={reset}
                        disabled={pending}
                        className="text-xs underline underline-offset-[3px] decoration-ink/35 hover:decoration-ink transition-colors"
                      >
                        Back to inherit
                      </button>
                    ) : null}
                    {/* The panel's one action. While nothing has changed it
                        reads "Saved" and is disabled — the sheet fades a
                        disabled control. */}
                    <button
                      type="button"
                      onClick={save}
                      disabled={!dirty || pending}
                      className="bg-accent hover:bg-accent-hover text-ink font-medium text-sm px-4 py-2 rounded-control transition-colors"
                    >
                      {pending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="p-5 space-y-6">
                {sections.map(([section, items]) => (
                  <div key={section}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2">
                      {section}
                    </div>
                    <ul className="space-y-2">
                      {items.map(d => (
                        <li key={d.key}>
                          <label
                            className={`flex items-start gap-2.5 ${canEdit ? 'cursor-pointer' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={shown.has(d.key)}
                              disabled={!canEdit}
                              onChange={() => toggle(d.key)}
                              className="h-4 w-4 mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="text-sm font-medium">{d.label}</span>
                              {d.description ? (
                                <span className="block text-xs mt-0.5">{d.description}</span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* What the four roles grant, for reference while deciding. */}
      <details className="mt-6">
        <summary className="text-sm font-medium cursor-pointer">
          What each role grants today
        </summary>
        <div className="mt-3 table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Permission</th>
                {roleDefaults.map(r => (
                  <th key={r.role} className="text-center">
                    {r.role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {defs.map(d => (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  {roleDefaults.map(r => (
                    <td key={r.role} className="text-center">
                      {r.keys.includes(d.key) ? (
                        <span className="text-ledger font-semibold">✓</span>
                      ) : (
                        <span className="opacity-40">·</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}
