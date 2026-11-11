import React from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { exportPdfResponse, exportXlsxResponse } from '@/lib/export/response'
import { buildBrandBillingXlsx } from '@/lib/export/brand-billing-xlsx'
import { BrandBillingPdf } from '@/lib/export/brand-billing-pdf'
import { buildCommissionWorkbench } from '@/lib/commission/workbench'
import { closeVerdicts, rowOrigin } from '@/lib/commission/row-origin'
import { brandBillingReport, exportLines, type BrandDef } from '@/lib/commission/brand-billing'
import { requireSubDepartment } from '../../../_lib/sub-departments'
import { loadMonthOrders } from '../../../_lib/month-orders'
import { loadCommissionWorkbench } from '../../../_lib/commission-workbench'
import { loadSalespersonCloses } from '../../../_lib/salesperson-closes'

/**
 * Sales by Brand & Billing (2026-11-11, the user: an Export on the Comm Cal
 * month page — Excel or PDF, "the detail same as the attached Excel").
 * `?format=xlsx|pdf`. Read-only: the month as SAVED (no unsaved picks), worked
 * out by the same engine the page runs, every salesperson's own ledger.
 */

export const dynamic = 'force-dynamic'

interface Params {
  params: Promise<{ sub: string; period: string }>
}

export async function GET(req: Request, { params }: Params): Promise<Response> {
  // The month page's own gate (its tables are read under Revenue · View), then Export.
  await requirePermission('revenue')
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'export')
  const { sub, period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) return new Response('Not found', { status: 404 })
  const format = new URL(req.url).searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'

  const subDept = await requireSubDepartment(sub, 'comm_cal')
  const db = (await createClient()) as unknown as SupabaseClient

  const [batch, run, brandRows, monthOrders] = await Promise.all([
    db.from('sales_import_batches').select('id').eq('period_month', period)
      .eq('sub_department_id', subDept.id).eq('status', 'committed').maybeSingle()
      .then(({ data }) => data),
    db.from('comm_runs').select('id').eq('period_month', period).eq('sub_department_id', subDept.id).maybeSingle()
      .then(({ data }) => data as { id: string } | null),
    subDept.schemeId
      ? db.from('comm_brands').select('code, name, ref_prefixes, hc_bill_pct').eq('scheme_id', subDept.schemeId).order('code')
        .then(({ data }) => (data ?? []) as { code: string; name: string; ref_prefixes: string[] | null; hc_bill_pct: number | string | null }[])
      : Promise.resolve([]),
    loadMonthOrders(db, subDept.id, period),
  ])
  if (!batch || !subDept.schemeId) return new Response('This month has no sales orders yet.', { status: 404 })

  const data = await loadCommissionWorkbench(db, subDept.id, period, monthOrders, run?.id, { pay: false })
  const board = buildCommissionWorkbench(data.input, { people: data.people, orders: data.orders })

  // What the ledger's Status column says of each row (`row-origin.ts`).
  const closes = await loadSalespersonCloses(db, subDept.id, period)
  const verdictOf = closeVerdicts(data.carriedCloses)
  const orderMeta = new Map(data.orders.map(o => [o.orderId, o]))
  const closedBills = new Map(closes.map(c => [c.staffId, new Set(c.summary.bills.map(b => b.id))]))

  const brands: BrandDef[] = brandRows.map(b => ({
    code: b.code,
    name: b.name,
    refPrefixes: b.ref_prefixes ?? [],
    hcBillPct: b.hc_bill_pct === null ? null : Number(b.hc_bill_pct),
  }))

  const lines = exportLines(board.people, period, brands, {
    originOf: row => {
      const fact = row.upsale ? data.upsales[row.orderId] : undefined
      const closedHere = closedBills.get(row.staffId)
      return rowOrigin(row, period, {
        upsale: fact ? { kind: fact.kind, originalPeriod: fact.originalPeriod, reason: fact.reason ?? null } : null,
        saleMonth: orderMeta.get(row.orderId)?.saleMonth ?? null,
        closed: !row.upsale && row.periodMonth < period ? verdictOf(row.staffId, row.periodMonth, row.orderId) : null,
        afterClose: !row.upsale && row.periodMonth === period && !!closedHere && !closedHere.has(row.orderId),
        oldBill: row.upsale ? null : orderMeta.get(row.orderId)?.oldBill ?? null,
      })
    },
    upsaleOf: row => data.upsales[row.orderId] ?? null,
    customerOf: id => orderMeta.get(id)?.customer ?? null,
    billBrandOf: id => orderMeta.get(id)?.brandCode ?? null,
  })
  const report = brandBillingReport(lines, brands, period, subDept.name, new Map(board.people.map(p => [p.staffId, p.productRate])))

  const filename = `revenue-${subDept.slug}-${period.slice(0, 7)}-sales-by-brand-billing`
  return format === 'pdf'
    ? exportPdfResponse({ filename, element: React.createElement(BrandBillingPdf, { report }) })
    : exportXlsxResponse({ filename, buffer: buildBrandBillingXlsx(report) })
}
