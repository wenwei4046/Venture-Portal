import type { createClient } from '@/lib/supabase/server'
import { invoicePoolForBillingMode } from '@/lib/cfo-reports'

// What the voucher page fills in from an invoice (2026-10-16 — lifted out of
// `/payments/new` word for word, so the Finance phone app's sheets read the
// same): settling an invoice still owed (`?invoice_id=` — its outstanding
// balance, the pool its billing mode lands in, who it was issued to) and
// refunding a paid one (`?mode=refund&invoice_id=` — what was received).

type Client = Awaited<ReturnType<typeof createClient>>

export interface InvoicePreset {
  id: string
  invoice_no: string | null
  company_id: string | null
  company_name: string
  total_amount: number
  period_month: string
  billing_mode: string
  target_pool: string
  /** Mig 225 polymorphism: tells the form whether this invoice was issued
   *  to a subsidiary (real bank involved) vs an internal dept pool / director
   *  (inter-billing, no real money moves — settle via netting). */
  billable_to_type: 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null
}

export interface RefundPreset {
  invoice_no: string | null
  company_name: string
  company_id: string | null
  amount: number
}

/** An invoice still owed, to settle: null once it is paid (or not to be seen). */
export async function readInvoicePreset(supabase: Client, invoiceId: string): Promise<InvoicePreset | null> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_no, company_id, total_amount, period_month, billing_mode, status, billable_to_type, companies(name)')
    .eq('id', invoiceId)
    .single()

  if (!inv || inv.status === 'paid' || inv.status === 'paid_via_netting') return null
  const company = (inv.companies as { name: string } | null) ?? null
  // Prefill the OUTSTANDING balance, not the printed total — partial
  // receipts and approved credit notes (CN v2, 2026-08-19) both reduce
  // what's left to collect.
  const [{ data: receiptRows }, { data: cnRows }] = await Promise.all([
    supabase
      .from('payment_vouchers')
      .select('amount')
      .eq('invoice_id', inv.id)
      .eq('direction', 'credit')
      .neq('status', 'voided'),
    supabase.from('credit_notes').select('amount').eq('invoice_id', inv.id).eq('status', 'approved'),
  ])
  const received = (receiptRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const credited = (cnRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const outstanding = Math.round((Number(inv.total_amount) - received - credited) * 100) / 100
  return {
    id: inv.id,
    invoice_no: inv.invoice_no,
    company_id: inv.company_id, // may be null for non-subsidiary invoices (Item 5)
    company_name: company?.name ?? '—',
    total_amount: outstanding > 0 ? outstanding : Number(inv.total_amount),
    period_month: inv.period_month,
    billing_mode: inv.billing_mode,
    // Settlement routing: the money lands in the dept pool that generated the
    // service — the canonical map (cfo-reports) drives both this prefill and
    // the income statement.
    target_pool: invoicePoolForBillingMode(inv.billing_mode),
    billable_to_type: (inv.billable_to_type as InvoicePreset['billable_to_type']) ?? null,
  }
}

/**
 * Refund flow (2026-08-24): a PAID invoice prefills a debit PV paying the
 * money back — payee / amount / description from the invoice's actual
 * receipts; Finance picks pool + GL account; normal PV approval. The invoice
 * itself stays paid (money-out only). Null when nothing was received.
 */
export async function readRefundPreset(supabase: Client, invoiceId: string): Promise<RefundPreset | null> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_no, company_id, billable_to_freetext_name, status, companies(name)')
    .eq('id', invoiceId)
    .single()
  if (!inv || (inv.status !== 'paid' && inv.status !== 'paid_via_netting')) return null
  const { data: receiptRows } = await supabase
    .from('payment_vouchers')
    .select('amount')
    .eq('invoice_id', inv.id)
    .eq('direction', 'credit')
    .neq('status', 'voided')
  const received = (receiptRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  if (received <= 0) return null
  const company = (inv.companies as { name: string } | null) ?? null
  return {
    invoice_no: inv.invoice_no,
    company_name: company?.name ?? inv.billable_to_freetext_name ?? '—',
    company_id: inv.company_id,
    amount: Math.round(received * 100) / 100,
  }
}
