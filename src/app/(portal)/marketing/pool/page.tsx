import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { adminClient } from '@/lib/supabase/admin'
import { officeMonth } from '@/lib/office-time'
import { statementHref, statementPeriod } from '@/lib/dept-statements'
import { MARKETING_POOL, marketingPoolExport } from '@/lib/marketing/pool'
import { openMarketingPoolRow } from './actions'
import { renderDeptStatement } from '../../dept-pool/statements/[seg]/_components/DeptStatementScreen'

// Marketing's own pool (2026-10-28): Finance's Marketing P&L and Cash Flow, drawn exactly as Dept Pool draws them, in
// Marketing's view for Marketing · Pool's holders (lib/marketing/pool.ts). The ledger opens to the treasury only, so
// it is read through the service role — after this View, Marketing's segment named in code, nothing taken from the
// request but the period. Salary lines open by department for whoever does not read payroll by person.

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ view?: string; period?: string; from?: string }>
}

export default async function MarketingPoolPage({ searchParams }: Props) {
  await requirePage('/marketing/pool')
  const user = await requireActionOn('/marketing/pool', 'marketing_pool', 'view')

  const nowYM = officeMonth()
  const { view, range, kept } = statementPeriod(await searchParams, nowYM)

  return renderDeptStatement({
    reader: adminClient() as unknown as SupabaseClient,
    label: MARKETING_POOL.label,
    segment: MARKETING_POOL.segment,
    view,
    range,
    nowYM,
    links: {
      pnl: statementHref(MARKETING_POOL.path, 'pnl', kept),
      'cash-flow': statementHref(MARKETING_POOL.path, 'cash-flow', kept),
    },
    // The Excel and PDF ride with the View (the user: "Excel/PDF 也给").
    exportHref: canDo(user, 'marketing_pool', 'export') ? (format) => marketingPoolExport(view, format, range) : null,
    drill: { open: openMarketingPoolRow, segment: MARKETING_POOL.segment },
  })
}
