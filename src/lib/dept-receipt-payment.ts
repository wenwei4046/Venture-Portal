// Dept-scoped Receipt & Payment data (2026-08-20, marketing user features).
// 实收/花出去 both come from the GL: a department's cash movements are the
// bank-account lines inside its segment-tagged JEs (settle receipts post
// Dr Bank / Cr 3030 per segment; payments post Cr Bank per paying segment).
// dept_manager reads these through RLS (own segment only); finance/principal
// pass an explicit segment. Bank accounts are recognised by COA name
// ('Cash & Bank%') because bank_accounts itself is not dept_manager-readable.

import dayjs from 'dayjs'
import { fetchAllRows } from '@/lib/paginate'

// Matches the supabase server/client shape loosely — same trick the other
// dept libs use so both server components and route handlers can call in.
type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export interface DeptCashLine {
  date: string
  entryNo: string | null
  description: string
  /** Positive = money into the dept's bank side; from the bank line's Dr. */
  inAmount: number
  /** Positive = money out; from the bank line's Cr. */
  outAmount: number
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

/** COA codes whose name marks them as bank/cash accounts. */
export async function fetchBankGlCodes(supabase: Db): Promise<string[]> {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('code, name')
    .ilike('name', 'Cash & Bank%')
  return ((data ?? []) as Array<{ code: string }>).map((c) => c.code)
}

/** Bank-account GL lines inside segment JEs between from/to (inclusive).
 *  Pass segment for finance/principal; dept_manager may pass their own (RLS
 *  would blank any other) or null to rely on RLS alone. */
export async function fetchDeptCashLines(
  supabase: Db,
  opts: { from: string; to: string; segment?: string | null },
): Promise<DeptCashLine[]> {
  const bankCodes = await fetchBankGlCodes(supabase)
  if (bankCodes.length === 0) return []

  const rows = (await fetchAllRows((lo, hi) => {
    let q = supabase
      .from('journal_lines')
      .select(
        'account_code, debit, credit, journal_entries!inner(entry_no, transaction_date, segment, is_reversed, description)',
      )
      .in('account_code', bankCodes)
      .gte('journal_entries.transaction_date', opts.from)
      .lte('journal_entries.transaction_date', opts.to)
      .eq('journal_entries.is_reversed', false)
    if (opts.segment) q = q.eq('journal_entries.segment', opts.segment)
    return q.order('id').range(lo, hi)
  })) as Array<{
    account_code: string
    debit: number | null
    credit: number | null
    journal_entries: {
      entry_no: string | null
      transaction_date: string
      segment: string | null
      is_reversed: boolean
      description: string | null
    } | null
  }>

  return rows
    .map((l) => ({
      date: l.journal_entries?.transaction_date ?? '',
      entryNo: l.journal_entries?.entry_no ?? null,
      description: l.journal_entries?.description ?? '',
      inAmount: r2(Number(l.debit ?? 0)),
      outAmount: r2(Number(l.credit ?? 0)),
    }))
    .filter((l) => l.inAmount > 0 || l.outAmount > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.entryNo ?? '').localeCompare(b.entryNo ?? ''))
}

/** Issued invoices of the segment with receipts/CN sums → outstanding.
 *  Sums come from the dept_invoice_settlements RPC (mig 20260820010000);
 *  the invoice rows themselves come through RLS. */
export async function fetchDeptOutstanding(
  supabase: Db,
  opts: { segment?: string | null } = {},
): Promise<DeptOutstandingInvoice[]> {
  const [{ data: invRows }, { data: sums }] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'id, invoice_no, company_id, billable_to_freetext_name, period_month, invoice_date, total_amount, status, billing_mode',
      )
      .eq('status', 'issued')
      .order('invoice_no'),
    supabase.rpc('dept_invoice_settlements', opts.segment ? { p_segment: opts.segment } : {}),
  ])
  const sumById = new Map<string, { receipts: number; credits: number }>()
  for (const s of ((sums ?? []) as Array<{ invoice_id: string; receipts: number; credits: number }>)) {
    sumById.set(s.invoice_id, { receipts: Number(s.receipts), credits: Number(s.credits) })
  }
  // Finance/principal view: their invoice SELECT sees every segment, so keep
  // only ids the (segment-scoped) RPC returned. dept_manager RLS already
  // matches the RPC's scope.
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

export function monthRange(period: string): { from: string; to: string } {
  const start = dayjs(`${period}-01`)
  return { from: start.format('YYYY-MM-DD'), to: start.endOf('month').format('YYYY-MM-DD') }
}
