import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { buildVouchersXlsx } from './_format/xlsx'
import { VouchersPdf } from './_format/pdf'
import dayjs from 'dayjs'
import type { Database } from '@/lib/supabase/database.types'

type PaymentVoucher = Database['public']['Tables']['payment_vouchers']['Row']

interface VoucherExportRow {
  voucher_no: string | null
  date: string
  direction: 'credit' | 'debit'
  type: string
  status: string
  payee_name: string
  amount: number
  catLabel: string
  poolLabel: string
}

const POOL_LABELS: Record<string, string> = {
  venture_pool: 'Venture Pool',
  dept_pool_director: 'Director Pool',
  dept_pool_marketing: 'Marketing',
  dept_pool_finance: 'Finance',
  dept_pool_hr: 'HR',
  invoice_payout_pool: 'Invoice Payout',
}

export async function GET(req: Request) {
  await requireRole(['principal', 'finance'])
  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const supabase = await createClient()

  // Read query params matching the page's filters
  const statusFilter = url.searchParams.get('status') ?? undefined
  const qFilter = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const typeFilter = url.searchParams.get('type') ?? ''
  const poolFilter = url.searchParams.get('pool') ?? ''
  const fromFilter = url.searchParams.get('from') ?? ''
  const toFilter = url.searchParams.get('to') ?? ''
  const minFilter = url.searchParams.get('min') ? parseFloat(url.searchParams.get('min')!) : null
  const maxFilter = url.searchParams.get('max') ? parseFloat(url.searchParams.get('max')!) : null
  // Side split (2026-06-12): /payments exports debit (PV), /receipts credit (OR).
  const rawDirection = url.searchParams.get('direction') ?? ''
  const directionFilter = rawDirection === 'debit' || rawDirection === 'credit' ? rawDirection : null

  // Fetch vouchers (same query as page)
  let voucherQuery = supabase
    .from('payment_vouchers')
    .select('*')
    .order('created_at', { ascending: false })
  if (directionFilter) voucherQuery = voucherQuery.eq('direction', directionFilter)
  const { data: vouchers } = await voucherQuery

  // Post-mig 238: PVS rows reference chart_of_accounts via account_code
  // Load once, index by voucher_id, then derive pool list + account name list
  const sourcesByVoucher = new Map<string, string[]>()
  const categoriesByVoucher = new Map<string, string[]>()
  {
    const { data: srcs } = await supabase
      .from('payment_voucher_sources')
      .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
      .order('amount', { ascending: false })

    for (const s of (srcs ?? []) as Array<{
      voucher_id: string
      pool: string
      account_code: string | null
      chart_of_accounts: { name: string } | null
    }>) {
      const pools = sourcesByVoucher.get(s.voucher_id) ?? []
      pools.push(s.pool)
      sourcesByVoucher.set(s.voucher_id, pools)

      const label =
        s.chart_of_accounts?.name ??
        (s.account_code ? s.account_code.replace(/_/g, ' ') : null)
      if (label) {
        const cats = categoriesByVoucher.get(s.voucher_id) ?? []
        if (!cats.includes(label)) cats.push(label)
        categoriesByVoucher.set(s.voucher_id, cats)
      }
    }
  }

  const all = vouchers ?? []
  const tab = statusFilter ?? 'all'

  // Apply all filters in-memory (same logic as page)
  const filtered = all.filter((v) => {
    if (tab !== 'all' && v.status !== tab) return false
    if (typeFilter && v.voucher_type !== typeFilter) return false
    if (poolFilter) {
      if (v.direction === 'credit') {
        if (v.target_pool !== poolFilter) return false
      } else {
        const poolList = sourcesByVoucher.get(v.id)
        if (!poolList || !poolList.includes(poolFilter)) return false
      }
    }
    if (fromFilter && dayjs(v.created_at).isBefore(dayjs(fromFilter), 'day')) return false
    if (toFilter && dayjs(v.created_at).isAfter(dayjs(toFilter), 'day')) return false
    if (minFilter !== null && Number(v.amount) < minFilter) return false
    if (maxFilter !== null && Number(v.amount) > maxFilter) return false
    if (qFilter) {
      const hay = `${v.voucher_no ?? ''} ${v.payee_name ?? ''}`.toLowerCase()
      if (!hay.includes(qFilter)) return false
    }
    return true
  })

  // Transform to export format
  const rows: VoucherExportRow[] = filtered.map((v) => {
    const cats = categoriesByVoucher.get(v.id) ?? []
    const catLabel = cats.length > 0 ? cats.join(' + ') : '—'

    let poolLabel = '—'
    if (v.direction === 'credit') {
      poolLabel = v.target_pool
        ? (POOL_LABELS[v.target_pool] ?? v.target_pool.replace(/_/g, ' '))
        : '—'
    } else {
      const pools = sourcesByVoucher.get(v.id) ?? []
      if (pools.length > 0) {
        poolLabel = pools.map((p) => POOL_LABELS[p] ?? p.replace(/_/g, ' ')).join(' + ')
      } else if (v.source_pool) {
        poolLabel = POOL_LABELS[v.source_pool] ?? v.source_pool.replace(/_/g, ' ')
      }
    }

    return {
      voucher_no: v.voucher_no,
      date: dayjs(v.payment_date ?? v.created_at).format('DD/MM/YYYY'),
      direction: v.direction as 'credit' | 'debit',
      type: v.voucher_type,
      status: v.status,
      payee_name: v.payee_name,
      amount: Number(v.amount),
      catLabel,
      poolLabel,
    }
  })

  const filename = `payment-vouchers-${dayjs().format('YYYYMMDD')}`

  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildVouchersXlsx(rows) })
  }
  return exportPdfResponse({ filename, element: React.createElement(VouchersPdf, { rows }) })
}
