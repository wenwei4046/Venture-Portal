'use server'

import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { officeToday } from '@/lib/office-time'
import { loadCreateReceiptOptions, type VoucherFormOptions } from '../payments/_lib/create-payment-options'
import { loadReceivableLoans, type ReceivableLoans } from '../payments/_lib/receivable-loans'

// Receipt's dialogs' lists (2026-10-14, the Finance revamp v2 — D09), read
// when *Create receipt* or *Loan repayment* is pressed: whoever may make one
// here (Treasury · Create, Receipt's tabs). A failed read is answered in words.

export async function openCreateReceipt(): Promise<{ ok: true; options: VoucherFormOptions } | { ok: false; reason: string }> {
  await requireActionOn('/receipts', 'treasury', 'create')
  const supabase = await createClient()
  try {
    return { ok: true, options: await loadCreateReceiptOptions(supabase) }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'The lists could not be read.' }
  }
}

export async function openLoanRepayment(): Promise<{ ok: true; options: ReceivableLoans & { today: string } } | { ok: false; reason: string }> {
  await requireActionOn('/receipts', 'treasury', 'create')
  const supabase = await createClient()
  try {
    return { ok: true, options: { ...(await loadReceivableLoans(supabase)), today: officeToday() } }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'The loans could not be read.' }
  }
}
