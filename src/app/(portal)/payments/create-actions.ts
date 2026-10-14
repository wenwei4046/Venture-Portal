'use server'

import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadCreatePaymentOptions, type CreatePaymentOptions } from './_lib/create-payment-options'

/**
 * The Create payment dialog's lists (2026-10-14, the Finance revamp v2 — D07),
 * read when *Create payment* is pressed: whoever may make a payment voucher
 * here (Treasury · Create, Payments' tabs). A failed read is answered in words.
 */
export async function openCreatePayment(): Promise<{ ok: true; options: CreatePaymentOptions } | { ok: false; reason: string }> {
  await requireActionOn('/payments', 'treasury', 'create')
  const supabase = await createClient()
  try {
    return { ok: true, options: await loadCreatePaymentOptions(supabase) }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'The lists could not be read.' }
  }
}
