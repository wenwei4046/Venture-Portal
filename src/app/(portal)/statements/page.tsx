// /statements is now the Invoices landing (mig 2026-05-15 tab reorder).
// The Monthly Statements list moved to /statements/monthly.

import Link from 'next/link'
import dayjs from 'dayjs'
import BillingView from '../billing/_components/BillingView'
import StatementsTabHeader from './_components/StatementsTabHeader'
import { getPeriodMonth } from '@/lib/utils'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function StatementsPage(props: Props) {
  const params = await props.searchParams
  const period = params.period ?? getPeriodMonth()
  const periodFormatted = dayjs(period).format('YYYY-MM')
  const exportQs = `&period=${periodFormatted}`

  return (
    <div>
      <StatementsTabHeader active="invoices" />
      <div className="flex justify-end gap-2 mb-4">
        <Link
          href={`/statements/export?format=xlsx${exportQs}`}
          className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
        >
          Export Excel
        </Link>
        <Link
          href={`/statements/export?format=pdf${exportQs}`}
          className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
        >
          Export PDF
        </Link>
      </div>
      <BillingView searchParams={Promise.resolve(params)} />
    </div>
  )
}
