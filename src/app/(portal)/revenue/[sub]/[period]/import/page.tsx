import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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

/** The selected sub-department owns every order imported by this wizard. */
export default async function SalesImportPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub, period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub)
  const { staff, aliases } = await loadAgentMatchingData()
  const supabase = await createClient()
  const { data: scheme } = subDept.schemeId
    ? await supabase.from('comm_schemes').select('enable_open_bill').eq('id', subDept.schemeId).single()
    : { data: null }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · IMPORT · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">Import sales orders</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {label(period)} · {subDept.name}&apos;s sales orders.
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
        subDepartmentId={subDept.id}
        enableOpenBill={scheme?.enable_open_bill ?? false}
        staff={staff}
        aliases={aliases}
      />
    </div>
  )
}
