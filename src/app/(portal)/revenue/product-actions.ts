'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { parseProductPaste } from '@/lib/commission/product-paste'

/**
 * Revenue → Product List. **Principal only** (user 2026-08-31: "I will open a
 * tab in principal view, a tab for product list, that part will key in all
 * product cost").
 *
 * This is the only place cost enters the system. The ERP sales-order export
 * carries none, so a product without a `unit_cost` here leaves every line of it
 * without cost, which leaves its bill without a derived margin — the engine
 * then skips the below-margin penalty and says so. The stop-gap in the meantime
 * is `sales_orders.manual_margin_pct`, keyed per bill.
 *
 * comm_products postdates database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function refresh() {
  revalidatePath('/revenue', 'layout')
}

export async function upsertProduct(formData: FormData) {
  const user = await requirePermission('product_list')
  const supabase = await client()

  const id = ((formData.get('id') as string) ?? '').trim()
  const itemCode = ((formData.get('item_code') as string) ?? '').trim()
  if (!itemCode) throw new Error('Item code is required')

  const rawCost = ((formData.get('unit_cost') as string) ?? '').trim()
  let unitCost: number | null = null
  if (rawCost !== '') {
    unitCost = Number(rawCost.replace(/,/g, ''))
    if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error('Unit cost must be zero or more')
  }

  const row = {
    item_code: itemCode,
    product_name: ((formData.get('product_name') as string) ?? '').trim() || null,
    brand_code: (((formData.get('brand_code') as string) ?? '').trim() || null)?.toUpperCase() ?? null,
    item_group: (((formData.get('item_group') as string) ?? '').trim() || null)?.toUpperCase() ?? null,
    unit_cost: unitCost,
    is_active: formData.get('is_active') !== 'off',
    note: ((formData.get('note') as string) ?? '').trim() || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }

  const { error } = id
    ? await supabase.from('comm_products').update(row).eq('id', id)
    : await supabase.from('comm_products').insert(row)

  if (error) throw new Error(`Could not save the product: ${error.message}`)
  refresh()
}

/**
 * Bulk paste. Upserts on the normalised item code, so pasting a refreshed cost
 * list updates in place instead of duplicating.
 *
 * A row whose cost cell is blank is written with `unit_cost = NULL` — that is a
 * meaningful state ("known product, cost not keyed in yet"), not a zero.
 */
export async function bulkUpsertProducts(raw: string): Promise<{ written: number; skipped: number }> {
  const user = await requirePermission('product_list')
  const supabase = await client()

  const { parsed, skipped } = parseProductPaste(raw)
  if (parsed.length === 0) {
    throw new Error('Nothing to import — check the paste has an item code in the first column')
  }

  const now = new Date().toISOString()
  const rows = parsed.map(p => ({
    item_code: p.itemCode,
    product_name: p.productName,
    brand_code: p.brandCode,
    item_group: p.itemGroup,
    unit_cost: p.unitCost,
    updated_by: user.id,
    updated_at: now,
  }))

  // The unique index is on UPPER(BTRIM(item_code)), which PostgREST cannot name
  // as an ON CONFLICT target, so existing codes are matched and updated here.
  const { data: existing } = await supabase.from('comm_products').select('id, item_code')
  const byCode = new Map(
    ((existing ?? []) as Array<{ id: string; item_code: string }>).map(r => [
      r.item_code.trim().toUpperCase(),
      r.id,
    ]),
  )

  const inserts = rows.filter(r => !byCode.has(r.item_code.trim().toUpperCase()))
  const updates = rows.filter(r => byCode.has(r.item_code.trim().toUpperCase()))

  if (inserts.length > 0) {
    const { error } = await supabase.from('comm_products').insert(inserts)
    if (error) throw new Error(`Import failed while adding products: ${error.message}`)
  }
  for (const r of updates) {
    const id = byCode.get(r.item_code.trim().toUpperCase())!
    const { error } = await supabase.from('comm_products').update(r).eq('id', id)
    if (error) throw new Error(`Import failed while updating ${r.item_code}: ${error.message}`)
  }

  refresh()
  return { written: rows.length, skipped: skipped.length }
}

export async function deleteProduct(id: string) {
  await requirePermission('product_list')
  const supabase = await client()
  const { error } = await supabase.from('comm_products').delete().eq('id', id)
  if (error) throw new Error(`Could not remove the product: ${error.message}`)
  refresh()
}
