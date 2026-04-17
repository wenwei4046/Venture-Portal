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

      <div className="mt-6 mb-10">
        <h1 className="font-serif text-3xl text-ink">Import CSV · {formatPeriodLabel(period)}</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Upload an InfoTech-style CSV. Three stages: upload → map columns → preview → apply. Only
          existing draft rows are touched.
        </p>
      </div>

      <ImportWizard period={period} />
    </div>
  )
}
