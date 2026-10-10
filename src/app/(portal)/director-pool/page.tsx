// Director Pool — v2 (2026-07-17): full port of the standalone HTML
// calculator (Salary_Pool_Combined). The old ledger view (dept_pools /
// invoice_payout_pool buckets) is retired; this module is standalone and
// Principal-only — the authoritative weight-split / 5% saving / 75-25
// calculation with Advance, 25% Billing and Saving running ledgers.

import Link from 'next/link'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { loadDirectorPoolData } from '@/lib/director-pool-data'
import DirectorPoolClient from './_components/DirectorPoolClient'
import DepartmentModeCard from '@/components/department/DepartmentModeCard'

export default async function DirectorPoolPage() {
  await requirePage('/director-pool')
  const user = await requirePermission('director_pool')
  const data = await loadDirectorPoolData()

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · POOL CALCULATOR
          </div>
          <h1 className="page-title">Director Pool</h1>
        </div>
        {/* Navigation, not a decision — an outline button, so the one orange
            action on the sheet stays the calculator's 💾 Save. */}
        {canDo(user, 'director_pool', 'edit') ? (
          <Link
            href="/director-pool/import"
            className="inline-block bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            📂 Import JSON
          </Link>
        ) : null}
      </div>
      {/* Cost center or centralized — the Director department's switch (2026-09-30). */}
      <DepartmentModeCard segmentKey="director" />
      <DirectorPoolClient data={data} />
    </div>
  )
}
