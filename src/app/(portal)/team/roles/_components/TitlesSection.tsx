'use client'

import { Fragment, useMemo, useState } from 'react'
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
import { createTitle, deleteTitle, updateTitle } from '../actions'

export interface TitleRow {
  id: string
  name: string
  departmentId: string | null
  departmentName: string | null
  isActive: boolean
  people: number
}

export interface DepartmentOption {
  id: string
  name: string
}

/**
 * The title table.
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
            className="text-xs font-sans text-accent hover:underline"
          >
            {adding ? 'Cancel' : '+ New title'}
          </button>
        }
      />

      <Hint>
        A title belongs to one department. Deactivating one keeps the people who
        hold it and only stops it being offered to the next hire.
        {inactiveCount > 0 ? (
          <>
            {' '}
            <button
              type="button"
              onClick={() => setShowInactive(s => !s)}
              className="not-italic font-sans text-xs text-accent hover:underline"
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
          className="mb-6 border border-hairline rounded-card bg-surface p-4 max-w-2xl"
        >
          {({ pending }) => (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[220px]">
                <span className="block font-sans text-xs uppercase tracking-wide text-graphite mb-1">
                  Title
                </span>
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="e.g. Marketing Executive"
                  className="w-full px-2 py-1.5 bg-paper border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent-border"
                />
              </label>
              <label className="min-w-[180px]">
                <span className="block font-sans text-xs uppercase tracking-wide text-graphite mb-1">
                  Department
                </span>
                <select
                  name="department_id"
                  className="w-full px-2 py-1.5 bg-paper border border-hairline rounded-control text-sm text-ink"
                >
                  <option value="">— No department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={pending}
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
              >
                {pending ? 'Saving…' : 'Add title'}
              </button>
            </div>
          )}
        </ActionForm>
      ) : null}

      {visible.length === 0 ? (
        <div className="py-10 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif italic text-muted text-sm">No titles yet.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Department</th>
                <th className="text-center">Active</th>
                <th className="text-right">People</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <Fragment key={group.dept}>
                  <tr className="bg-surface">
                    <td colSpan={5}>
                      <span className="font-serif italic text-accent text-sm">{group.dept}</span>
                      <span className="font-mono text-[11px] text-muted ml-2">
                        · {group.rows.length}
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
                          <td className="text-center">
                            <Tick
                              name="is_active"
                              defaultChecked={t.isActive}
                              ariaLabel={`${t.name} is active`}
                            />
                          </td>
                          <td className="num">{t.people}</td>
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
