import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { loadAgentMatchingData } from '../../import-actions'
import SalesImportWizard from './_components/SalesImportWizard'

interface PageProps {
  params: Promise<{ period: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function SalesImportPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const { staff, aliases } = await loadAgentMatchingData()

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · COMMISSION · IMPORT
          </div>
          <h1 className="page-title">Import sales orders</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {label(period)}
          </p>
        </div>
        <Link
          href={`/hr-costing/commission/${period}`}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          ← Back to the run
        </Link>
      </div>

      <SalesImportWizard period={period} staff={staff} aliases={aliases} />
    </div>
  )
}
