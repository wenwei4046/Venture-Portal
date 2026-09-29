import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import { listSubDepartments } from '../_lib/sub-departments'
import DepartmentModeCard from '@/components/department/DepartmentModeCard'

/**
 * Revenue › Department (2026-09-30) — the Revenue Department as a whole, where
 * every other Revenue page is one sub-department. It opens on the department's
 * mode: centralized (it bills the subsidiaries by invoice and pays its people
 * from its own pool, user 2026-09-30) or a cost center. Its pool belongs here
 * too once it is set up.
 */
export default async function RevenueDepartmentPage() {
  await requirePermission('revenue')
  const subs = await listSubDepartments()

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>II.</em> REVENUE · DEPARTMENT
          </div>
          <h1 className="page-title">Revenue Department</h1>
          <p className="text-sm mt-3">
            The department as a whole — each sub-department runs its own commission.
          </p>
        </div>
      </div>

      <DepartmentModeCard segmentKey="revenue_department" />

      <section>
        <div className="sect-head">
          <h2>Sub-departments</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {subs.length} SUB-DEPARTMENT{subs.length === 1 ? '' : 'S'}
          </span>
        </div>
        {subs.length === 0 ? (
          <p className="text-sm">No sub-department yet.</p>
        ) : (
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Sub-department</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.name}
                    {s.isHome ? <span className="text-[11px] ml-2">· home</span> : null}
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <Link href={revenuePath(s.slug)} className="hover:text-accent">Comm Cal</Link>
                      <Link href={revenuePath(s.slug, 'hierarchy')} className="hover:text-accent">Staff Hierarchy</Link>
                      <Link href={revenuePath(s.slug, 'rules')} className="hover:text-accent">Rules</Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
