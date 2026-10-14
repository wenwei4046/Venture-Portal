// Per-credit-note PDF export (CN v2, 2026-08-19). Supports:
//   ?id=<uuid>           — single credit note → 1-page PDF
//   ?ids=<id1>,<id2>,... — explicit set → multi-page PDF, 1 page per CN
// Mirrors ../invoice-doc/route.tsx so the two documents share one pattern —
// since 2026-10-15 the Finance revamp v2's sheet (README §3 · P04): the
// invoice it credits, its period and what it is for, and the invoice's other
// approved credit notes, so the revised amount is the invoice's own.

import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { exportPdfResponse } from '@/lib/export/response'
import { fetchByKeys } from '@/lib/paginate'
import { CreditNoteDocPdf, type CreditNoteDocData } from '../_format/credit-note-doc-pdf'
import { officeTime } from '@/lib/office-time'

export async function GET(req: Request) {
  await requireActionOn('/invoices/[id]', 'billing', 'export')
  const url = new URL(req.url)
  const id = url.searchParams.get('id')?.trim() || null
  const idsParam = url.searchParams.get('ids')?.trim() || null

  if (!id && !idsParam) {
    return Response.json({ error: 'Provide ?id= or ?ids=' }, { status: 400 })
  }

  const supabase = await createClient()

  let cnQuery = supabase
    .from('credit_notes')
    .select('id, credit_note_no, invoice_id, amount, reason, status, category_code, created_at, approved_at')

  if (id) {
    cnQuery = cnQuery.eq('id', id)
  } else if (idsParam) {
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      return Response.json({ error: 'ids must be non-empty' }, { status: 400 })
    }
    cnQuery = cnQuery.in('id', ids)
  }
  cnQuery = cnQuery.order('credit_note_no', { ascending: true })

  const { data: creditNotes } = await cnQuery
  if (!creditNotes || creditNotes.length === 0) {
    return Response.json({ error: 'No matching credit notes' }, { status: 404 })
  }

  const invoiceIds = [...new Set(creditNotes.map((cn) => cn.invoice_id as string))]
  type InvoiceRow = {
    id: string
    invoice_no: string | null
    period_month: string | null
    description: string | null
    total_amount: number | string
    company_id: string | null
    billable_to_type: string | null
    billable_to_department_id: string | null
    billable_to_freetext_name: string | null
  }
  const [invoices, { data: companies }, { data: departments }, { data: coaRows }, approved] = await Promise.all([
    fetchByKeys(invoiceIds, (chunk) =>
      supabase
        .from('invoices')
        .select('id, invoice_no, period_month, description, total_amount, company_id, billable_to_type, billable_to_department_id, billable_to_freetext_name')
        .in('id', chunk),
    ),
    supabase.from('companies').select('id, name, short_code'),
    // Every department: a credit note on the own-share invoice credits Venture (Office), an internal one.
    supabase.from('departments').select('id, name'),
    supabase.from('chart_of_accounts').select('code, name'),
    // Every approved credit note on these invoices: the revised amount takes them all.
    fetchByKeys(invoiceIds, (chunk) => supabase.from('credit_notes').select('id, invoice_id, amount').in('invoice_id', chunk).eq('status', 'approved')),
  ])
  const invoiceById = new Map((invoices as InvoiceRow[]).map((i) => [i.id, i]))
  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, { name: c.name as string, code: c.short_code as string | null }]))
  const departmentMap = new Map<string, string>((departments ?? []).map((d) => [d.id as string, d.name as string]))
  const coaMap = new Map<string, string>((coaRows ?? []).map((c) => [c.code as string, c.name as string]))

  const docs: CreditNoteDocData[] = creditNotes.map((cn) => {
    const inv = invoiceById.get(cn.invoice_id as string)
    let name = inv?.billable_to_freetext_name ?? '—'
    let kind = '—'
    if (inv?.company_id) {
      const c = companyMap.get(inv.company_id)
      name = c?.name ?? '—'
      kind = c?.code ? `Subsidiary · ${c.code}` : 'Subsidiary'
    } else if (inv?.billable_to_type === 'dept_pool' && inv.billable_to_department_id) {
      name = departmentMap.get(inv.billable_to_department_id) ?? '—'
      kind = 'Department pool'
    } else if (inv?.billable_to_type === 'director') {
      kind = 'Director'
    } else if (inv?.billable_to_type === 'freetext') {
      kind = 'External party'
    }
    // The invoice's approved credit notes besides this one.
    const others = (approved as Array<{ id: string; invoice_id: string; amount: number | string }>)
      .filter((c) => c.invoice_id === cn.invoice_id && c.id !== cn.id)
      .reduce((s, c) => s + Number(c.amount), 0)
    const code = (cn.category_code as string | null) ?? null
    return {
      id: cn.id as string,
      credit_note_no: (cn.credit_note_no as string | null) ?? null,
      status: (cn.status as string) ?? 'draft',
      amount: Number(cn.amount),
      reason: (cn.reason as string) ?? '',
      issued_at: ((cn.approved_at as string | null) ?? (cn.created_at as string | null)) || null,
      // Customer-facing: the category's NAME only, never the GL account code.
      category_label: code ? (coaMap.get(code) ?? null) : null,
      credit_to: { name, kind },
      invoice_no: inv?.invoice_no ?? null,
      invoice_period: inv?.period_month ?? null,
      invoice_summary: (inv?.description ?? '').split(/\r?\n/)[0].trim() || null,
      invoice_total: Number(inv?.total_amount ?? 0),
      other_credits: Math.round(others * 100) / 100,
    }
  })

  const filename =
    id && docs.length === 1
      ? `credit-note-${docs[0].credit_note_no ?? docs[0].id.slice(0, 8)}`
      : `credit-notes-batch-${officeTime().format('YYYYMMDD')}-${docs.length}`

  return exportPdfResponse({ filename, element: <CreditNoteDocPdf creditNotes={docs} /> })
}
