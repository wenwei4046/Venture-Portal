import type { SalesOrder } from './types'

/**
 * Upsales and drops (`comm_upsales`, 2026-09-24).
 *
 * A customer adds to an order they placed earlier — a protector at the next
 * fair, a second mattress, an upgraded bedframe. The first sale's commission
 * was paid long ago, so only the ADDED amount earns (user: 它是跟着 upsells 的
 * amount 来算 commission，因为 before that 那个 sales 的 commission 已经算去了).
 *
 * The ERP cannot say what was added: it has no upsale concept, the addition is
 * sometimes its own priced line on the old document and sometimes folded into
 * an existing price, and the old documents all came over from AutoCount on one
 * day, so nothing dates the change. HR typed it in by hand until 2026-09-27;
 * since then every one is found by the ERP feed on a settled bill and paid
 * into a month by a click (`erp_sync_note_adjustment`).
 *
 * The rules, read off the August 2026 claim form:
 *   - paid at the salesperson's own rate, like their own sales;
 *   - counts toward the upline's override (Yuny's and Louis's override bases
 *     both include their upsales, to the ringgit);
 *   - paid in the month it is recorded under; HR records it once it is paid,
 *     so the deposit gate does not ask;
 *   - not a bill: no Open Bill, no KPI, no margin.
 *
 * Each becomes a one-line `SalesOrder` flagged `upsale`, so the engine needs no
 * second idea of what it pays commission on.
 */

/** A `comm_upsales` row as the run reads it. */
export interface UpsaleRow {
  id: string
  staff_id: string
  /** Signed: a drop (2026-09-26) is negative and takes its commission back. */
  amount: number | string
  sold_on: string
  original_ref: string | null
  kind?: UpsaleKind | null
  /** The ERP document it changed. */
  erp_doc_no?: string | null
  /**
   * The bill whose pay gave the commission it changes (2026-10-13): the
   * document's own row, or the claim-form row of a month the claim form
   * settled. Its shares split the change.
   */
  settled_order_id?: string | null
}

/**
 * The bill a drop or an upsell is split by: the one recorded on it, else the
 * ERP document's own bill (`billOfDoc`: document number → bill id). A change
 * typed by hand follows none.
 */
export function upsaleBillId(
  row: Pick<UpsaleRow, 'settled_order_id' | 'erp_doc_no'>,
  billOfDoc: ReadonlyMap<string, string>,
): string | null {
  return row.settled_order_id ?? (row.erp_doc_no ? billOfDoc.get(row.erp_doc_no) ?? null : null)
}

/**
 * A drop, an upsell or a cancellation of a SHARED bill follows the bill's
 * shares (2026-10-13, the user: "want drop sales by share as well. Follow the
 * share ratio"): the shares of its bill, keyed by the change's own id, so the
 * run splits it exactly as it splits a bill — each holder's part at their own
 * rate, climbing their own upline.
 */
export function sharesOfUpsales<S extends { order_id: string }>(
  rows: readonly UpsaleRow[],
  billOfDoc: ReadonlyMap<string, string>,
  shares: readonly S[],
): S[] {
  return rows.flatMap(row => {
    const bill = upsaleBillId(row, billOfDoc)
    return bill ? shares.filter(share => share.order_id === bill).map(share => ({ ...share, order_id: row.id })) : []
  })
}

/**
 * An upsale adds to a settled bill; a drop takes away from it (2026-09-26).
 * Both are paid in the month they are recorded under, at the salesperson's own
 * rate, and both move the upline's override — a drop the other way.
 */
export type UpsaleKind = 'upsale' | 'drop'

/** What it is called on a statement line: `UPSALE HC5315`, `DROP HC13911`. */
export function upsaleOrderNo(originalRef: string | null | undefined, kind: UpsaleKind = 'upsale'): string {
  const ref = (originalRef ?? '').trim()
  const word = kind === 'drop' ? 'DROP' : 'UPSALE'
  return ref ? `${word} ${ref}` : word
}

export function upsalesToOrders(rows: readonly UpsaleRow[], periodMonth: string): SalesOrder[] {
  return rows.map(u => {
    const amount = Math.round(Number(u.amount) * 100) / 100
    return {
      id: u.id,
      orderNo: upsaleOrderNo(u.original_ref, u.kind === 'drop' || amount < 0 ? 'drop' : 'upsale'),
      staffId: u.staff_id,
      orderDate: u.sold_on,
      periodMonth,
      eventDate: u.sold_on,
      orderTotal: amount,
      paidAmount: amount,
      upsale: true,
      lines: [
        {
          id: u.id,
          itemGroup: 'UPSALE',
          productCode: amount < 0 ? 'DROP' : 'UPSALE',
          productName: amount < 0 ? 'Drop sales' : 'Upsale',
          qty: 1,
          lineAmount: amount,
          upsale: true,
        },
      ],
    }
  })
}
