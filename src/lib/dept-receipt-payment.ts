// Dept-scoped Receipt & Payment data (2026-08-20, marketing user features):
// the 未收 To collect — every issued invoice of the segment the reader picks,
// net of its receipts and approved credit notes. The reader reads the reports
// company-wide (the Dept Manager's own-segment mode went with the kind,
// 2026-10-17, and with it the department's own cash-line read).

import { fetchAllRows } from '@/lib/paginate'

// Matches the supabase server/client shape loosely — same trick the other
// dept libs use so both server components and route handlers can call in.
type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export interface DeptOutstandingInvoice {
  id: string
  invoiceNo: string | null
  companyId: string | null
  partyFallback: string | null
  periodMonth: string
  invoiceDate: string | null
  totalAmount: number
  receipts: number
  credits: number
  outstanding: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** One row of dept_invoice_settlements: an issued invoice of the caller's
 *  segment with Σ receipts and Σ approved credit notes. */
export interface DeptInvoiceSettlement {
  invoice_id: string
  receipts: number
  credits: number
}

/** The part of a PostgREST rpc builder a paged read needs. */
type RpcRows<T> = {
  order: (column: string) => RpcRows<T>
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

/** Every row of dept_invoice_settlements (2026-10-08). It returns a TABLE —
 *  one row per issued invoice — and PostgREST caps a function's rows at 1000
 *  like any read, so it is paged in invoice order (a total order: one row per
 *  invoice). Its answers only feed lookups by invoice. Throws on an error;
 *  each caller keeps its own rule for one (they all read it as "none"). */
export function fetchDeptInvoiceSettlements(
  supabase: Pick<Db, 'rpc'>,
  args: Record<string, unknown> = {},
): Promise<DeptInvoiceSettlement[]> {
  return fetchAllRows((lo, hi) =>
    (supabase.rpc('dept_invoice_settlements', args) as unknown as RpcRows<DeptInvoiceSettlement>)
      .order('invoice_id')
      .range(lo, hi),
  )
}

/** Issued invoices of the segment with receipts/CN sums → outstanding.
 *  Sums come from the dept_invoice_settlements RPC (mig 20260820010000);
 *  the invoice rows themselves come through RLS.
 *
 *  Both read in 1000-row pages (2026-10-08) — the RPC is one row per issued
 *  invoice and PostgREST caps a function's rows the same way; an invoice cut
 *  from it would simply vanish from 未收. A failed read still counts as none,
 *  as it always did. */
export async function fetchDeptOutstanding(
  supabase: Db,
  opts: { segment?: string | null } = {},
): Promise<DeptOutstandingInvoice[]> {
  const noneOnError = <T,>(read: Promise<T[]>) => read.then((data) => ({ data }), () => ({ data: null }))
  const [{ data: invRows }, { data: sums }] = await Promise.all([
    // invoice_no is unique: `id` only stands behind it so the pages agree.
    noneOnError(
      fetchAllRows((lo, hi) =>
        supabase
          .from('invoices')
          .select(
            'id, invoice_no, company_id, billable_to_freetext_name, period_month, invoice_date, total_amount, status, billing_mode',
          )
          .eq('status', 'issued')
          .order('invoice_no')
          .order('id')
          .range(lo, hi),
      ),
    ),
    noneOnError(fetchDeptInvoiceSettlements(supabase, opts.segment ? { p_segment: opts.segment } : {})),
  ])
  const sumById = new Map<string, { receipts: number; credits: number }>()
  for (const s of ((sums ?? []) as Array<{ invoice_id: string; receipts: number; credits: number }>)) {
    sumById.set(s.invoice_id, { receipts: Number(s.receipts), credits: Number(s.credits) })
  }
  // The invoice SELECT sees every segment, so keep only ids the
  // (segment-scoped) RPC returned.
  return ((invRows ?? []) as Array<{
    id: string
    invoice_no: string | null
    company_id: string | null
    billable_to_freetext_name: string | null
    period_month: string
    invoice_date: string | null
    total_amount: number
  }>)
    .filter((i) => sumById.has(i.id))
    .map((i) => {
      const s = sumById.get(i.id)!
      return {
        id: i.id,
        invoiceNo: i.invoice_no,
        companyId: i.company_id,
        partyFallback: i.billable_to_freetext_name,
        periodMonth: i.period_month,
        invoiceDate: i.invoice_date,
        totalAmount: Number(i.total_amount),
        receipts: s.receipts,
        credits: s.credits,
        outstanding: r2(Number(i.total_amount) - s.receipts - s.credits),
      }
    })
    .filter((i) => i.outstanding > 0.005)
}
