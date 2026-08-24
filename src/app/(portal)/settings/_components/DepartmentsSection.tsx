'use client'

import { useState, useTransition } from 'react'
import { addDepartment } from '../actions'

// Departments management (2026-08-24). ADD-only on purpose: the five core
// departments' NAMES drive segment mapping across the whole system, so there
// is no rename and no delete here. New departments are lightweight — usable
// for staff, claims and inter-billing targets — and their GL books under the
// Venture segment until a full segment build is done for them.

interface DeptRow {
  id: string
  name: string
  is_internal: boolean
  created_at: string | null
}

const CORE_NAMES = new Set(['marketing', 'hr', 'finance', 'director office', 'director'])

export default function DepartmentsSection({ departments }: { departments: DeptRow[] }) {
  const [isPending, startTransition] = useTransition()
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleAdd(formData: FormData) {
    setError(null)
    startTransition(async () => {
      try {
        await addDepartment(formData)
        setShowAdd(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-serif text-2xl text-ink">Departments</h2>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-sm text-accent hover:text-accent-hover font-serif italic"
        >
          {showAdd ? 'Cancel' : '+ Add department'}
        </button>
      </div>
      <p className="font-serif italic text-muted text-sm mb-4 max-w-2xl">
        新部门马上可以:挂员工、挂 claims、被 inter-billing 开单、给账号设 dept manager。
        它的账目会记在 Venture segment 底下 — 要有自己的 P&amp;L / pool / 报表,是另一次工程,跟 Claude 讲。
        名字不能改、部门不能删 (五个核心部门的名字连着整个账本的分段规则)。
      </p>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}

      {showAdd ? (
        <form action={handleAdd} className="bg-surface border border-hairline rounded-md p-6 mb-6 max-w-xl">
          <h3 className="font-serif text-lg text-ink mb-4">New department</h3>
          <div className="mb-4">
            <label htmlFor="new_dept_name" className="block text-sm font-sans font-medium text-graphite mb-1">
              Department name
            </label>
            <input
              id="new_dept_name"
              name="name"
              type="text"
              required
              maxLength={40}
              className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
              placeholder="e.g. Operations"
            />
            <p className="font-serif italic text-muted text-xs mt-1">
              取好再按 — 加了之后名字改不了。
            </p>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? 'Adding…' : 'Add department'}
          </button>
        </form>
      ) : null}

      <div className="border border-hairline rounded-md bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-surface-2/30">
              <th className="text-left py-3 px-4 font-medium">Name</th>
              <th className="text-left py-3 px-4 font-medium">Type</th>
              <th className="text-left py-3 px-4 font-medium">Segment</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((d) => {
              const core = CORE_NAMES.has(d.name.trim().toLowerCase())
              return (
                <tr key={d.id} className="border-b border-hairline last:border-0">
                  <td className="py-3 px-4 font-serif text-ink">{d.name}</td>
                  <td className="py-3 px-4">
                    <span className="font-serif italic text-sm text-graphite">
                      {d.is_internal ? 'internal (system)' : core ? 'core department' : 'department'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-muted">
                    {d.is_internal ? '—' : core ? '自己的 segment' : 'Venture (corporate)'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
