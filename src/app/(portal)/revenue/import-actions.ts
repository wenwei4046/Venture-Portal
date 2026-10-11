'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requirePermission } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'

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
  subDepartmentId: string
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
  const user = await requireActionOn('/revenue', 'revenue', 'create')
  const supabase = await client()

  if (!/^\d{4}-\d{2}-01$/.test(input.periodMonth)) {
    throw new Error('Period must be the first of a month')
  }
  if (input.orders.length === 0) {
    throw new Error('Nothing to import for that month')
  }

  const { data: scheme, error: schemeError } = await supabase
    .from('comm_schemes')
    .select('id')
    .eq('sub_department_id', input.subDepartmentId)
    .eq('is_active', true)
    .is('effective_to', null)
    .single()
  if (schemeError || !scheme) throw new Error('Choose a sub-department with an active commission scheme.')
  if (input.orders.some(o => o.periodMonth !== input.periodMonth)) {
    throw new Error('Every imported order must belong to the selected month.')
  }

  // A run that has already paid out must not have its source data swapped.
  const { data: run, error: runError } = await supabase
    .from('comm_runs')
    .select('status')
    .eq('sub_department_id', input.subDepartmentId)
    .eq('period_month', input.periodMonth)
    .maybeSingle()
  if (runError) throw new Error(`Could not check the commission run: ${runError.message}`)
  if (run && ['applied', 'locked'].includes((run as { status: string }).status)) {
    throw new Error(
      `The ${input.periodMonth.slice(0, 7)} commission run is already ${(run as { status: string }).status} — reopen it before re-importing.`,
    )
  }

  // A month the ERP feeds live is not replaced by a file: the import would
  // supersede the live batch and every later delivery would be held.
  const { data: liveBatch, error: liveError } = await supabase
    .from('sales_import_batches')
    .select('id')
    .eq('sub_department_id', input.subDepartmentId)
    .eq('period_month', input.periodMonth)
    .eq('status', 'committed')
    .eq('source', 'erp_sync')
    .maybeSingle()
  if (liveError) throw new Error(`Could not check existing sales: ${liveError.message}`)
  if (liveBatch) {
    // A month closed to the feed may take a file — that is how a month worked
    // out by hand replaces what the feed delivered (2026-09-26).
    const { data: closed, error: closedError } = await supabase.rpc('erp_feed_month_closed', {
      p_sub_department_id: input.subDepartmentId,
      p_period: input.periodMonth,
    })
    if (closedError) throw new Error(`Could not check whether the month is closed to the feed: ${closedError.message}`)
    if (!closed) {
      throw new Error(
        `${input.periodMonth.slice(0, 7)} is fed live from the ERP. A file import would replace what the feed delivered — close the month to the ERP feed first.`,
      )
    }
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

  // ── Brand lookups ──────────────────────────────────────────────────────
  // Cost is NOT decided here: every line is priced from the Product List by
  // the database as it lands (trigger `sales_order_lines_fill_cost`, the same
  // rule the live feed and a recost use — user 2026-09-24).
  // Every product (2026-10-08): the list is 1,553 rows and PostgREST stops an
  // unranged read at 1000 without a word — the other 553 fell back to the
  // brand prefixes below, or to no brand. Paged; a Map by its unique code, so
  // the pages' order changes nothing. A failed read still knows no products.
  const productRows = await fetchAllRows((lo, hi) =>
    supabase.from('comm_products').select('item_code, brand_code').order('id').range(lo, hi),
  ).catch(() => null)
  const products = new Map(
    ((productRows ?? []) as Array<{ item_code: string; brand_code: string | null }>).map(
      p => [norm(p.item_code), { brand: p.brand_code }],
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

  // Keep the previous committed batch until all new rows are staged.
  const { data: batch, error: batchError } = await supabase
    .from('sales_import_batches')
    .insert({
      sub_department_id: input.subDepartmentId,
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
      const brand = brandOf(l.itemCode)
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
      }
    })
  })

  for (const part of chunk(lineRows, 500)) {
    const { error } = await supabase.from('sales_order_lines').insert(part)
    if (error) throw new Error(`Could not write the order lines: ${error.message}`)
  }

  // What the Product List could not price, as the database priced it.
  const { count: blindCount, error: blindError } = await supabase
    .from('sales_order_lines')
    .select('id, sales_orders!inner(batch_id)', { count: 'exact', head: true })
    .eq('sales_orders.batch_id', batchId)
    .is('cost_amount', null)
  if (blindError) throw new Error(`Could not count the unpriced lines: ${blindError.message}`)
  linesWithoutCost = blindCount ?? 0

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

  const { data: suggested, error: commitError } = await supabase.rpc('commit_sales_import_batch', {
    p_batch_id: batchId,
    // The commit asks the MONTH whether Open Bill pays (comm_open_bill_on,
    // 2026-09-26) — Rules alone would say no for a month set on for itself.
    p_suggest_open_bills: input.suggestOpenBills,
  })
  if (commitError) throw new Error(`Import written but could not be committed: ${commitError.message}`)

  revalidatePath('/revenue', 'layout')

  return {
    batchId,
    orderCount: orderRows.length,
    lineCount: lineRows.length,
    unmatchedAgents,
    linesWithoutCost,
    linesWithoutBrand,
    openBillsSuggested: Number(suggested ?? 0),
  }
}

/** Staff a wizard can match an ERP agent name to, plus the aliases already known. */
export async function loadAgentMatchingData(): Promise<{
  staff: Array<{ id: string; name: string; code: string | null }>
  aliases: Record<string, string>
}> {
  await requirePermission('revenue')
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
