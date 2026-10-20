// Per-invoice PDF export (document layout). Supports:
//   ?id=<uuid>           — single invoice → 1-page PDF
//   ?ids=<id1>,<id2>,... — explicit set → multi-page PDF, 1 page per invoice
//   ?period=YYYY-MM      — every invoice in that period → multi-page PDF
//
// Distinct from /statements/export which renders a TABLE of invoices in a
// single page (list view); this route renders a proper invoice document per
// page — the Finance revamp v2's sheet (2026-10-15, README §3 · P01). What it
// still asks for is worked out as Invoice's hub works it out (`toHubInvoice`):
// the receipts against it, a consolidated receipt's part, its approved credit
// notes.

import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { exportPdfResponse } from '@/lib/export/response'
import { fetchByKeys } from '@/lib/paginate'
import { billingModeLabel } from '@/lib/invoice-labels'
import { extraBillingModeOptions, primedRegistryRows } from '@/lib/dept-registry'
import { toHubInvoice, type HubCreditNoteLine, type InvoiceRowIn } from '@/app/(portal)/statements/_lib/invoice-model'
import { InvoiceDocPdf, type InvoiceDocData, type InvoiceLineData } from '../_format/invoice-doc-pdf'
import { officeTime } from '@/lib/office-time'
import { EMPTY_ADDRESS, addressFromParts, addressLines } from '@/lib/address/address'

const COLUMNS =
  'id, invoice_no, company_id, period_month, billing_mode, total_amount, status, billable_to_type, billable_to_department_id, billable_to_freetext_name, billable_to_freetext_address, billable_to_freetext_address_parts, billable_to_freetext_phone, billable_to_freetext_email, description, invoice_date, due_date, reference_no, category_code, settlement_voucher_id'

// The billing mode as the invoice has always printed it (the design's *Venture (HV) OPEX*).
const MODE_ON_INVOICE: Record<string, string> = {
  marketing_project: 'Marketing project',
  director_office_attribution: 'Director Office OPEX',
  director_attribution: 'Director OPEX',
  hr_attribution: 'HR OPEX',
  finance_attribution: 'Finance OPEX',
  venture_attribution: 'Venture (HV) OPEX',
  non_billable: 'Non-billable',
  payroll_consolidated: 'Payroll (consolidated)',
}

/** Who it bills, as the sheet's *Bill to* says it: the name, then its kind. */
function billTo(
  inv: InvoiceRowIn,
  companies: Map<string, { name: string; code: string | null }>,
  departments: Map<string, string>,
): InvoiceDocData['bill_to'] {
  if (inv.company_id) {
    const c = companies.get(inv.company_id)
    return { name: c?.name ?? '—', kind: c?.code ? `Subsidiary · ${c.code}` : 'Subsidiary', contact: [] }
  }
  if (inv.billable_to_type === 'dept_pool' && inv.billable_to_department_id) {
    return { name: departments.get(inv.billable_to_department_id) ?? '—', kind: 'Department pool', contact: [] }
  }
  const kind: Record<string, string> = { director: 'Director', dept_pool: 'Department pool', freetext: 'External party' }
  // An address in its six parts prints as its lines (2026-10-20); one billed before them, as it was typed.
  const lines = addressLines(addressFromParts(inv.billable_to_freetext_address_parts) ?? EMPTY_ADDRESS)
  const address = lines.length ? lines : [inv.billable_to_freetext_address]
  const contact =
    inv.billable_to_type === 'freetext'
      ? [...address, inv.billable_to_freetext_phone, inv.billable_to_freetext_email].filter((x): x is string => !!x?.trim())
      : []
  return { name: inv.billable_to_freetext_name ?? '—', kind: kind[inv.billable_to_type ?? ''] ?? '—', contact }
}

export async function GET(req: Request) {
  await requireActionOn('/invoices/[id]', 'billing', 'export')
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
  let invoicesQuery = supabase.from('invoices').select(COLUMNS)
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

  const { data: found } = await invoicesQuery
  if (!found || found.length === 0) {
    return Response.json({ error: 'No matching invoices' }, { status: 404 })
  }
  const invoices = found as unknown as InvoiceRowIn[]
  const invoiceIds = invoices.map((inv) => inv.id)
  const settlementIds = [...new Set(invoices.map((inv) => inv.settlement_voucher_id).filter((v): v is string => !!v))]

  const [{ data: companies }, { data: departments }, lineRows, receiptRows, settlementRows, cnRows] = await Promise.all([
    supabase.from('companies').select('id, name, short_code'),
    // Every department: the own-share invoice bills Venture (Office), an internal one.
    supabase.from('departments').select('id, name'),
    fetchByKeys(invoiceIds, (chunk) =>
      supabase.from('invoice_lines').select('invoice_id, line_no, description, amount, category_code, segment').in('invoice_id', chunk).order('line_no'),
    ),
    // Receipts made against each (a part payment, a single settle).
    fetchByKeys(invoiceIds, (chunk) =>
      supabase
        .from('payment_vouchers')
        .select('invoice_id, voucher_no, payment_date, amount')
        .in('invoice_id', chunk)
        .eq('direction', 'credit')
        .neq('status', 'voided')
        .order('payment_date'),
    ),
    // The consolidated receipt a paid one points at.
    fetchByKeys(settlementIds, (chunk) => supabase.from('payment_vouchers').select('id, voucher_no, payment_date, amount').in('id', chunk)),
    fetchByKeys(invoiceIds, (chunk) => supabase.from('credit_notes').select('id, invoice_id, credit_note_no, amount, reason, status').in('invoice_id', chunk)),
  ])

  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, { name: c.name as string, code: (c.short_code as string | null) ?? null }]))
  const departmentMap = new Map<string, string>((departments ?? []).map((d) => [d.id as string, d.name as string]))
  const extraModes = extraBillingModeOptions(primedRegistryRows())

  const group = <T, K extends string>(rows: T[], key: (r: T) => K) => {
    const out = new Map<K, T[]>()
    for (const r of rows) {
      const k = key(r)
      out.set(k, [...(out.get(k) ?? []), r])
    }
    return out
  }
  type LineRow = { invoice_id: string; description: string | null; amount: number | string; category_code: string | null; segment: string | null }
  type ReceiptRow = { invoice_id: string; voucher_no: string | null; payment_date: string | null; amount: number | string }
  type CnRow = { id: string; invoice_id: string; credit_note_no: string | null; amount: number | string; reason: string | null; status: string }
  const linesBy = group(lineRows as LineRow[], (l) => l.invoice_id)
  const receiptsBy = group(receiptRows as ReceiptRow[], (r) => r.invoice_id)
  const cnsBy = group(cnRows as CnRow[], (c) => c.invoice_id)
  const settlements = new Map(
    (settlementRows as Array<{ id: string; voucher_no: string | null; payment_date: string | null; amount: number | string }>).map((v) => [
      v.id,
      { voucher_no: v.voucher_no, payment_date: v.payment_date, amount: Number(v.amount) },
    ]),
  )

  const docs: InvoiceDocData[] = invoices.map((inv) => {
    const lines = linesBy.get(inv.id) ?? []
    const h = toHubInvoice(inv, {
      companies: companyMap,
      departments: departmentMap,
      accounts: new Map(),
      extraModes,
      lines: new Map([[inv.id, lines.map((l) => ({ description: l.description, amount: Number(l.amount), category_code: l.category_code }))]]),
      receipts: new Map([[inv.id, (receiptsBy.get(inv.id) ?? []).map((r) => ({ voucher_no: r.voucher_no, payment_date: r.payment_date, amount: Number(r.amount) }))]]),
      settlements,
      creditNotes: new Map([
        [inv.id, (cnsBy.get(inv.id) ?? []).map((c): HubCreditNoteLine => ({ id: c.id, no: c.credit_note_no, amount: Number(c.amount), status: c.status, reason: c.reason }))],
      ]),
    })
    const paidOn = h.receipts.reduce<string | null>((last, r) => (r.date && (!last || r.date > last) ? r.date : last), null)
    return {
      id: inv.id,
      invoice_no: inv.invoice_no,
      status: inv.status,
      period_month: inv.period_month,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      reference_no: inv.reference_no,
      description: inv.description,
      billing_mode_label: MODE_ON_INVOICE[inv.billing_mode] ?? billingModeLabel(inv.billing_mode, extraModes),
      bill_to: billTo(inv, companyMap, departmentMap),
      lines: lines.map((l): InvoiceLineData => ({ description: l.description, amount: Number(l.amount), segment: l.segment })),
      total: h.total,
      credited: h.credited,
      received: h.received,
      remaining: h.remaining,
      paid_on: paidOn,
    }
  })

  // Filename: single invoice → use its number; batch → period or count.
  let filename: string
  if (id && docs.length === 1) {
    filename = `invoice-${docs[0].invoice_no ?? docs[0].id.slice(0, 8)}`
  } else if (period) {
    filename = `invoices-${period.replace('-', '')}-batch`
  } else {
    filename = `invoices-batch-${officeTime().format('YYYYMMDD')}-${docs.length}`
  }

  return exportPdfResponse({ filename, element: <InvoiceDocPdf invoices={docs} /> })
}
