// Per-voucher PDF export (document layout). Supports:
//   ?id=<uuid>           — single voucher → 1-page PDF
//   ?ids=<id1>,<id2>,... — explicit set → multi-page PDF, 1 page per voucher
//
// Mirrors /billing/invoice-doc but for payment vouchers / official receipts.

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { exportPdfResponse } from '@/lib/export/response'
import { formatPoolLabel } from '@/lib/voucher-detail'
import { VoucherDocPdf, type VoucherDocData } from '../_format/voucher-doc-pdf'
import dayjs from 'dayjs'

export async function GET(req: Request) {
  await requirePermission('treasury')
  const url = new URL(req.url)
  const id = url.searchParams.get('id')?.trim() || null
  const idsParam = url.searchParams.get('ids')?.trim() || null

  if (!id && !idsParam) {
    return Response.json({ error: 'Provide ?id= or ?ids=' }, { status: 400 })
  }

  const supabase = await createClient()

  let q = supabase
    .from('payment_vouchers')
    .select('id, voucher_no, voucher_type, direction, status, amount, payment_date, created_at, payee_name, payee_company_id, bank_account_id, description, notes, payment_reference, target_pool')
  if (id) {
    q = q.eq('id', id)
  } else {
    const ids = (idsParam ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) return Response.json({ error: 'ids must be non-empty' }, { status: 400 })
    q = q.in('id', ids)
  }
  q = q.order('voucher_no', { ascending: true })

  const { data: vouchers } = await q
  if (!vouchers || vouchers.length === 0) {
    return Response.json({ error: 'No matching vouchers' }, { status: 404 })
  }

  const voucherIds = vouchers.map((v) => v.id as string)
  const companyIds = Array.from(new Set(vouchers.map((v) => v.payee_company_id).filter(Boolean))) as string[]
  const bankIds = Array.from(new Set(vouchers.map((v) => v.bank_account_id).filter(Boolean))) as string[]

  const [{ data: srcs }, { data: companies }, { data: banks }] = await Promise.all([
    supabase
      .from('payment_voucher_sources')
      .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
      .in('voucher_id', voucherIds)
      .order('amount', { ascending: false }),
    companyIds.length > 0
      ? supabase.from('companies').select('id, name, short_code').in('id', companyIds)
      : Promise.resolve({ data: [] }),
    bankIds.length > 0
      ? supabase.from('bank_accounts').select('id, bank_name, account_number').in('id', bankIds)
      : Promise.resolve({ data: [] }),
  ])

  const companyMap = new Map((companies ?? []).map((c) => [c.id as string, c]))
  const bankMap = new Map((banks ?? []).map((b) => [b.id as string, b]))
  const sourcesByVoucher = new Map<string, VoucherDocData['sources']>()
  for (const s of (srcs ?? []) as Array<{ voucher_id: string; pool: string; amount: string | number; account_code: string | null; chart_of_accounts: { name: string } | null }>) {
    const arr = sourcesByVoucher.get(s.voucher_id) ?? []
    arr.push({
      pool_label: formatPoolLabel(s.pool) ?? s.pool,
      account_label: s.chart_of_accounts?.name ?? (s.account_code ? s.account_code.replace(/_/g, ' ') : null),
      amount: Number(s.amount),
    })
    sourcesByVoucher.set(s.voucher_id, arr)
  }

  const docs: VoucherDocData[] = vouchers.map((v) => {
    const company = v.payee_company_id ? companyMap.get(v.payee_company_id) : null
    const bank = v.bank_account_id ? bankMap.get(v.bank_account_id) : null
    return {
      id: v.id as string,
      voucher_no: v.voucher_no as string | null,
      voucher_type: v.voucher_type as string,
      direction: (v.direction as string) ?? 'debit',
      status: v.status as string,
      amount: Number(v.amount),
      payment_date: v.payment_date as string | null,
      created_at: v.created_at as string,
      payee_name: (v.payee_name as string) ?? '—',
      payee_sub: company ? `${company.name} (${company.short_code})` : null,
      bank_label: bank ? `${bank.bank_name} — ${bank.account_number ?? ''}`.trim() : null,
      description: v.description as string | null,
      notes: v.notes as string | null,
      payment_reference: v.payment_reference as string | null,
      sources: sourcesByVoucher.get(v.id as string) ?? [],
    }
  })

  const filename = id && docs.length === 1
    ? `voucher-${docs[0].voucher_no ?? docs[0].id.slice(0, 8)}`
    : `vouchers-batch-${dayjs().format('YYYYMMDD')}-${docs.length}`

  return exportPdfResponse({ filename, element: <VoucherDocPdf vouchers={docs} /> })
}
