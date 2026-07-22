// Director Pool — v2 (2026-07-17): full port of the standalone HTML
// calculator (Salary_Pool_Combined). The old ledger view (dept_pools /
// invoice_payout_pool buckets) is retired; this module is standalone and
// Principal-only — the authoritative weight-split / 5% saving / 75-25
// calculation with Advance, 25% Billing and Saving running ledgers.

import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { loadDirectorPoolData } from '@/lib/director-pool-data'
import DirectorPoolClient from './_components/DirectorPoolClient'

export default async function DirectorPoolPage() {
  await requireRole(['principal', 'hr'])
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
        <Link
          href="/director-pool/import"
          className="px-4 py-2 rounded-md border border-hairline text-sm text-graphite hover:text-accent hover:border-accent transition-colors"
        >
          📂 Import JSON
        </Link>
      </div>
      <DirectorPoolClient data={data} />
    </div>
  )
}
