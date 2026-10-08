// Monthly Receipt & Payment — the 未收 rows under the cash matrix, shared by
// the page and the export route so screen and file can never drift.
// INVOICE-based since 2026-08-24 (user: "收到钱了就应该 knock off"): the old
// GL-3030-per-segment version showed ghosts because early lump settle JEs
// posted their whole 3030 credit under one segment (e.g. JE-202605-0051 put a
// 7-invoice Dream Crafter batch under 'corporate' while the invoice debits
// sat in marketing). Now every value comes from dated invoice events
// (rnp_invoice_events RPC): billed +total at invoice date, collected −amount
// at receipt date (batch settles clear their residual at the settlement
// voucher's date), credited −amount at CN approval. Paid invoice ⇒ zero.
// The bottom block is ONLY 月末未收 + one row per debtor still owing —
// 开单/收回/部门总资金/支出对象 rows were all removed on request.

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatrixRow } from './monthly-matrix'
import { fetchAllRowsAsWritten } from './paginate'

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Every row of rnp_invoice_events (2026-10-08), for the page and its export
 * alike. The RPC returns a TABLE — a billed row per invoice plus a row per
 * receipt / credit note — consolidated across every segment, and PostgREST
 * caps a function's rows at 1000 like any read: past it, the events cut would
 * silently drop out of 月末未收 and every debtor row.
 *
 * Asked as before first (fetchAllRowsAsWritten): the debtor rows keep the
 * order the function hands its events over in. Only a capped answer is read
 * again in pages, in a total order — invoice, kind, date, amount; every other
 * column is the invoice's own, so rows still tied are the same row twice.
 * A failed read is no events, as it always was.
 */
export async function fetchRnpInvoiceEvents(
  supabase: SupabaseClient,
  args: { p_segment?: string },
): Promise<RnpInvoiceEvent[]> {
  return fetchAllRowsAsWritten<RnpInvoiceEvent>((page) => {
    const q = supabase.rpc('rnp_invoice_events', args)
    return page
      ? q
          .order('invoice_id')
          .order('event_kind')
          .order('event_date')
          .order('amount')
          .range(page.from, page.to)
      : q
  }).catch(() => [])
}

/** One row of the rnp_invoice_events RPC. */
export interface RnpInvoiceEvent {
  invoice_id: string
  invoice_no: string | null
  company_id: string | null
  party_fallback: string | null
  event_kind: 'billed' | 'collected' | 'credited'
  amount: number
  event_date: string
}

export interface RnpExtrasInput {
  events: RnpInvoiceEvent[]
  /** company id → short code (fallback name) for the debtor row label. */
  companyLabelById: Map<string, string>
  months: string[]
  accPeriod: { from: string; to: string }
}

export function buildRnpMatrixRows(i: RnpExtrasInput): MatrixRow[] {
  const monthEnd = (ym: string) => dayjs(`${ym}-01`).endOf('month').format('YYYY-MM-DD')
  const signed = (e: RnpInvoiceEvent) =>
    e.event_kind === 'billed' ? Number(e.amount) : -Number(e.amount)
  const partyOf = (e: RnpInvoiceEvent) =>
    (e.company_id ? i.companyLabelById.get(e.company_id) : null) ??
    e.party_fallback ??
    '未标示 · Unattributed'

  const balanceAt = (events: RnpInvoiceEvent[], toDate: string) =>
    r2(events.filter((e) => e.event_date <= toDate).reduce((s, e) => s + signed(e), 0))

  const outstandingByCol = [
    balanceAt(i.events, i.accPeriod.to),
    ...i.months.map((ym) => balanceAt(i.events, monthEnd(ym))),
  ]

  const byParty = new Map<string, RnpInvoiceEvent[]>()
  for (const e of i.events) {
    const p = partyOf(e)
    const list = byParty.get(p) ?? []
    list.push(e)
    byParty.set(p, list)
  }
  const partyRows: MatrixRow[] = [...byParty.entries()]
    .map(([p, evs]) => ({
      p,
      values: [balanceAt(evs, i.accPeriod.to), ...i.months.map((ym) => balanceAt(evs, monthEnd(ym)))],
    }))
    // 只看还没收回的: only debtors whose accumulated balance is still positive.
    .filter((r) => r.values[0] > 0.005)
    .sort((a, b) => b.values[0] - a.values[0])
    .map((r) => ({
      key: `AR_P_${r.p}`,
      label: r.p,
      depth: 1,
      kind: 'account' as const,
      values: r.values,
    }))

  return [
    { key: 'AR_OUTSTANDING', label: '月末未收 · Outstanding (还没收到的钱)', depth: 0, kind: 'subtotal', tone: 'danger', emphasis: 'strong', values: outstandingByCol },
    ...partyRows,
  ]
}
