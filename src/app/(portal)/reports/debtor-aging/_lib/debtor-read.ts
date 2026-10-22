import type { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/paginate'
import type { RawInvoice } from '@/lib/debtor-aging'
import { fetchPaidByInvoice } from '@/lib/debtor-aging-data'

// Debtor Aging's read (2026-10-15 — moved out of `/reports/debtor-aging/page.tsx`
// word for word, so the Finance phone app's Debtor aging reads the same): every
// issued invoice, its payer by name, what is still unpaid on it — a part-paid
// one at its remainder, its part payment said in its description — and none
// that is settled.

type Client = Awaited<ReturnType<typeof createClient>>

export async function readDebtorInvoices(supabase: Client): Promise<RawInvoice[]> {
  const [invoices, companies, departments] = await Promise.all([
    fetchAllRows((lo, hi) =>
      supabase
        .from('invoices')
        .select('id, invoice_no, invoice_date, due_date, total_amount, description, company_id, billable_to_department_id, billable_to_freetext_name')
        .eq('status', 'issued')
        .order('id', { ascending: true })
        .range(lo, hi),
    ),
    fetchAllRows((lo, hi) => supabase.from('companies').select('id, name').range(lo, hi)),
    // is_internal=false — exclude the 'Venture Office' pseudo-dept from the
    // id→name resolver (never a debtor).
    fetchAllRows((lo, hi) => supabase.from('departments').select('id, name').eq('is_internal', false).range(lo, hi)),
  ])

  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]))
  const deptMap = new Map((departments ?? []).map((d) => [d.id as string, d.name as string]))

  // Partial payments: outstanding = total − receipts already recorded.
  const paidByInvoice = await fetchPaidByInvoice(supabase, (invoices ?? []).map((i) => i.id as string))

  return (invoices ?? [])
    .map((i) => {
      const paid = paidByInvoice.get(i.id as string) ?? 0
      const remaining = Math.round((Number(i.total_amount) - paid) * 100) / 100
      const desc = (i.description as string | null) ?? null
      return {
        id: i.id as string,
        invoiceNo: (i.invoice_no as string | null) ?? '—',
        payer:
          (i.company_id ? companyMap.get(i.company_id as string) : null) ??
          (i.billable_to_department_id ? deptMap.get(i.billable_to_department_id as string) : null) ??
          (i.billable_to_freetext_name as string | null) ??
          '—',
        invoiceDate: (i.invoice_date as string | null) ?? null,
        dueDate: (i.due_date as string | null) ?? null,
        amount: remaining,
        description: paid > 0 ? `${desc ? `${desc} · ` : ''}part-paid RM ${paid.toFixed(2)}` : desc,
      }
    })
    .filter((i) => i.amount > 0.005)
}
