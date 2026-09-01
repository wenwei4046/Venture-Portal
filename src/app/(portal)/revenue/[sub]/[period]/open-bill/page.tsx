import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revenuePath } from '@/lib/revenue'
import OpenBillBoard, { type BoardOrder } from './_components/OpenBillBoard'
import { requireSubDepartment } from '../../../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string; period: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Which bill was first.
 *
 * The Open Bill bonus is the one component of the scheme the data cannot
 * settle on its own: the ERP export has no time of day, only a running
 * document number, and a document number is written when the paperwork is
 * typed, not when the sale is made. So the importer suggests and a human
 * decides — and this page exists so that decision is quick rather than a
 * spreadsheet exercise across 473 orders.
 */
export default async function OpenBillPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub, period } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data: batch } = await supabase
    .from('sales_import_batches')
    .select('id')
    .eq('period_month', period)
    .eq('status', 'committed')
    .maybeSingle()
  const batchId = (batch as { id: string } | null)?.id ?? null

  const { data: orderRows } = batchId
    ? await supabase
        .from('sales_orders')
        .select('id, order_no, staff_id, event_date, order_total, sequence_in_day, hr_staff_costs (employee_name)')
        .eq('batch_id', batchId)
        .eq('cancelled', false)
        .not('staff_id', 'is', null)
    : { data: null }

  const allOrders = (orderRows ?? []) as unknown as Array<{
    id: string
    order_no: string
    staff_id: string
    event_date: string
    order_total: number | string
    sequence_in_day: number | null
    hr_staff_costs: { employee_name: string } | null
  }>

  // The batch is the whole department's, but the rates below the title are
  // THIS scheme's — so the board has to be this sub-department's people, or it
  // would price another team's bills at rules that never touch them. Anybody
  // not yet placed is shown, because they may be placed here before the run.
  const { data: positionRows } = await supabase
    .from('comm_hierarchy')
    .select('staff_id, scheme_id')
    .is('effective_to', null)
  const schemeOf = new Map(
    ((positionRows ?? []) as Array<{ staff_id: string; scheme_id: string }>).map(p => [
      p.staff_id,
      p.scheme_id,
    ]),
  )
  const rawOrders = allOrders.filter(o => {
    const placed = schemeOf.get(o.staff_id)
    return placed === undefined || placed === subDept.schemeId
  })

  const ids = rawOrders.map(o => o.id)
  const { data: tagRows } = ids.length
    ? await supabase
        .from('sales_order_open_bill_tags')
        .select('order_id, bill_rank, auto_suggested')
        .in('order_id', ids)
    : { data: null }

  const tagByOrder = new Map(
    ((tagRows ?? []) as Array<{ order_id: string; bill_rank: number; auto_suggested: boolean }>).map(
      t => [t.order_id, t],
    ),
  )

  const orders: BoardOrder[] = rawOrders.map(o => {
    const tag = tagByOrder.get(o.id)
    const rank = tag && tag.bill_rank >= 1 && tag.bill_rank <= 3 ? (tag.bill_rank as 1 | 2 | 3) : null
    return {
      id: o.id,
      orderNo: o.order_no,
      staffId: o.staff_id,
      staffName: o.hr_staff_costs?.employee_name ?? o.staff_id,
      eventDate: o.event_date,
      orderTotal: Number(o.order_total),
      sequenceInDay: o.sequence_in_day,
      rank,
      autoSuggested: rank !== null && Boolean(tag?.auto_suggested),
    }
  })

  const { data: ruleRows } = subDept.schemeId
    ? await supabase
        .from('comm_open_bill_rules')
        .select('bill_rank, pct')
        .eq('scheme_id', subDept.schemeId)
        .is('effective_to', null)
    : { data: null }
  const rates: Record<number, number> = {}
  for (const r of (ruleRows ?? []) as Array<{ bill_rank: number; pct: number | string }>) {
    rates[r.bill_rank] = Number(r.pct)
  }

  // Locked once THIS sub-department's run has paid the month; another
  // sub-department applying its own run does not freeze these picks.
  const { data: runData } = await supabase
    .from('comm_runs')
    .select('status')
    .eq('period_month', period)
    .eq('sub_department_id', subDept.id)
    .in('status', ['applied', 'locked'])
    .limit(1)
  const readOnly = ((runData ?? []) as Array<{ status: string }>).length > 0

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · OPEN BILL · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">Open Bill</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            The 1st, 2nd and 3rd bill of an event day earn{' '}
            <em>
              +{Math.round((rates[1] ?? 0) * 100)} / {Math.round((rates[2] ?? 0) * 100)} /{' '}
              {Math.round((rates[3] ?? 0) * 100)}%
            </em>{' '}
            on top of that bill&apos;s commission, at the salesperson&apos;s current rate.
          </p>
        </div>
        <Link
          href={revenuePath(subDept.slug, period)}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
        >
          ← The run
        </Link>
      </div>

      {!batchId ? (
        <div className="py-16 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif text-2xl text-ink mb-3">Nothing imported for this month.</p>
          <p className="font-serif italic text-muted text-sm max-w-lg mx-auto">
            Import the ERP sales-order export first — the picks are seeded from it.
          </p>
        </div>
      ) : (
        <OpenBillBoard orders={orders} rates={rates} readOnly={readOnly} />
      )}
    </div>
  )
}
