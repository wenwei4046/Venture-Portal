import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import ImportWizard from './_components/ImportWizard'

interface PageProps {
  params: Promise<{ period: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function ImportPage({ params }: PageProps) {
  await requireRole(['principal', 'hr'])
  const { period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  return (
    <div>
      <Link
        href={`/hr-costing/payroll/${period}`}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to {formatPeriodLabel(period)}
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYROLL IMPORT · {formatPeriodLabel(period).toUpperCase()}
          </div>
          <h1 className="page-title">Import InfoTech</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Two stages: upload the xlsx export → review the preview → apply. Only draft rows are touched.
          </p>
        </div>
      </div>

      <ImportWizard period={period} />
    </div>
  )
}
