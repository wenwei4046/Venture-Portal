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

export default function StaffListClient({ staff }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staff
    return staff.filter(
      s =>
        s.employee_name.toLowerCase().includes(q) ||
        (s.employee_code ?? '').toLowerCase().includes(q) ||
        (s.designation ?? '').toLowerCase().includes(q) ||
        (s.dept_name ?? '').toLowerCase().includes(q)
    )
  }, [staff, query])

  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-6 gap-4">
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

      {filtered.length === 0 ? (
        <div className="py-12 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-base">
            No staff match <em>&ldquo;{query}&rdquo;</em>.
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
              {filtered.map(s => (
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
