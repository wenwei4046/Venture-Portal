import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { listsPayrollByPerson } from '@/lib/roles'
import { filterLockedBatches, isPayrollReference, lockPayrollBatches, type LockedBatch } from '@/lib/payroll-vouchers'
import { fetchAllRows, fetchAllRowsAsWritten } from '@/lib/paginate'
import { exportXlsxResponse, exportPdfResponse } from '@/lib/export/response'
import { fetchReceiptExtras, filterReceiptExtras } from '@/lib/receipt-extras'
import { fetchPaymentExtras } from '@/lib/payment-extras'
import { buildVouchersXlsx } from './_format/xlsx'
import { VouchersPdf } from './_format/pdf'
import dayjs from 'dayjs'
import { officeDay, officeTime } from '@/lib/office-time'
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
  const user = await requireActionOn('/payments', 'treasury', 'export')
  // Payroll person by person, or by department as the page lists it (2026-10-13).
  const byPerson = listsPayrollByPerson(user)
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
  const vouchers = await fetchAllRows((lo, hi) => {
    let voucherQuery = supabase.from('payment_vouchers').select('*').order('created_at', { ascending: false }).order('id', { ascending: true })
    if (directionFilter) voucherQuery = voucherQuery.eq('direction', directionFilter)
    return voucherQuery.range(lo, hi)
  })

  // Post-mig 238: PVS rows reference chart_of_accounts via account_code
  // Load once, index by voucher_id, then derive pool list + account name list
  const sourcesByVoucher = new Map<string, string[]>()
  const categoriesByVoucher = new Map<string, string[]>()
  {
    // Every source row, as the page reads them (VoucherLedger, 2026-10-08):
    // as written while under PostgREST's 1000-row cap, paged once it is not.
    const srcs = await fetchAllRowsAsWritten((page) => {
      const q = supabase
        .from('payment_voucher_sources')
        .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
        .order('amount', { ascending: false })
      return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
    }).catch(() => null)

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
  const filters = { tab, typeFilter, poolFilter, fromFilter, toFilter, minFilter, maxFilter, qFilter }
  // The Payroll batches tab: the salary vouchers only, as on the page.
  const payrollTab = tab === 'payroll'

  // Without Payroll payouts — or on the Finance view — the file carries payroll
  // the way the page shows it: each batch department by department, none of
  // its vouchers, and only from the Payroll batches tab (2026-10-14) — never
  // in All or a status tab (lib/payroll-vouchers.ts).
  const open = byPerson ? all : all.filter((v) => !isPayrollReference(v.reference_type))
  let lockedBatches: LockedBatch[] = []
  if (!byPerson && payrollTab) {
    const { data: depts } = await supabase.from('departments').select('name')
    const allLocked = lockPayrollBatches(
      all.filter((v) => isPayrollReference(v.reference_type)),
      new Set(((depts ?? []) as Array<{ name: string }>).map((d) => d.name)),
    )
    lockedBatches = filterLockedBatches(allLocked, { ...filters, tab: 'all' })
  }

  // Apply all filters in-memory (same logic as page)
  const filtered = open.filter((v) => {
    if (payrollTab) {
      if (v.reference_type !== 'payroll_disbursement') return false
    } else if (tab !== 'all' && v.status !== tab) return false
    if (typeFilter && v.voucher_type !== typeFilter) return false
    if (poolFilter) {
      if (v.direction === 'credit') {
        if (v.target_pool !== poolFilter) return false
      } else {
        const poolList = sourcesByVoucher.get(v.id)
        if (!poolList || !poolList.includes(poolFilter)) return false
      }
    }
    // The day it was made in the office — on the server's clock (UTC) a voucher
    // made before 08:00 fell on the day before and slipped out of the range.
    const madeOn = dayjs(officeTime(v.created_at).format('YYYY-MM-DD'))
    if (fromFilter && madeOn.isBefore(dayjs(fromFilter), 'day')) return false
    if (toFilter && madeOn.isAfter(dayjs(toFilter), 'day')) return false
    if (minFilter !== null && Number(v.amount) < minFilter) return false
    if (maxFilter !== null && Number(v.amount) > maxFilter) return false
    if (qFilter) {
      const hay = `${v.voucher_no ?? ''} ${v.payee_name ?? ''}`.toLowerCase()
      if (!hay.includes(qFilter)) return false
    }
    return true
  })

  // Transform to export format. Kept alongside a raw sort date so synthetic
  // receipt rows (below) can interleave chronologically before formatting.
  const dated: Array<{ raw: string; row: VoucherExportRow }> = filtered.map((v) => {
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

    const raw = (v.payment_date ?? v.created_at) as string
    return {
      raw,
      row: {
        voucher_no: v.voucher_no,
        date: officeDay(raw).format('DD/MM/YYYY'),
        direction: v.direction as 'credit' | 'debit',
        type: v.voucher_type,
        status: v.status,
        payee_name: v.payee_name,
        amount: Number(v.amount),
        catLabel,
        poolLabel,
      },
    }
  })

  for (const b of lockedBatches) {
    for (const d of b.departments) {
      dated.push({
        raw: d.latest,
        row: {
          voucher_no: null,
          date: officeDay(d.latest).format('DD/MM/YYYY'),
          direction: 'debit',
          type: 'payroll',
          status: d.statusText,
          payee_name: `${b.label} · ${d.department} (${d.count} voucher${d.count === 1 ? '' : 's'}, department total)`,
          amount: d.total,
          catLabel: 'Payroll',
          poolLabel: '—',
        },
      })
    }
  }
  if (lockedBatches.length > 0) dated.sort((a, b) => new Date(b.raw).getTime() - new Date(a.raw).getTime())

  // Exports mirror their pages: outside-the-voucher-flow rows ride along,
  // deduped and filtered by the same rules. Receipts: direct loan repayments +
  // Fund IN capital. Payments: direct fund-source repayments + Loan OUT
  // disbursements (user 2026-08-06: "不能像reciept 这样显示全部吗？").
  if (directionFilter === 'credit' || directionFilter === 'debit') {
    const isCredit = directionFilter === 'credit'
    const extras = filterReceiptExtras(
      isCredit ? await fetchReceiptExtras(supabase) : await fetchPaymentExtras(supabase),
      filters,
    )
    for (const r of extras) {
      dated.push({
        raw: r.paymentOrCreatedDate,
        row: {
          voucher_no: null,
          date: dayjs(r.paymentOrCreatedDate).format('DD/MM/YYYY'),
          direction: directionFilter,
          type: isCredit
            ? r.id.startsWith('rpy-') ? 'loan repayment' : 'fund in'
            : r.id.startsWith('fsr-') ? 'loan repayment' : 'loan out',
          status: isCredit ? 'received' : 'paid',
          payee_name: r.payee_name,
          amount: r.amount,
          catLabel: r.catLabel,
          poolLabel: r.poolLabel,
        },
      })
    }
    dated.sort((a, b) => new Date(b.raw).getTime() - new Date(a.raw).getTime())
  }

  const rows: VoucherExportRow[] = dated.map((d) => d.row)

  const filename = `payment-vouchers-${officeTime().format('YYYYMMDD')}`

  if (format === 'xlsx') {
    return exportXlsxResponse({ filename, buffer: buildVouchersXlsx(rows) })
  }
  return exportPdfResponse({ filename, element: React.createElement(VouchersPdf, { rows }) })
}
