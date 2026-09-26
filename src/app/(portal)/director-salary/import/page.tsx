import Link from 'next/link'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { getPeriodMonth } from '@/lib/utils'
import DirectorImportWizard from './_components/DirectorImportWizard'
import DirectorPeriodPicker from '../_components/DirectorPeriodPicker'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function DirectorPayrollImportPage({ searchParams }: Props) {
  await requirePermission('director_salary')
  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · PAYROLL IMPORT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Import Director Payroll</h1>
          <p className="text-sm mt-3">
            InfoTech director-only export · verbatim import ·{' '}
            <Link
              href={`/director-salary?period=${dayjs(period).format('YYYY-MM')}`}
              className="text-accent hover:text-accent-hover"
            >
              ← back to Director Salary
            </Link>
          </p>
        </div>
        <DirectorPeriodPicker period={period} basePath="/director-salary/import" />
      </div>

      <DirectorImportWizard period={period} />
    </div>
  )
}
