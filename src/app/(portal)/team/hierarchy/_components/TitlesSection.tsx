'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ActionButton,
  ActionForm,
  Choice,
  Field,
  Hidden,
  RowForm,
  SaveButton,
  SectionHead,
  Tick,
  Hint,
} from '@/components/RowForm'
import { createTitle, deleteTitle, updateTitle } from '../title-actions'

export interface TitleRow {
  id: string
  name: string
  departmentId: string | null
  departmentName: string | null
  isActive: boolean
  /** Heads its department (Revenue Director): above the ladder, no rank, no override. */
  isDepartmentHead: boolean
  people: number
  /** Where it stands on the ladder (Hierarchy › Levels); null when not placed. */
  levelRank: number | null
  /** The permission template its holders follow; null while it has none. */
  templateId: string | null
  templateName: string | null
}

export interface DepartmentOption {
  id: string
  name: string
}

/**
 * The title table — Hierarchy › Roles since 2026-10-08 (the Claude Design
 * handoff merged the Roles page in as the fourth tab), with the rung each
 * title stands on and the permission template it points at.
 *
 * Every row is its own form, so it uses RowForm and the `form` attribute
 * rather than a `<form>` inside `<tbody>` — and for the same reason the table
 * does NOT fold on a phone: LedgerRow renders a demoted cell twice, and two
 * inputs sharing a name would hand the server the untouched copy.
 */
export default function TitlesSection({
  titles,
  departments,
  canDelete,
}: {
  titles: TitleRow[]
  departments: DepartmentOption[]
  canDelete: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const visible = useMemo(
    () => (showInactive ? titles : titles.filter(t => t.isActive)),
    [titles, showInactive],
  )
  const inactiveCount = titles.length - titles.filter(t => t.isActive).length

  // Grouped by department, the way the roster reads.
  const groups = useMemo(() => {
    const map = new Map<string, TitleRow[]>()
    for (const t of visible) {
      const key = t.departmentName ?? '— No department'
      const list = map.get(key)
      if (list) list.push(t)
      else map.set(key, [t])
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a.startsWith('—') ? 1 : b.startsWith('—') ? -1 : a.localeCompare(b)))
      .map(([dept, rows]) => ({ dept, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) }))
  }, [visible])

  return (
    <section className="mb-12">
      <SectionHead
        title="Titles"
        count={`${visible.length} ${visible.length === 1 ? 'TITLE' : 'TITLES'}`}
        action={
          <button
            type="button"
            onClick={() => setAdding(a => !a)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors whitespace-nowrap"
          >
            {adding ? 'Cancel' : '+ New title'}
          </button>
        }
      />

      <Hint>
        A title belongs to one department. Deactivating one keeps the people who
        hold it and only stops it being offered to the next hire. <strong>Head</strong> marks
        the title that heads its department — the Revenue Director: it stands above the
        commission ladder with no rank, every team leader and standalone member of the
        sub-departments it directs reports to it, and no override climbs to it. Each title points at one
        permission template, edited under People Management → Permissions.
        {inactiveCount > 0 ? (
          <>
            {' '}
            <button
              type="button"
              onClick={() => setShowInactive(s => !s)}
              className="font-sans text-xs underline underline-offset-[3px] decoration-ink/35 hover:decoration-ink"
            >
              {showInactive ? 'Hide' : `Show ${inactiveCount}`} inactive
            </button>
          </>
        ) : null}
      </Hint>

      {adding ? (
        <ActionForm
          action={createTitle}
          onDone={() => setAdding(false)}
          className="mb-6 border border-hairline rounded-card bg-surface-2 p-4 max-w-2xl"
        >
          {({ pending }) => (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[220px]">
                <span className="block font-sans text-[10px] font-semibold uppercase tracking-[0.06em] mb-1">
                  Title
                </span>
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="e.g. Marketing Executive"
                  className="w-full px-2 py-1.5 bg-surface border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent-border"
                />
              </label>
              <label className="min-w-[180px]">
                <span className="block font-sans text-[10px] font-semibold uppercase tracking-[0.06em] mb-1">
                  Department
                </span>
                <select
                  name="department_id"
                  className="w-full px-2 py-1.5 bg-surface border border-hairline rounded-control text-sm text-ink"
                >
                  <option value="">— No department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-2 font-sans text-xs">
                <input type="checkbox" name="is_department_head" className="accent-[rgb(var(--accent))]" />
                Heads the department
              </label>
              {/* The form's one action: orange, black lettering. */}
              <button
                type="submit"
                disabled={pending}
                className="bg-accent hover:bg-accent-hover text-ink font-medium text-sm px-4 py-2 rounded-control transition-colors"
              >
                {pending ? 'Saving…' : 'Add title'}
              </button>
            </div>
          )}
        </ActionForm>
      ) : null}

      {visible.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm">No titles yet.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Department</th>
                <th>Level</th>
                <th className="text-center">Active</th>
                <th className="text-center" title="Heads its department: above the commission ladder, no rank, no override">Head</th>
                <th className="text-right">People</th>
                <th>Permission template</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <Fragment key={group.dept}>
                  {/* The department band — the header band's tone with a
                      walnut marker, like the roster's (globals.css ›
                      `.band-row`). It labels the rows under it; unlike the
                      roster's it does not fold. */}
                  <tr className="band-row">
                    <td colSpan={8}>
                      {group.dept}
                      <span className="count">
                        {group.rows.length} {group.rows.length === 1 ? 'title' : 'titles'}
                      </span>
                    </td>
                  </tr>
                  {group.rows.map(t => (
                    <RowForm key={t.id} action={updateTitle}>
                      {({ pending }) => (
                        <tr className={t.isActive ? undefined : 'opacity-60'}>
                          <td>
                            <Hidden name="id" value={t.id} />
                            <Field
                              name="name"
                              defaultValue={t.name}
                              ariaLabel={`Name of ${t.name}`}
                            />
                          </td>
                          <td>
                            <Choice
                              name="department_id"
                              defaultValue={t.departmentId ?? ''}
                              ariaLabel={`Department of ${t.name}`}
                            >
                              <option value="">— No department</option>
                              {departments.map(d => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </Choice>
                          </td>
                          <td className="font-mono text-[11px] whitespace-nowrap">
                            {t.levelRank !== null ? `L${t.levelRank}` : '—'}
                          </td>
                          <td className="text-center">
                            <Tick
                              name="is_active"
                              defaultChecked={t.isActive}
                              ariaLabel={`${t.name} is active`}
                            />
                          </td>
                          <td className="text-center">
                            <Tick
                              name="is_department_head"
                              defaultChecked={t.isDepartmentHead}
                              ariaLabel={`${t.name} heads the department`}
                            />
                          </td>
                          <td className="num">{t.people}</td>
                          <td className="whitespace-nowrap">
                            {/* What it may do lives on People Management › Permissions;
                                the link opens that template. */}
                            <Link
                              href={
                                t.templateId
                                  ? `/team/people?tab=permissions&template=${t.templateId}`
                                  : '/team/people?tab=permissions'
                              }
                              className="underline underline-offset-[3px] decoration-ink/35 hover:decoration-ink"
                            >
                              {t.templateName ?? 'No template yet'} →
                            </Link>
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <SaveButton pending={pending} />
                            {canDelete && t.people === 0 ? (
                              <span className="ml-3">
                                <ActionButton
                                  run={() => deleteTitle(t.id)}
                                  label="Delete"
                                  danger
                                  confirm={`Delete the title "${t.name}"?`}
                                />
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </RowForm>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
