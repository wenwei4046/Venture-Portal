// Per-credit-note PDF export (CN v2, 2026-08-19). Supports:
//   ?id=<uuid>           — single credit note → 1-page PDF
//   ?ids=<id1>,<id2>,... — explicit set → multi-page PDF, 1 page per CN
// Mirrors ../invoice-doc/route.tsx so the two documents share one pattern.

import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { exportPdfResponse } from '@/lib/export/response'
import { CreditNoteDocPdf, type CreditNoteDocData } from '../_format/credit-note-doc-pdf'
import { officeTime } from '@/lib/office-time'

export async function GET(req: Request) {
  await requireAction('billing', 'export')
  const url = new URL(req.url)
  const id = url.searchParams.get('id')?.trim() || null
  const idsParam = url.searchParams.get('ids')?.trim() || null

  if (!id && !idsParam) {
    return Response.json({ error: 'Provide ?id= or ?ids=' }, { status: 400 })
  }

  const supabase = await createClient()

  let cnQuery = supabase
    .from('credit_notes')
    .select('id, credit_note_no, invoice_id, amount, reason, status, category_code, created_at')

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
  const [{ data: invoices }, { data: companies }, { data: departments }, { data: coaRows }] =
    await Promise.all([
      supabase
        .from('invoices')
        .select(
          'id, invoice_no, invoice_date, total_amount, company_id, billable_to_type, billable_to_department_id, billable_to_freetext_name',
        )
        .in('id', invoiceIds),
      supabase.from('companies').select('id, name, short_code'),
      supabase.from('departments').select('id, name').eq('is_internal', false),
      supabase.from('chart_of_accounts').select('code, name'),
    ])
  const invoiceById = new Map((invoices ?? []).map((i) => [i.id as string, i]))
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id as string, { name: c.name as string, code: c.short_code as string }]),
  )
  const departmentMap = new Map<string, string>(
    (departments ?? []).map((d) => [d.id as string, d.name as string]),
  )
  const coaMap = new Map<string, string>((coaRows ?? []).map((c) => [c.code as string, c.name as string]))

  // Receipts + approved CNs already against each parent invoice, so the
  // balance box can show what remains payable after each credit note.
  const [{ data: receiptRows }, { data: allCnRows }] = await Promise.all([
    supabase
      .from('payment_vouchers')
      .select('invoice_id, amount')
      .in('invoice_id', invoiceIds)
      .eq('direction', 'credit')
      .neq('status', 'voided'),
    supabase
      .from('credit_notes')
      .select('id, invoice_id, amount')
      .in('invoice_id', invoiceIds)
      .eq('status', 'approved'),
  ])
  const receivedById = new Map<string, number>()
  for (const r of receiptRows ?? []) {
    if (!r.invoice_id) continue
    receivedById.set(r.invoice_id, (receivedById.get(r.invoice_id) ?? 0) + Number(r.amount))
  }
  const approvedCnById = new Map<string, Array<{ id: string; amount: number }>>()
  for (const r of allCnRows ?? []) {
    const arr = approvedCnById.get(r.invoice_id as string) ?? []
    arr.push({ id: r.id as string, amount: Number(r.amount) })
    approvedCnById.set(r.invoice_id as string, arr)
  }

  const docs: CreditNoteDocData[] = creditNotes.map((cn) => {
    const inv = invoiceById.get(cn.invoice_id as string)
    let primary = inv?.billable_to_freetext_name ?? '—'
    let sub = '—'
    if (inv?.company_id) {
      const c = companyMap.get(inv.company_id)
      primary = c?.name ?? '—'
      sub = c?.code ? `Subsidiary · ${c.code}` : 'Subsidiary'
    } else if (inv?.billable_to_type === 'dept_pool' && inv.billable_to_department_id) {
      primary = departmentMap.get(inv.billable_to_department_id) ?? '—'
      sub = 'Department pool'
    } else if (inv?.billable_to_type === 'director') {
      sub = 'Director'
    } else if (inv?.billable_to_type === 'freetext') {
      sub = 'External party'
    }
    // Everything already settled against the invoice EXCLUDING this CN itself
    // (an approved CN would otherwise subtract twice in the balance box).
    const otherApprovedCn = (approvedCnById.get(cn.invoice_id as string) ?? [])
      .filter((c) => c.id !== cn.id)
      .reduce((s, c) => s + c.amount, 0)
    const otherSettled =
      Math.round(((receivedById.get(cn.invoice_id as string) ?? 0) + otherApprovedCn) * 100) / 100
    return {
      id: cn.id as string,
      credit_note_no: (cn.credit_note_no as string | null) ?? null,
      status: (cn.status as string) ?? 'draft',
      amount: Number(cn.amount),
      reason: (cn.reason as string) ?? '',
      created_at: (cn.created_at as string | null) ?? null,
      category_label: cn.category_code ? (coaMap.get(cn.category_code as string) || null) : null,
      credit_to_primary: primary,
      credit_to_sub: sub,
      invoice_no: (inv?.invoice_no as string | null) ?? null,
      invoice_date: (inv?.invoice_date as string | null) ?? null,
      invoice_total: Number(inv?.total_amount ?? 0),
      other_settled: otherSettled,
    }
  })

  const filename =
    id && docs.length === 1
      ? `credit-note-${docs[0].credit_note_no ?? docs[0].id.slice(0, 8)}`
      : `credit-notes-batch-${officeTime().format('YYYYMMDD')}-${docs.length}`

  return exportPdfResponse({ filename, element: <CreditNoteDocPdf creditNotes={docs} /> })
}
