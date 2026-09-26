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
  /** Signed: a drop (2026-09-26) is negative and takes its commission back. */
  amount: number | string
  sold_on: string
  original_ref: string | null
  kind?: UpsaleKind | null
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

// ─── What HR types ───────────────────────────────────────────────────────────

export interface UpsaleInput {
  staffId: string
  kind: UpsaleKind
  /** RM, two decimals — positive for an upsale, negative for a drop. */
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
  kind?: string | null
  amount?: string | number | null
  soldOn?: string | null
  fairEventId?: string | null
  originalRef?: string | null
  note?: string | null
}): UpsaleInput {
  const staffId = (raw.staffId ?? '').trim()
  if (!UUID.test(staffId)) throw new Error('Pick who sold it.')

  const kind: UpsaleKind = (raw.kind ?? 'upsale') === 'drop' ? 'drop' : 'upsale'
  if (raw.kind && !['upsale', 'drop'].includes(raw.kind)) throw new Error('An entry is an upsale or a drop.')

  // Typed as a positive amount; the kind gives it its sign. A minus typed on a
  // drop says the same thing twice, so it is let through — on an upsale it is
  // a mistake, and refused.
  const typed = String(raw.amount ?? '').replace(/,/g, '').trim()
  const amountText = kind === 'drop' ? typed.replace(/^-\s*/, '') : typed
  const amount = Number(amountText)
  if (amountText === '' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(kind === 'drop' ? 'The amount dropped must be more than RM 0.' : 'The upsale amount must be more than RM 0.')
  }
  if (amount > 1_000_000) throw new Error('That amount is too large for one entry.')
  if (Math.round(amount * 100) !== Math.round(amount * 1000) / 10) {
    throw new Error('The amount can have at most two decimals.')
  }

  const soldOn = (raw.soldOn ?? '').trim()
  if (!isRealDate(soldOn)) throw new Error('Give the day it was sold.')

  const fair = (raw.fairEventId ?? '').trim()
  if (fair !== '' && !UUID.test(fair)) throw new Error('That fair is not on the calendar.')

  const originalRef = (raw.originalRef ?? '').trim().replace(/\s+/g, ' ')
  if (originalRef === '') {
    throw new Error(kind === 'drop' ? 'Give the bill number it was dropped from, e.g. HC13911.' : 'Give the bill number it was added to, e.g. HC5315.')
  }
  if (originalRef.length > 60) throw new Error('The bill number is too long.')

  const note = (raw.note ?? '').trim()
  if (note.length > 500) throw new Error('The note is too long.')

  const rounded = Math.round(amount * 100) / 100
  return {
    staffId,
    kind,
    amount: kind === 'drop' ? -rounded : rounded,
    soldOn,
    fairEventId: fair === '' ? null : fair,
    originalRef,
    note: note === '' ? null : note,
  }
}
