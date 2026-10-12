import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireActionOn, requirePage } from '@/lib/auth'
import ImportWizard from './_components/ImportWizard'
import PeriodPicker from '../../_components/PeriodPicker'

interface PageProps {
  params: Promise<{ period: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function ImportPage({ params }: PageProps) {
  await requirePage('/hr-costing/payroll/[period]/import')
  await requireActionOn('/hr-costing/payroll/[period]/import', 'hr_costing', 'create')
  const { period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  return (
    <div>
      <Link
        href={`/hr-costing/payroll/${period}`}
        className="text-sm hover:text-accent transition-colors"
      >
        ← Back to {formatPeriodLabel(period)}
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · PAYROLL IMPORT · {formatPeriodLabel(period).toUpperCase()}
          </div>
          <h1 className="page-title">Import InfoTech</h1>
        </div>
        {/* suffix keeps you on the import page while changing the target month */}
        <PeriodPicker period={period} suffix="/import" />
      </div>

      <ImportWizard period={period} />
    </div>
  )
}
