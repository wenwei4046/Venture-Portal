'use server'

import { requireActionOn } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadCreatePaymentOptions, type CreatePaymentOptions, type VoucherFormOptions } from './_lib/create-payment-options'
import { readInvoicePreset, readRefundPreset, type InvoicePreset, type RefundPreset } from './_lib/invoice-presets'
import { fetchDeptRegistry } from '@/lib/dept-registry'
import { paymentPoolOptions, registryPoolOptions } from '@/lib/payment-pools'

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

/**
 * Settle an invoice on its official receipt, from the Finance phone app's
 * sheet (2026-10-16, part E4b): what `/payments/new?invoice_id=` starts its
 * form from — the outstanding balance, the pool, who it was issued to — and
 * the banks, asked on that page's own gate.
 */
export async function openInvoiceSettle(
  invoiceId: string,
): Promise<{ ok: true; preset: InvoicePreset; poolLabel: string; banks: VoucherFormOptions['banks'] } | { ok: false; reason: string }> {
  await requireActionOn('/payments/new', 'treasury', 'create')
  const supabase = await createClient()
  try {
    const [preset, { data: banks }, registry] = await Promise.all([
      readInvoicePreset(supabase, invoiceId),
      supabase.from('bank_accounts').select('id, bank_name, account_number, current_balance').eq('status', 'active').order('is_primary', { ascending: false }),
      fetchDeptRegistry(supabase).catch(() => []),
    ])
    if (!preset) return { ok: false, reason: 'This invoice is paid already — nothing is left to settle.' }
    return {
      ok: true,
      preset,
      // The pool's name as the form page's list has it (a department provisioned later among them).
      poolLabel: paymentPoolOptions(registryPoolOptions(registry)).find((p) => p.value === preset.target_pool)?.label ?? preset.target_pool,
      banks: (banks ?? []).map((b) => ({ id: b.id as string, bank_name: b.bank_name as string, account_number: (b.account_number as string | null) ?? '', current_balance: Number(b.current_balance ?? 0) })),
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'The invoice could not be read.' }
  }
}

/**
 * Refund a paid invoice, from the Finance phone app (2026-10-16, part E4b):
 * what `/payments/new?mode=refund&invoice_id=` fills its payment voucher with —
 * who paid and what was received — asked on that page's own gate.
 */
export async function openInvoiceRefund(invoiceId: string): Promise<{ ok: true; preset: RefundPreset } | { ok: false; reason: string }> {
  await requireActionOn('/payments/new', 'treasury', 'create')
  const supabase = await createClient()
  try {
    const preset = await readRefundPreset(supabase, invoiceId)
    if (!preset) return { ok: false, reason: 'Nothing was received on this invoice — there is nothing to refund.' }
    return { ok: true, preset }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'The invoice could not be read.' }
  }
}
