'use server'

import { requireActionOn, requirePage } from '@/lib/auth'
import { adminClient } from '@/lib/supabase/admin'
import type { createClient } from '@/lib/supabase/server'
import { MARKETING_POOL } from '@/lib/marketing/pool'
import { cleanDrillAsk, drillFailure, readMonthlyDrill, type MonthlyDrillAsk } from '../../reports/_lib/drill-reads'
import type { MonthlyDrillAnswer } from '../../reports/drill-actions'

/**
 * Marketing's own pool (2026-10-28): an account's months and lines opened on its statement, Marketing's lines only —
 * the segment is named here, never the ask's. The ledger opens to the treasury only, so they are read through the
 * service role once the page's View is held; salary lines still fold by department for whoever does not read payroll
 * by person (lib/roles.ts › listsPayrollByPerson).
 */
export async function openMarketingPoolRow(ask: MonthlyDrillAsk): Promise<MonthlyDrillAnswer> {
  await requirePage('/marketing/pool')
  const user = await requireActionOn('/marketing/pool', 'marketing_pool', 'view')
  try {
    const reader = adminClient() as unknown as Awaited<ReturnType<typeof createClient>>
    return { ok: true, lines: await readMonthlyDrill(reader, user, { ...cleanDrillAsk(ask), segment: MARKETING_POOL.segment }) }
  } catch (e) {
    return drillFailure(e)
  }
}
