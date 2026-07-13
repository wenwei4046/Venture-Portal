'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import StaffActions from './StaffActions'

export interface StaffRow {
  id: string
  employee_name: string
  employee_code: string | null
  designation: string | null
  dept_name: string | null
}

interface Props {
  staff: StaffRow[]
}

const NO_DEPT = '— No department'

export default function StaffListClient({ staff }: Props) {
  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState<string | null>(null)

  // Distinct departments from the data, A→Z, staff without a dept last.
  const departments = useMemo(() => {
    const set = new Set<string>()
    let hasNone = false
    for (const s of staff) {
      if (s.dept_name) set.add(s.dept_name)
      else hasNone = true
    }
    const list = [...set].sort((a, b) => a.localeCompare(b))
    if (hasNone) list.push(NO_DEPT)
    return list
  }, [staff])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return staff.filter(s => {
      if (deptFilter) {
        const dept = s.dept_name ?? NO_DEPT
        if (dept !== deptFilter) return false
      }
      if (!q) return true
      return (
        s.employee_name.toLowerCase().includes(q) ||
        (s.employee_code ?? '').toLowerCase().includes(q) ||
        (s.designation ?? '').toLowerCase().includes(q) ||
        (s.dept_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [staff, query, deptFilter])

  // Group by department (A→Z, no-dept last), names A→Z inside each group.
  const groups = useMemo(() => {
    const map = new Map<string, StaffRow[]>()
    for (const s of filtered) {
      const dept = s.dept_name ?? NO_DEPT
      const list = map.get(dept)
      if (list) list.push(s)
      else map.set(dept, [s])
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === NO_DEPT) return 1
        if (b === NO_DEPT) return -1
        return a.localeCompare(b)
      })
      .map(([dept, rows]) => ({
        dept,
        rows: rows.sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
      }))
  }, [filtered])

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-4 gap-4">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name or department…"
          className="flex-1 max-w-md px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border font-sans"
          aria-label="Search staff"
        />
        <div className="font-mono text-xs text-muted shrink-0">
          {filtered.length} of {staff.length} {staff.length === 1 ? 'person' : 'people'}
        </div>
      </div>

      {/* Department filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => setDeptFilter(null)}
          aria-pressed={deptFilter === null}
          className={`font-serif italic text-sm px-3 py-1.5 rounded-md border transition-colors ${
            deptFilter === null
              ? 'bg-accent border-accent text-white'
              : 'bg-surface border-hairline text-graphite hover:bg-surface-2'
          }`}
        >
          All
        </button>
        {departments.map(dept => {
          const count = staff.filter(s => (s.dept_name ?? NO_DEPT) === dept).length
          const active = deptFilter === dept
          return (
            <button
              key={dept}
              type="button"
              onClick={() => setDeptFilter(active ? null : dept)}
              aria-pressed={active}
              className={`font-serif italic text-sm px-3 py-1.5 rounded-md border transition-colors ${
                active
                  ? 'bg-accent border-accent text-white'
                  : 'bg-surface border-hairline text-graphite hover:bg-surface-2'
              }`}
            >
              {dept}
              <span className={`font-mono not-italic text-[11px] ml-1.5 ${active ? 'text-white/70' : 'text-muted'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-base">
            No staff match the current filter.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Name</th>
                <th className="text-left py-3 pr-4 font-medium">Designation</th>
                <th className="text-left py-3 pr-4 font-medium">Department</th>
                <th className="text-right py-3 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <GroupRows key={group.dept} dept={group.dept} rows={group.rows} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GroupRows({ dept, rows }: { dept: string; rows: StaffRow[] }) {
  return (
    <>
      <tr className="bg-surface border-b border-hairline">
        <td colSpan={4} className="py-2 pr-4">
          <span className="font-serif italic text-accent text-sm">{dept}</span>
          <span className="font-mono text-[11px] text-muted ml-2">
            · {rows.length} {rows.length === 1 ? 'person' : 'people'}
          </span>
        </td>
      </tr>
      {rows.map(s => (
        <tr
          key={s.id}
          className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
        >
          <td className="py-4 pr-4">
            <Link
              href={`/hr-costing/staff/${s.id}`}
              className="font-serif text-md text-ink hover:text-accent hover:underline underline-offset-4 decoration-1 transition-colors"
            >
              {s.employee_name}
            </Link>
            {s.employee_code && (
              <div className="font-mono text-[11px] text-muted mt-0.5">{s.employee_code}</div>
            )}
          </td>
          <td className="py-4 pr-4 font-serif italic text-graphite">
            {s.designation ?? '—'}
          </td>
          <td className="py-4 pr-4 font-serif italic text-graphite">
            {s.dept_name ?? '—'}
          </td>
          <td className="py-4 pr-4 text-right">
            <StaffActions staffId={s.id} staffName={s.employee_name} />
          </td>
        </tr>
      ))}
    </>
  )
}
