'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { writeReportLayout, type ReportLayout } from '@/lib/report-layouts'

const REVALIDATE: Record<string, string[]> = {
  cash_flow: ['/reports/monthly-cash-flow', '/reports/monthly-cash-flow/layout'],
  pnl: ['/reports/monthly-pnl', '/reports/monthly-pnl/layout'],
  // Cash Flow STATEMENT — one ordered section list per side (2026-07-30).
  cash_flow_in: ['/reports/cash-flow', '/reports/cash-flow/layout'],
  cash_flow_out: ['/reports/cash-flow', '/reports/cash-flow/layout'],
}

// Save a company-wide custom report layout (cash flow / P&L).
export async function saveReportLayout(reportKey: string, layout: ReportLayout): Promise<void> {
  const user = await requireRole(['principal', 'finance'])
  if (!(reportKey in REVALIDATE)) throw new Error(`Unknown report layout: ${reportKey}`)
  const supabase = await createClient()

  const clean: ReportLayout = {
    categories: (layout.categories ?? [])
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => ({
        id: c.id,
        name: (c.name ?? '').trim() || 'Untitled',
        accounts: Array.isArray(c.accounts) ? c.accounts.filter((a) => typeof a === 'string') : [],
      })),
  }

  await writeReportLayout(supabase, reportKey, clean, user.id)
  for (const p of REVALIDATE[reportKey]) revalidatePath(p)
}
