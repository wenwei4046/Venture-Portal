import type { SalesOrder } from './types'

/**
 * Upsales HR records by hand (`comm_upsales`, 2026-09-24).
 *
 * A customer adds to an order they placed earlier — a protector at the next
 * fair, a second mattress, an upgraded bedframe. The first sale's commission
 * was paid long ago, so only the ADDED amount earns (user: 它是跟着 upsells 的
 * amount 来算 commission，因为 before that 那个 sales 的 commission 已经算去了).
 *
 * The ERP cannot say what was added: it has no upsale concept, the addition is
 * sometimes its own priced line on the old document and sometimes folded into
 * an existing price, and the old documents all came over from AutoCount on one
 * day, so nothing dates the change. HR types it instead (user's choice).
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
  amount: number | string
  sold_on: string
  original_ref: string | null
}

/** What an upsale is called on a statement line: `UPSALE HC5315`. */
export function upsaleOrderNo(originalRef: string | null | undefined): string {
  const ref = (originalRef ?? '').trim()
  return ref ? `UPSALE ${ref}` : 'UPSALE'
}

export function upsalesToOrders(rows: readonly UpsaleRow[], periodMonth: string): SalesOrder[] {
  return rows.map(u => {
    const amount = Math.round(Number(u.amount) * 100) / 100
    return {
      id: u.id,
      orderNo: upsaleOrderNo(u.original_ref),
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
          productCode: 'UPSALE',
          productName: 'Upsale',
          qty: 1,
          lineAmount: amount,
          upsale: true,
        },
      ],
    }
  })
}

// ─── What HR types ───────────────────────────────────────────────────────────

export interface UpsaleInput {
  staffId: string
  /** RM, two decimals, more than 0. */
  amount: number
  /** YYYY-MM-DD — the day it was sold. */
  soldOn: string
  /** The fair it was sold at, when there was one. */
  fairEventId: string | null
  /** The paper bill it was added to, e.g. HC5315. */
  originalRef: string
  note: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/**
 * Checks what HR typed and returns it clean, or throws the sentence the form
 * shows. The table checks the same things again; this is where the person
 * typing hears about it.
 */
export function parseUpsaleInput(raw: {
  staffId?: string | null
  amount?: string | number | null
  soldOn?: string | null
  fairEventId?: string | null
  originalRef?: string | null
  note?: string | null
}): UpsaleInput {
  const staffId = (raw.staffId ?? '').trim()
  if (!UUID.test(staffId)) throw new Error('Pick who sold it.')

  const amountText = String(raw.amount ?? '').replace(/,/g, '').trim()
  const amount = Number(amountText)
  if (amountText === '' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('The upsale amount must be more than RM 0.')
  }
  if (amount > 1_000_000) throw new Error('That amount is too large for one upsale.')
  if (Math.round(amount * 100) !== Math.round(amount * 1000) / 10) {
    throw new Error('The amount can have at most two decimals.')
  }

  const soldOn = (raw.soldOn ?? '').trim()
  if (!isRealDate(soldOn)) throw new Error('Give the day it was sold.')

  const fair = (raw.fairEventId ?? '').trim()
  if (fair !== '' && !UUID.test(fair)) throw new Error('That fair is not on the calendar.')

  const originalRef = (raw.originalRef ?? '').trim().replace(/\s+/g, ' ')
  if (originalRef === '') throw new Error('Give the bill number it was added to, e.g. HC5315.')
  if (originalRef.length > 60) throw new Error('The bill number is too long.')

  const note = (raw.note ?? '').trim()
  if (note.length > 500) throw new Error('The note is too long.')

  return {
    staffId,
    amount: Math.round(amount * 100) / 100,
    soldOn,
    fairEventId: fair === '' ? null : fair,
    originalRef,
    note: note === '' ? null : note,
  }
}
