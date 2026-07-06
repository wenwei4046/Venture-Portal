import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { formatMoneyBare } from '@/lib/utils'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildXlsxBuffer } from '@/lib/export/excel'
import { PdfDocument, PdfTable } from '@/lib/export/pdf'
import { buildDebtorAging, AGING_BUCKETS, type RawInvoice, type AgingBucket } from '@/lib/debtor-aging'

async function loadAging() {
  const supabase = await createClient()
  const [invoices, companies, departments] = await Promise.all([
    fetchAllRows((lo, hi) =>
      supabase
        .from('invoices')
        .select('invoice_no, invoice_date, due_date, total_amount, company_id, billable_to_department_id, billable_to_freetext_name')
        .eq('status', 'issued')
        .order('id', { ascending: true })
        .range(lo, hi),
    ),
    fetchAllRows((lo, hi) => supabase.from('companies').select('id, name').range(lo, hi)),
    // is_internal=false — exclude the 'Venture Office' pseudo-dept (never a debtor).
    fetchAllRows((lo, hi) => supabase.from('departments').select('id, name').eq('is_internal', false).range(lo, hi)),
  ])
  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]))
  const deptMap = new Map((departments ?? []).map((d) => [d.id as string, d.name as string]))
  const raw: RawInvoice[] = (invoices ?? []).map((i) => ({
    invoiceNo: (i.invoice_no as string | null) ?? '—',
    payer:
      (i.company_id ? companyMap.get(i.company_id as string) : null) ??
      (i.billable_to_department_id ? deptMap.get(i.billable_to_department_id as string) : null) ??
      (i.billable_to_freetext_name as string | null) ??
      '—',
    invoiceDate: (i.invoice_date as string | null) ?? null,
    dueDate: (i.due_date as string | null) ?? null,
    amount: Number(i.total_amount),
  }))
  return buildDebtorAging(raw, dayjs().format('YYYY-MM-DD'))
}

const m = (v: number) => (v ? formatMoneyBare(v) : '—')

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const format = new URL(req.url).searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const aging = await loadAging()
  const asOf = dayjs(aging.asOf).format('D MMM YYYY')
  const filename = `debtor-aging-${dayjs(aging.asOf).format('YYYYMMDD')}`

  if (format === 'xlsx') {
    // Detail sheet — actionable, one row per unpaid invoice, most overdue first.
    const rows = aging.invoices.map((inv) => [
      inv.invoiceNo,
      inv.payer,
      inv.invoiceDate ? dayjs(inv.invoiceDate).format('YYYY-MM-DD') : '',
      inv.dueDate ? dayjs(inv.dueDate).format('YYYY-MM-DD') : '',
      inv.monthsOld,
      AGING_BUCKETS.find((b) => b.key === inv.bucket)?.label ?? '',
      inv.amount,
    ])
    rows.push(['', 'TOTAL', '', '', '', '', aging.totals.total])
    const buffer = buildXlsxBuffer({
      sheetName: 'Debtor Aging',
      headerRow: ['Invoice', 'Customer', 'Invoice date', 'Due date', 'Months old', 'Bucket', 'Amount (RM)'],
      rows,
      columnWidths: [20, 24, 13, 13, 13, 14, 14],
    })
    return exportXlsxResponse({ filename, buffer })
  }

  // PDF — the classic aging matrix by customer.
  const cols = [
    { label: 'Customer', width: 150, align: 'left' as const },
    ...AGING_BUCKETS.map((b) => ({ label: b.label, width: 95, align: 'right' as const })),
    { label: 'Total', width: 105, align: 'right' as const },
  ]
  const rows: (string | number | null)[][] = aging.byPayer.map((p) => [
    p.payer,
    ...AGING_BUCKETS.map((b) => m(p.buckets[b.key as AgingBucket])),
    formatMoneyBare(p.total),
  ])
  rows.push([
    'TOTAL',
    ...AGING_BUCKETS.map((b) => m(aging.totals.buckets[b.key as AgingBucket])),
    formatMoneyBare(aging.totals.total),
  ])

  return exportPdfResponse({
    filename,
    element: (
      <PdfDocument title="Debtor Aging" subtitle="Invoices billed, not yet collected · all amounts RM" periodLabel={`As of ${asOf}`} orientation="landscape">
        <PdfTable columns={cols} rows={rows} />
      </PdfDocument>
    ),
  })
}
