import type { createClient } from '@/lib/supabase/server'
import type { AccountType, CashFlowCategory } from '@/lib/coa'
import type { CoaAccount } from '@/lib/coa-edit'

// Settings › Chart of Accounts' rows (2026-10-15, lifted out of the Settings
// page's read word for word so the Finance phone app reads the very same):
// every account, active or not, by type, then its order, then its code.

type Client = Awaited<ReturnType<typeof createClient>>

/** The chart as the Settings page selects it. */
export function accountRowsRead(supabase: Client) {
  return supabase
    .from('chart_of_accounts')
    .select('code, name, type, cash_flow_category, parent_code, is_active, sort_order')
    .order('type')
    .order('sort_order')
    .order('code')
}

/** The rows, typed (a read that fails reads as none, as the page's). */
export async function readAccountRows(supabase: Client): Promise<CoaAccount[]> {
  const { data } = await accountRowsRead(supabase)
  return (data ?? []).map((a) => ({
    code: a.code as string,
    name: a.name as string,
    type: a.type as AccountType,
    cash_flow_category: a.cash_flow_category as CashFlowCategory,
    parent_code: ((a as { parent_code: string | null }).parent_code as string | null) ?? null,
    is_active: Boolean(a.is_active),
    sort_order: Number(a.sort_order ?? 0),
  }))
}
