'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

/**
 * Committing an ERP sales-order import.
 *
 * The file is parsed in the BROWSER (src/lib/import/erp-sales-order.ts) so the
 * wizard can show what it found — periods, cancelled orders, agents needing a
 * match — before anything is written. This action receives only the rows the
 * human accepted.
 *
 * Two things are stamped on the way in, and both are stamped ONCE rather than
 * resolved later:
 *
 *  - **cost**, from the Product List. Freezing it means changing a product's
 *    cost next month cannot silently rewrite a commission run that has already
 *    been computed against the old one.
 *  - **brand**, from the product row or from a brand's Item Code prefixes.
 *
 * comm_* / sales_* postdate database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export interface ImportLineDto {
  lineNo: number
  itemGroup: string
  itemCode: string
  productName: string
  description2: string | null
  uom: string | null
  location: string | null
  qty: number
  unitPrice: number
  lineAmount: number
}

export interface ImportOrderDto {
  orderNo: string
  orderDate: string
  eventDate: string
  periodMonth: string
  debtorCode: string | null
  customerName: string
  agentName: string
  agentKey: string
  location: string | null
  orderTotal: number
  balance: number | null
  sequenceInDay: number
  lines: ImportLineDto[]
}

export interface CommitInput {
  periodMonth: string
  fileName: string
  sheetName: string | null
  rowCount: number
  outOfPeriodCount: number
  cancelledCount: number
  orders: ImportOrderDto[]
  /** agentKey → hr_staff_costs.id, confirmed by the human in the wizard. */
  agentMap: Record<string, string>
  /** Remember those matches so next month's import needs no confirming. */
  saveAliases: boolean
  /** Pre-fill the 1st/2nd/3rd bill picks from the running document number. */
  suggestOpenBills: boolean
}

export interface CommitResult {
  batchId: string
  orderCount: number
  lineCount: number
  unmatchedAgents: string[]
  linesWithoutCost: number
  linesWithoutBrand: number
  openBillsSuggested: number
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function norm(code: string): string {
  return code.trim().toUpperCase()
}

export async function commitSalesImport(input: CommitInput): Promise<CommitResult> {
  const user = await requireRole(['principal', 'hr'])
  const supabase = await client()

  if (!/^\d{4}-\d{2}-01$/.test(input.periodMonth)) {
    throw new Error('Period must be the first of a month')
  }
  if (input.orders.length === 0) {
    throw new Error('Nothing to import for that month')
  }

  // A run that has already paid out must not have its source data swapped.
  const { data: run } = await supabase
    .from('comm_runs')
    .select('status')
    .eq('period_month', input.periodMonth)
    .maybeSingle()
  if (run && ['applied', 'locked'].includes((run as { status: string }).status)) {
    throw new Error(
      `The ${input.periodMonth.slice(0, 7)} commission run is already ${(run as { status: string }).status} — reopen it before re-importing.`,
    )
  }

  // ── Resolve agents ─────────────────────────────────────────────────────
  const { data: aliasRows } = await supabase.from('comm_agent_aliases').select('agent_key, staff_id')
  const staffByAgent = new Map(
    ((aliasRows ?? []) as Array<{ agent_key: string; staff_id: string }>).map(a => [a.agent_key, a.staff_id]),
  )
  for (const [key, staffId] of Object.entries(input.agentMap)) {
    if (staffId) staffByAgent.set(key, staffId)
  }

  const unmatchedAgents = [
    ...new Set(input.orders.filter(o => !staffByAgent.get(o.agentKey)).map(o => o.agentName)),
  ]

  // ── Cost and brand lookups ─────────────────────────────────────────────
  const { data: productRows } = await supabase
    .from('comm_products')
    .select('item_code, brand_code, unit_cost')
  const products = new Map(
    ((productRows ?? []) as Array<{ item_code: string; brand_code: string | null; unit_cost: number | string | null }>).map(
      p => [norm(p.item_code), { brand: p.brand_code, cost: p.unit_cost === null ? null : Number(p.unit_cost) }],
    ),
  )

  const { data: brandRows } = await supabase.from('comm_brands').select('code, item_code_prefixes')
  const prefixes = ((brandRows ?? []) as Array<{ code: string; item_code_prefixes: string[] | null }>)
    .flatMap(b => (b.item_code_prefixes ?? []).map(p => ({ prefix: norm(p), code: b.code })))
    // Longest prefix first, so "AK-" never shadows a more specific "AK-CS".
    .sort((a, b) => b.prefix.length - a.prefix.length)

  const brandOf = (itemCode: string): string | null => {
    const known = products.get(norm(itemCode))?.brand
    if (known) return known
    const code = norm(itemCode)
    return prefixes.find(p => code.startsWith(p.prefix))?.code ?? null
  }

  // ── Supersede the month's previous batch ───────────────────────────────
  const { error: supersedeError } = await supabase
    .from('sales_import_batches')
    .update({ status: 'superseded', superseded_at: new Date().toISOString() })
    .eq('period_month', input.periodMonth)
    .eq('status', 'committed')
  if (supersedeError) throw new Error(`Could not retire the previous import: ${supersedeError.message}`)

  const { data: batch, error: batchError } = await supabase
    .from('sales_import_batches')
    .insert({
      period_month: input.periodMonth,
      file_name: input.fileName,
      sheet_name: input.sheetName,
      row_count: input.rowCount,
      order_count: input.orders.length,
      out_of_period_count: input.outOfPeriodCount,
      cancelled_count: input.cancelledCount,
      unmatched_agent_count: unmatchedAgents.length,
      status: 'draft',
      imported_by: user.id,
    })
    .select('id')
    .single()
  if (batchError) throw new Error(`Could not open the import batch: ${batchError.message}`)
  const batchId = (batch as { id: string }).id

  // ── Orders ─────────────────────────────────────────────────────────────
  let linesWithoutCost = 0
  let linesWithoutBrand = 0

  const orderRows = input.orders.map(o => {
    // A sales order never crosses brands, so the order's brand is whichever
    // brand carries the most revenue on it.
    const byBrand = new Map<string, number>()
    for (const l of o.lines) {
      const b = brandOf(l.itemCode)
      if (b) byBrand.set(b, (byBrand.get(b) ?? 0) + l.lineAmount)
    }
    let brand: string | null = null
    let best = -Infinity
    for (const [b, amt] of byBrand) {
      if (amt > best) {
        best = amt
        brand = b
      }
    }

    return {
      batch_id: batchId,
      period_month: o.periodMonth,
      order_no: o.orderNo,
      order_date: o.orderDate,
      event_date: o.eventDate,
      debtor_code: o.debtorCode,
      customer_name: o.customerName,
      agent_name: o.agentName,
      agent_key: o.agentKey,
      staff_id: staffByAgent.get(o.agentKey) ?? null,
      location: o.location,
      brand_code: brand,
      order_total: o.orderTotal,
      balance: o.balance,
      cancelled: false,
      sequence_in_day: o.sequenceInDay,
    }
  })

  const insertedIds = new Map<string, string>()
  for (const part of chunk(orderRows, 200)) {
    const { data, error } = await supabase.from('sales_orders').insert(part).select('id, order_no')
    if (error) throw new Error(`Could not write the orders: ${error.message}`)
    for (const r of (data ?? []) as Array<{ id: string; order_no: string }>) {
      insertedIds.set(r.order_no, r.id)
    }
  }

  // ── Lines ──────────────────────────────────────────────────────────────
  const lineRows = input.orders.flatMap(o => {
    const orderId = insertedIds.get(o.orderNo)
    if (!orderId) return []
    return o.lines.map(l => {
      const product = products.get(norm(l.itemCode))
      const brand = brandOf(l.itemCode)
      const cost = product?.cost === null || product?.cost === undefined ? null : product.cost * l.qty
      if (cost === null) linesWithoutCost++
      if (!brand) linesWithoutBrand++
      return {
        order_id: orderId,
        line_no: l.lineNo,
        item_group: l.itemGroup,
        product_code: l.itemCode,
        product_name: l.productName,
        description2: l.description2,
        uom: l.uom,
        location: l.location,
        qty: l.qty,
        unit_price: l.unitPrice,
        line_amount: l.lineAmount,
        brand_code: brand,
        cost_amount: cost === null ? null : Math.round(cost * 100) / 100,
      }
    })
  })

  for (const part of chunk(lineRows, 500)) {
    const { error } = await supabase.from('sales_order_lines').insert(part)
    if (error) throw new Error(`Could not write the order lines: ${error.message}`)
  }

  // ── Open Bill suggestions ──────────────────────────────────────────────
  // The ERP's Date cells carry no time, so the running document number is the
  // only usable proxy for which bill was written first that day. These land as
  // suggestions for a human to review on the Open Bill board, never as final.
  let openBillsSuggested = 0
  if (input.suggestOpenBills) {
    const tags = input.orders
      .filter(o => o.sequenceInDay >= 1 && o.sequenceInDay <= 3 && staffByAgent.get(o.agentKey))
      .map(o => ({
        order_id: insertedIds.get(o.orderNo)!,
        staff_id: staffByAgent.get(o.agentKey)!,
        event_date: o.eventDate,
        bill_rank: o.sequenceInDay,
        auto_suggested: true,
        tagged_by: user.id,
      }))
      .filter(t => t.order_id)

    for (const part of chunk(tags, 300)) {
      const { error } = await supabase.from('sales_order_open_bill_tags').insert(part)
      // A clash only means a human already picked that rank for that day —
      // their pick wins, so this is not worth failing the whole import over.
      if (!error) openBillsSuggested += part.length
    }
  }

  // ── Remember the agent matches ─────────────────────────────────────────
  if (input.saveAliases) {
    const newAliases = Object.entries(input.agentMap)
      .filter(([key, staffId]) => staffId && !((aliasRows ?? []) as Array<{ agent_key: string }>).some(a => a.agent_key === key))
      .map(([key, staffId]) => ({
        agent_key: key,
        agent_name_sample: input.orders.find(o => o.agentKey === key)?.agentName ?? key,
        staff_id: staffId,
        created_by: user.id,
      }))
    if (newAliases.length > 0) {
      await supabase.from('comm_agent_aliases').insert(newAliases)
    }
  }

  const { error: commitError } = await supabase
    .from('sales_import_batches')
    .update({ status: 'committed' })
    .eq('id', batchId)
  if (commitError) throw new Error(`Import written but could not be committed: ${commitError.message}`)

  revalidatePath('/revenue', 'layout')

  return {
    batchId,
    orderCount: orderRows.length,
    lineCount: lineRows.length,
    unmatchedAgents,
    linesWithoutCost,
    linesWithoutBrand,
    openBillsSuggested,
  }
}

/** Staff a wizard can match an ERP agent name to, plus the aliases already known. */
export async function loadAgentMatchingData(): Promise<{
  staff: Array<{ id: string; name: string; code: string | null }>
  aliases: Record<string, string>
}> {
  await requireRole(['principal', 'hr'])
  const supabase = await client()

  const [{ data: staffRows }, { data: aliasRows }] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, employee_code, departments!inner (payroll_source)')
      .eq('status', 'active')
      .eq('departments.payroll_source', 'commission')
      .order('employee_name'),
    supabase.from('comm_agent_aliases').select('agent_key, staff_id'),
  ])

  return {
    staff: ((staffRows ?? []) as Array<{ id: string; employee_name: string; employee_code: string | null }>).map(
      s => ({ id: s.id, name: s.employee_name, code: s.employee_code }),
    ),
    aliases: Object.fromEntries(
      ((aliasRows ?? []) as Array<{ agent_key: string; staff_id: string }>).map(a => [a.agent_key, a.staff_id]),
    ),
  }
}
