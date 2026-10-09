import dayjs from 'dayjs'
import { officeToday } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { formatMoneyBare } from '@/lib/utils'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildXlsxBuffer } from '@/lib/export/excel'
import { PdfDocument, PdfTable, type PdfRowKind } from '@/lib/export/pdf'
import { debtorAgingView, type RawInvoice } from '@/lib/debtor-aging'
import { reportsCompanyWide } from '@/lib/surfaces'
import { fetchPaidByInvoice } from '@/lib/debtor-aging-data'

// Always generate fresh from live invoice data; never statically cache.
export const dynamic = 'force-dynamic'

async function loadAging(scheme: 'months' | 'days') {
  const supabase = await createClient()
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
    // is_internal=false — exclude the 'Venture Office' pseudo-dept (never a debtor).
    fetchAllRows((lo, hi) => supabase.from('departments').select('id, name').eq('is_internal', false).range(lo, hi)),
  ])
  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]))
  const deptMap = new Map((departments ?? []).map((d) => [d.id as string, d.name as string]))
  // Partial payments: outstanding = total − receipts already recorded.
  const paidByInvoice = await fetchPaidByInvoice(supabase, (invoices ?? []).map((i) => i.id as string))
  const raw: RawInvoice[] = (invoices ?? [])
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
  // Finance's view ages by days since the invoice (2026-10-09); a department
  // manager's by months, as before.
  return debtorAgingView(raw, officeToday(), scheme)
}

const m = (v: number) => (v ? formatMoneyBare(v) : '—')

export async function GET(req: Request) {
  // dept_manager may export their own segment's aging (RLS scopes invoices).
  const user = await requireAction('dept_reports', 'export', 'dept')
  const params = new URL(req.url).searchParams
  const format = params.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  // view: 'detail' (one row per invoice) or 'summary' (aging matrix by customer).
  // Explicit ?view= wins; else keep the historic default (xlsx→detail, pdf→summary).
  const viewParam = params.get('view')
  const view = viewParam === 'summary' ? 'summary' : viewParam === 'detail' ? 'detail' : format === 'pdf' ? 'summary' : 'detail'

  const aging = await loadAging(reportsCompanyWide(user) ? 'days' : 'months')
  const AGING_BUCKETS = aging.columns
  const asOf = dayjs(aging.asOf).format('D MMM YYYY')
  const filename = `debtor-aging-${view}-${dayjs(aging.asOf).format('YYYYMMDD')}`

  // ── Detail: master-detail matrix — per customer, a subtotal row then its
  //    invoices, each invoice's amount dropped into its aging column ──────────
  if (view === 'detail') {
    const bucketKeys = AGING_BUCKETS.map((b) => b.key)
    const invByPayer = new Map<string, typeof aging.invoices>()
    for (const inv of aging.invoices) {
      const arr = invByPayer.get(inv.payer) ?? []
      arr.push(inv)
      invByPayer.set(inv.payer, arr)
    }
    const detailHeader = ['Customer / Invoice', 'Inv date', ...AGING_BUCKETS.map((b) => b.label), 'Total (RM)']

    if (format === 'xlsx') {
      const rows: (string | number)[][] = []
      for (const p of aging.byPayer) {
        rows.push([`${p.payer} (${p.count})`, '', ...bucketKeys.map((k) => p.buckets[k] || ''), p.total])
        for (const inv of invByPayer.get(p.payer) ?? []) {
          rows.push([
            `    ${inv.invoiceNo}${inv.description ? ` — ${inv.description}` : ''}`,
            inv.invoiceDate ? dayjs(inv.invoiceDate).format('YYYY-MM-DD') : '',
            ...bucketKeys.map((k) => (inv.bucket === k ? inv.amount : '')),
            inv.amount,
          ])
        }
      }
      rows.push(['TOTAL', '', ...bucketKeys.map((k) => aging.totals.buckets[k] || ''), aging.totals.total])
      const buffer = buildXlsxBuffer({
        sheetName: 'Debtor Aging (detail)',
        headerRow: detailHeader,
        rows,
        columnWidths: [48, 12, 11, 11, 11, 11, 11, 11, 13],
      })
      return exportXlsxResponse({ filename, buffer })
    }

    const cols = [
      { label: 'Customer / Invoice', width: 200, align: 'left' as const },
      { label: 'Inv date', width: 56, align: 'left' as const },
      ...AGING_BUCKETS.map((b) => ({ label: b.label, width: 58, align: 'right' as const })),
      { label: 'Total', width: 72, align: 'right' as const },
    ]
    const rows: (string | number | null)[][] = []
    const rowKinds: PdfRowKind[] = []
    for (const p of aging.byPayer) {
      rows.push([`${p.payer} (${p.count})`, '', ...bucketKeys.map((k) => m(p.buckets[k])), formatMoneyBare(p.total)])
      rowKinds.push('group')
      for (const inv of invByPayer.get(p.payer) ?? []) {
        rows.push([
          `   ${inv.invoiceNo}${inv.description ? ` — ${inv.description}` : ''}`,
          inv.invoiceDate ? dayjs(inv.invoiceDate).format('YYYY-MM-DD') : '—',
          ...bucketKeys.map((k) => (inv.bucket === k ? formatMoneyBare(inv.amount) : '')),
          formatMoneyBare(inv.amount),
        ])
        rowKinds.push('detail')
      }
    }
    rows.push(['TOTAL', '', ...bucketKeys.map((k) => m(aging.totals.buckets[k])), formatMoneyBare(aging.totals.total)])
    rowKinds.push('total')
    return exportPdfResponse({
      filename,
      element: (
        <PdfDocument title="Debtor Aging — Detail" subtitle="By customer · each invoice in its aging column · all amounts RM" periodLabel={`As of ${asOf}`} orientation="landscape">
          <PdfTable columns={cols} rows={rows} rowKinds={rowKinds} />
        </PdfDocument>
      ),
    })
  }

  // ── Summary: aging matrix by customer ─────────────────────────────────────
  const summaryHeader = ['Customer', ...AGING_BUCKETS.map((b) => b.label), 'Total (RM)']
  if (format === 'xlsx') {
    const rows = aging.byPayer.map((p) => [
      p.payer,
      ...AGING_BUCKETS.map((b) => p.buckets[b.key]),
      p.total,
    ])
    rows.push(['TOTAL', ...AGING_BUCKETS.map((b) => aging.totals.buckets[b.key]), aging.totals.total])
    const buffer = buildXlsxBuffer({
      sheetName: 'Debtor Aging (summary)',
      headerRow: summaryHeader,
      rows,
      columnWidths: [24, 12, 12, 12, 12, 12, 12, 15],
    })
    return exportXlsxResponse({ filename, buffer })
  }
  const cols = [
    { label: 'Customer', width: 130, align: 'left' as const },
    ...AGING_BUCKETS.map((b) => ({ label: b.label, width: 78, align: 'right' as const })),
    { label: 'Total', width: 95, align: 'right' as const },
  ]
  const rows: (string | number | null)[][] = aging.byPayer.map((p) => [
    p.payer,
    ...AGING_BUCKETS.map((b) => m(p.buckets[b.key])),
    formatMoneyBare(p.total),
  ])
  rows.push([
    'TOTAL',
    ...AGING_BUCKETS.map((b) => m(aging.totals.buckets[b.key])),
    formatMoneyBare(aging.totals.total),
  ])
  return exportPdfResponse({
    filename,
    element: (
      <PdfDocument title="Debtor Aging — Summary" subtitle="By customer · Invoices billed, not yet collected · all amounts RM" periodLabel={`As of ${asOf}`} orientation="landscape">
        <PdfTable columns={cols} rows={rows} />
      </PdfDocument>
    ),
  })
}
