'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { writeReportLayout } from '@/lib/report-layouts'
import type { CashFlowLayout } from '@/lib/cash-flow-custom'

// Save the company-wide custom cash-flow layout (categories + account order).
export async function saveCashFlowLayout(layout: CashFlowLayout): Promise<void> {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const clean: CashFlowLayout = {
    categories: (layout.categories ?? [])
      .filter((c) => c && typeof c.id === 'string')
      .map((c) => ({
        id: c.id,
        name: (c.name ?? '').trim() || 'Untitled',
        accounts: Array.isArray(c.accounts) ? c.accounts.filter((a) => typeof a === 'string') : [],
      })),
  }

  await writeReportLayout(supabase, 'cash_flow', clean, user.id)

  revalidatePath('/reports/monthly-cash-flow')
  revalidatePath('/reports/monthly-cash-flow/layout')
}
