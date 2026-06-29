// Per-invoice PDF export (document layout). Supports:
//   ?id=<uuid>           — single invoice → 1-page PDF
//   ?ids=<id1>,<id2>,... — explicit set → multi-page PDF, 1 page per invoice
//   ?period=YYYY-MM      — every invoice in that period → multi-page PDF
//
// Distinct from /statements/export which renders a TABLE of invoices in a
// single page (list view); this route renders a proper invoice document
// (HV letterhead, bill-to block, amount table) per page.

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { exportPdfResponse } from '@/lib/export/response'
import { InvoiceDocPdf, type InvoiceDocData } from '../_format/invoice-doc-pdf'
import dayjs from 'dayjs'

interface InvoiceRow {
  id: string
  invoice_no: string | null
  company_id: string | null
  period_month: string
  billing_mode: string
  total_amount: number
  status: string
  billable_to_type: 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null
  billable_to_department_id: string | null
  billable_to_freetext_name: string | null
  description: string | null
  invoice_date: string | null
  due_date: string | null
  reference_no: string | null
  category_code: string | null
}

function resolveBillTo(
  inv: InvoiceRow,
  companyMap: Map<string, { name: string; code: string }>,
  departmentMap: Map<string, string>,
): { primary: string; sub: string } {
  if (inv.company_id) {
    const c = companyMap.get(inv.company_id)
    return {
      primary: c?.name ?? '—',
      sub: c?.code ? `Subsidiary · ${c.code}` : 'Subsidiary',
    }
  }
  if (inv.billable_to_type === 'dept_pool' && inv.billable_to_department_id) {
    return {
      primary: departmentMap.get(inv.billable_to_department_id) ?? '—',
      sub: 'Department pool',
    }
  }
  const name = inv.billable_to_freetext_name ?? '—'
  const subMap: Record<string, string> = {
    director: 'Director',
    dept_pool: 'Department pool',
    freetext: 'External party',
  }
  return { primary: name, sub: subMap[inv.billable_to_type ?? ''] ?? '—' }
}

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const id = url.searchParams.get('id')?.trim() || null
  const idsParam = url.searchParams.get('ids')?.trim() || null
  const period = url.searchParams.get('period')?.trim() || null

  if (!id && !idsParam && !period) {
    return Response.json({ error: 'Provide ?id= , ?ids= , or ?period=YYYY-MM' }, { status: 400 })
  }
  if (period && !/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: 'invalid period (YYYY-MM)' }, { status: 400 })
  }

  const supabase = await createClient()

  // Fetch invoices for whichever filter was provided.
  let invoicesQuery = supabase
    .from('invoices')
    .select(
      'id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, description, invoice_date, due_date, reference_no, category_code',
    )

  if (id) {
    invoicesQuery = invoicesQuery.eq('id', id)
  } else if (idsParam) {
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      return Response.json({ error: 'ids must be non-empty' }, { status: 400 })
    }
    invoicesQuery = invoicesQuery.in('id', ids)
  } else if (period) {
    invoicesQuery = invoicesQuery.eq('period_month', `${period}-01`)
  }
  invoicesQuery = invoicesQuery.order('invoice_no', { ascending: true })

  const { data: invoices } = await invoicesQuery
  if (!invoices || invoices.length === 0) {
    return Response.json({ error: 'No matching invoices' }, { status: 404 })
  }

  const [{ data: companies }, { data: departments }, { data: coaRows }] = await Promise.all([
    supabase.from('companies').select('id, name, short_code'),
    supabase.from('departments').select('id, name'),
    supabase.from('chart_of_accounts').select('code, name'),
  ])
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id as string, { name: c.name as string, code: c.short_code as string }]),
  )
  const departmentMap = new Map<string, string>(
    (departments ?? []).map((d) => [d.id as string, d.name as string]),
  )
  const coaMap = new Map<string, string>(
    (coaRows ?? []).map((c) => [c.code as string, c.name as string]),
  )

  // Mig 275: fetch line items for these invoices if any.
  const invoiceIds = invoices.map((inv) => inv.id as string)
  const { data: allLines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, line_no, description, amount, category_code')
    .in('invoice_id', invoiceIds)
    .order('line_no')
  const linesByInvoice = new Map<string, Array<{ line_no: number; description: string | null; amount: number; category_code: string | null }>>()
  for (const ln of allLines ?? []) {
    const arr = linesByInvoice.get(ln.invoice_id as string) ?? []
    arr.push({
      line_no: ln.line_no as number,
      description: (ln.description as string | null) ?? null,
      amount: Number(ln.amount),
      category_code: (ln.category_code as string | null) ?? null,
    })
    linesByInvoice.set(ln.invoice_id as string, arr)
  }

  const docs: InvoiceDocData[] = invoices.map((raw) => {
    const inv = raw as InvoiceRow
    const billTo = resolveBillTo(inv, companyMap, departmentMap)
    const lines = linesByInvoice.get(inv.id)
    return {
      id: inv.id,
      invoice_no: inv.invoice_no,
      status: inv.status,
      total_amount: Number(inv.total_amount),
      period_month: inv.period_month,
      billing_mode: inv.billing_mode,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      description: inv.description,
      reference_no: inv.reference_no,
      // Customer-facing: show the category NAME only, never the GL account code.
      category_label: inv.category_code ? (coaMap.get(inv.category_code) || null) : null,
      bill_to_primary: billTo.primary,
      bill_to_sub: billTo.sub,
      lines: lines && lines.length > 0
        ? lines.map((ln) => ({
            line_no: ln.line_no,
            description: ln.description,
            amount: ln.amount,
            category_label: ln.category_code
              ? `${ln.category_code} · ${coaMap.get(ln.category_code) ?? ''}`.trim()
              : null,
          }))
        : undefined,
    }
  })

  // Filename: single invoice → use its number; batch → period or count.
  let filename: string
  if (id && docs.length === 1) {
    filename = `invoice-${docs[0].invoice_no ?? docs[0].id.slice(0, 8)}`
  } else if (period) {
    filename = `invoices-${period.replace('-', '')}-batch`
  } else {
    filename = `invoices-batch-${dayjs().format('YYYYMMDD')}-${docs.length}`
  }

  return exportPdfResponse({ filename, element: <InvoiceDocPdf invoices={docs} /> })
}
