'use server'

import { requireActionOn, requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { reportsCompanyWide } from '@/lib/surfaces'
import { createClient } from '@/lib/supabase/server'
import type { SheetTxn } from '@/lib/report-sheet'
import { cleanDrillAsk, drillFailure, readMonthlyDrill, type MonthlyDrillAsk } from './_lib/drill-reads'

// A month-by-month report's rows, opened (2026-10-24; as rows of the sheet with L4, 2026-10-26): the lines are read
// when a row opens — every row on show at once at L4 — so the sheet itself stays as light as it was. Each answers for
// its own page and asks what that page asks: Reports' three month-by-month reports whoever reads the reports
// company-wide; a department's own statements under Dept Pool whoever its page opens to.

/** Each row's lines, filed by `drillRowKey`. */
export type MonthlyDrillAnswer = { ok: true; lines: Record<string, SheetTxn[]> } | { ok: false; reason: string }

/** Reports' Monthly P&L, Monthly Cash Flow and Monthly Receipt & Payment. */
export async function openReportRow(page: 'monthly-pnl' | 'monthly-cash-flow' | 'monthly-receipt-payment', ask: MonthlyDrillAsk): Promise<MonthlyDrillAnswer> {
  if (page === 'monthly-pnl') await requirePage('/reports/monthly-pnl')
  else if (page === 'monthly-cash-flow') await requirePage('/reports/monthly-cash-flow')
  else await requirePage('/reports/monthly-receipt-payment')
  const user = await requirePermission('dept_reports')
  if (!reportsCompanyWide(user)) return { ok: false, reason: 'These lines are not open to you.' }
  try {
    const supabase = await createClient()
    return { ok: true, lines: await readMonthlyDrill(supabase, user, cleanDrillAsk(ask)) }
  } catch (e) {
    return drillFailure(e)
  }
}

/** A department's own month-by-month P&L and Cash Flow under Dept Pool — its segment always named. */
export async function openDeptPoolRow(ask: MonthlyDrillAsk): Promise<MonthlyDrillAnswer> {
  await requirePage('/dept-pool/statements/[seg]')
  const user = await requireActionOn('/dept-pool/statements/[seg]', 'reports', 'view')
  if (!canDo(user, 'dept_pool', 'view')) return { ok: false, reason: 'These lines are not open to you.' }
  const clean = cleanDrillAsk(ask)
  if (!clean.segment) return { ok: false, reason: 'A department’s statement names its segment.' }
  try {
    const supabase = await createClient()
    return { ok: true, lines: await readMonthlyDrill(supabase, user, clean) }
  } catch (e) {
    return drillFailure(e)
  }
}
