import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import { loadAgentMatchingData } from '../../../import-actions'
import SalesImportWizard from './_components/SalesImportWizard'
import { requireSubDepartment } from '../../../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string; period: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * The import is DEPARTMENT-wide: one ERP export per month covers every
 * sub-department, and `sales_import_batches` is keyed by period alone. The
 * slug in the URL is only where you came from and where Back returns to —
 * which sub-department a sale pays is settled later, by whose hierarchy the
 * salesperson sits in when a run reads it.
 */
export default async function SalesImportPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { sub, period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub)
  const { staff, aliases } = await loadAgentMatchingData()

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · IMPORT · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">Import sales orders</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {label(period)} · the whole department&apos;s export, in one file.
          </p>
        </div>
        <Link
          href={revenuePath(subDept.slug, period)}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          ← Back to the run
        </Link>
      </div>

      <SalesImportWizard
        period={period}
        subDeptSlug={subDept.slug}
        staff={staff}
        aliases={aliases}
      />
    </div>
  )
}
