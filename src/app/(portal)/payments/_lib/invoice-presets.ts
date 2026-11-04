import type { createClient } from '@/lib/supabase/server'
import { invoicePoolForBillingMode } from '@/lib/cfo-reports'
import { lineAttributions } from '@/lib/invoice-settlement'
import { extraBillingModeToSegment, extraSegmentToPool, primeDeptRegistryFromDb } from '@/lib/dept-registry'

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
  /** A payroll invoice: the pools its lines land in, a department each (the receipt splits so —
   *  payments/actions.ts). Absent for any other invoice: it lands in `target_pool`. */
  receiving?: Array<{ pool: string; amount: number }>
  /** Billed to a department: who pays, and the Inter-billing account its side is booked to (null — none in the COA;
   *  the receipt refuses then). */
  paying?: { department: string; account: { code: string; name: string } | null }
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
    .select('id, invoice_no, company_id, total_amount, period_month, billing_mode, status, billable_to_type, billable_to_department_id, companies(name)')
    .eq('id', invoiceId)
    .single()

  if (!inv || inv.status === 'paid' || inv.status === 'paid_via_netting') return null
  // What the receipt will post (2026-11-04, HV-INV-202610-0061 read "Venture Pool · Dr 9050" while its receipt credits
  // Director Office's pool and debits Revenue's own account): a payroll invoice's lines by department, and a
  // department payer's Inter-billing account, found as the receipt finds them.
  const [receiving, paying] = await Promise.all([
    inv.billing_mode === 'payroll_consolidated' ? settleReceiving(supabase, inv.id as string, inv.billing_mode as string) : Promise.resolve(undefined),
    inv.billable_to_type === 'dept_pool' && inv.billable_to_department_id
      ? settlePayer(supabase, inv.billable_to_department_id as string)
      : Promise.resolve(undefined),
  ])
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
    ...(receiving ? { receiving } : {}),
    ...(paying ? { paying } : {}),
  }
}

/** A payroll invoice's lines summed by the pool each department's segment lands in — `lineAttributions`, as the
 *  receipt splits it. */
async function settleReceiving(supabase: Client, invoiceId: string, billingMode: string): Promise<InvoicePreset['receiving']> {
  const [{ data: lines }, registry] = await Promise.all([
    supabase.from('invoice_lines').select('amount, segment').eq('invoice_id', invoiceId),
    primeDeptRegistryFromDb(supabase).catch(() => []),
  ])
  return lineAttributions(
    ((lines ?? []) as Array<{ amount: number | string; segment: string | null }>).map((l) => ({ amount: Number(l.amount), segment: l.segment ?? null })),
    billingMode,
    { modeToSegment: extraBillingModeToSegment(registry), segmentToPool: extraSegmentToPool(registry) },
  ).map((g) => ({ pool: g.pool, amount: g.amount }))
}

/** The department billed, and its "Inter-billing - <name>" expense account — the receipt's own lookup. */
async function settlePayer(supabase: Client, departmentId: string): Promise<InvoicePreset['paying']> {
  const { data: dept } = await supabase.from('departments').select('name').eq('id', departmentId).maybeSingle()
  const name = (dept as { name?: string } | null)?.name
  if (!name) return undefined
  const { data: acct } = await supabase
    .from('chart_of_accounts')
    .select('code, name')
    .eq('type', 'expense')
    .ilike('name', `Inter-billing % ${name}`)
    .maybeSingle()
  const a = acct as { code?: string; name?: string } | null
  return { department: name, account: a?.code ? { code: a.code, name: a.name ?? '' } : null }
}

/**
 * Refund flow (2026-08-24): a PAID invoice prefills a debit PV paying the
 * money back — payee / amount / description from what was received; Finance
 * picks pool + GL account; normal PV approval. The invoice itself stays paid
 * (money-out only). Null when nothing was received.
 *
 * What was received (2026-10-16): an invoice settled on a consolidated
 * receipt (one receipt for several invoices, `settlement_voucher_id`) has no
 * receipt of its own, so counting only its own receipts read RM 0 and the
 * page opened a blank voucher. A paid invoice received at least what it owed
 * after its approved credit notes — the hub reads it so (invoice-model).
 */
export async function readRefundPreset(supabase: Client, invoiceId: string): Promise<RefundPreset | null> {
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_no, company_id, billable_to_freetext_name, status, total_amount, companies(name)')
    .eq('id', invoiceId)
    .single()
  if (!inv || (inv.status !== 'paid' && inv.status !== 'paid_via_netting')) return null
  const [{ data: receiptRows }, { data: cnRows }] = await Promise.all([
    supabase
      .from('payment_vouchers')
      .select('amount')
      .eq('invoice_id', inv.id)
      .eq('direction', 'credit')
      .neq('status', 'voided'),
    supabase.from('credit_notes').select('amount').eq('invoice_id', inv.id).eq('status', 'approved'),
  ])
  const direct = (receiptRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const credited = (cnRows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const received = inv.status === 'paid' ? Math.max(direct, Number(inv.total_amount) - credited) : direct
  if (received <= 0) return null
  const company = (inv.companies as { name: string } | null) ?? null
  return {
    invoice_no: inv.invoice_no,
    company_name: company?.name ?? inv.billable_to_freetext_name ?? '—',
    company_id: inv.company_id,
    amount: Math.round(received * 100) / 100,
  }
}
