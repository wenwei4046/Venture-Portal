import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import { boothOf } from '@/lib/exhibitions'

/**
 * Where each bill was written: the fair it was placed at
 * (`sales_orders.fair_event_id`) and the booth the salesperson picked in the
 * ERP (`raw.fair.brand`, while that pick is the bill's fair — `boothOf`).
 *
 * The month page's workbench and All bills' exhibition filter read it the same
 * way, so *Sales exhibition*'s rows and the bills a row opens are always the
 * same bills. Not part of `revenue_month_orders`, whose return type a column
 * would change; chunked, because a month is a few hundred ids.
 */
export interface OrderFair {
  fairId: string | null
  booth: string | null
}

interface Row {
  id: string
  fair_event_id: string | null
  fair_source: string | null
  booth_brand: string | null
  booth_status: string | null
}

export async function loadOrderFairs(db: SupabaseClient, orderIds: readonly string[]): Promise<Map<string, OrderFair>> {
  const rows = await fetchByKeys<Row, string>([...new Set(orderIds)], keys =>
    db.from('sales_orders')
      .select('id, fair_event_id, fair_source, booth_brand:raw->fair->>brand, booth_status:raw->fair->>status')
      .in('id', keys),
  )
  return new Map(rows.map(row => [row.id, {
    fairId: row.fair_event_id,
    booth: boothOf({ fairSource: row.fair_source, boothBrand: row.booth_brand, boothStatus: row.booth_status }),
  }]))
}
