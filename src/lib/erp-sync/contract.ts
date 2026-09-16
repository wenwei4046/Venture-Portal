/**
 * The ERP live feed — what the Houzs Century ERP sends, and the canonical order
 * the portal's ingest RPC reads.
 *
 * THE WIRE SHAPE IS THE ERP'S OWN. Its database drains an outbox with pg_cron +
 * pg_net and POSTs one document per request as `{ docNo, snapshotAt, header,
 * items, payments, salesperson }` — the header being a row of
 * `scm.mfg_sales_orders_with_payment_totals`, the items and payments the child
 * rows, all with the ERP's column names and money in SEN (integers). That is
 * the exact shape its 2990 mirror already ships (docs/2990-live-sync in the ERP
 * repo), which is why the portal accepts it verbatim rather than asking the ERP
 * team to learn a second vocabulary. The translation happens HERE, in tested
 * TypeScript, and the RPC only ever sees the canonical shape below.
 *
 * What the translation knows (verified against the ERP source, 2026-09-05):
 *
 *   - Money: `*_sen` integers → ringgit. The list's "Amount" is
 *     `local_total_sen`; its "Balance" is the view's `balance_sen_live`
 *     (local_total − Σ payments), falling back to the stored `balance_sen`.
 *   - Status: the header's `status` (DRAFT / CONFIRMED / IN_PRODUCTION /
 *     READY_TO_SHIP / SHIPPED / DELIVERED / INVOICED / CLOSED / CANCELLED, plus
 *     the retired ON_HOLD label) and, separately, the hold MARKER `on_hold`
 *     (their mig 0324). Which of those earn commission is decided in the RPC,
 *     mirroring the ERP's own `COMMISSION_EXCLUDED_STATUSES`.
 *   - Who sold it: `salesperson_id` (scm.staff uuid) is the identity; the
 *     `agent` text is the AutoCount spelling of the same person. The drain is
 *     asked to attach `salesperson { id, name }` so the portal has a display
 *     name without a second lookup; `agent` is the fallback.
 *   - Lines: `line_cost_sen` is the cost the commission margin was waiting for.
 *     Cancelled lines (`cancelled = true`) are not lines.
 *   - Where it was sold: `sales_location` is the WAREHOUSE (KL / PG / SRW) and
 *     becomes the portal's `location`; `venue` is the fair itself — "SUNWAY
 *     PYRAMID CONVENTION CENTRE", "MIDVALLEY SOUTHKEY JB" — free text the ERP
 *     types (its `venue_id` is never populated) and its own column here. The
 *     ERP sends nothing about who ORGANISED the event; `comm_venues` on the
 *     portal carries that.
 *
 * PII is dropped before anything is stored: the header carries the customer's
 * addresses, phone, email and emergency contacts, and `customer_po_image_b64`
 * / `signature_b64` are whole images. None of it is a commission input.
 */

import { normaliseAgent } from '@/lib/import/erp-sales-order'

/** A backfill may batch deliveries; the live drain sends one at a time. */
export const ERP_SYNC_MAX_ORDERS = 200

export const ERP_HEADER_PII_KEYS = [
  'phone',
  'email',
  'address1',
  'address2',
  'address3',
  'address4',
  'ship_to_address',
  'bill_to_address',
  'install_to_address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
  'customer_po_image_b64',
  'signature_b64',
  'note',
  'remark2',
  'remark3',
  'remark4',
] as const

export type Row = Record<string, unknown>

/** One document as the ERP's drain POSTs it. */
export interface ErpDelivery {
  docNo: string
  /** now() on the ERP when the snapshot was built — the ordering token. */
  snapshotAt?: string | null
  deleted?: boolean
  header?: Row | null
  items?: Row[] | null
  payments?: Row[] | null
  salesperson?: { id?: unknown; name?: unknown; staff_code?: unknown; user_id?: unknown } | null
}

export interface CanonicalLine {
  lineNo: number
  itemGroup: string
  itemCode: string
  description: string | null
  description2: string | null
  uom: string | null
  location: string | null
  qty: number
  unitPrice: number
  amount: number
  brand: string | null
  /** Total cost of the line in ringgit; null when the ERP sent none. */
  cost: number | null
}

/** What `ingest_erp_sales_order(p_order)` reads. Money in ringgit. */
export interface CanonicalOrder {
  docNo: string
  snapshotAt: string | null
  deleted: boolean
  status: string
  onHold: boolean
  orderDate: string | null
  companyId: number | null
  salespersonId: string | null
  salespersonName: string | null
  customerName: string | null
  debtorCode: string | null
  location: string | null
  /** Where the fair was held (`header.venue`). Not `location`, which is the warehouse. */
  venue: string | null
  brand: string | null
  total: number
  balance: number | null
  createdAt: string | null
  lines: CanonicalLine[]
  /** The delivery as received, minus PII — for re-deriving without asking again. */
  raw: { header: Row | null; items: Row[]; payments: Row[]; salesperson: Row | null }
}

export type ParseFailure = { ok: false; error: string; docNo: string | null }
export type ParseSuccess = { ok: true; orders: CanonicalOrder[] }
export type ParseResult = ParseSuccess | ParseFailure

// ─── Cell helpers ───────────────────────────────────────────────────────────

export function isRow(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Sen (integer) → ringgit, exact to the cent. Non-numbers are null. */
export function senToRinggit(v: unknown): number | null {
  const n = num(v)
  if (n === null) return null
  return Math.round(n) / 100
}

/** `2026-09-03` from a date, a timestamp or a Date. Anything else is null. */
export function isoDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const s = text(v)
  if (!s) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(m[1] + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? null : m[1]
}

export function isoTimestamp(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * A venue name with its whitespace tidied — "SPICE  ARENA " → "SPICE ARENA".
 *
 * The ERP types the venue by hand (its own `venue_id` is never populated), so
 * the same place arrives with stray spaces. Squeezing them here means the
 * portal's column, its grouping and `venue_key()` in SQL all agree, and the
 * ERP is never asked to be tidy.
 */
export function normaliseVenue(v: unknown): string | null {
  const s = text(v)
  return s === null ? null : s.replace(/\s+/g, ' ')
}

/** The ERP's status label in the portal's spelling: upper-case, underscores. */
export function normaliseStatus(v: unknown): string {
  const s = text(v)
  if (!s) return 'CONFIRMED'
  return s.toUpperCase().replace(/[\s-]+/g, '_')
}

export function stripHeaderPii(header: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(header)) {
    if ((ERP_HEADER_PII_KEYS as readonly string[]).includes(k)) continue
    out[k] = v
  }
  return out
}

// ─── The translation ────────────────────────────────────────────────────────

function lineSortKey(row: Row, index: number): [number, string] {
  const n = num(row.line_no)
  return [n === null ? Number.MAX_SAFE_INTEGER : n, `${text(row.created_at) ?? ''}|${String(index).padStart(6, '0')}`]
}

export function toCanonicalLines(items: Row[]): CanonicalLine[] {
  const live = items
    .map((row, index) => ({ row, key: lineSortKey(row, index) }))
    .filter(({ row }) => row.cancelled !== true)
    .sort((a, b) => (a.key[0] - b.key[0]) || a.key[1].localeCompare(b.key[1]))

  return live.map(({ row }, i) => ({
    lineNo: num(row.line_no) ?? i + 1,
    itemGroup: text(row.item_group) ?? 'UNGROUPED',
    itemCode: text(row.item_code) ?? '(none)',
    description: text(row.description),
    description2: text(row.description2),
    uom: text(row.uom),
    location: text(row.location),
    qty: num(row.qty) ?? 0,
    unitPrice: senToRinggit(row.unit_price_sen) ?? 0,
    amount: senToRinggit(row.total_sen) ?? 0,
    brand: text(row.branding),
    cost: senToRinggit(row.line_cost_sen),
  }))
}

/**
 * One delivery → one canonical order, or the reason it cannot be one. A
 * failure here is a CONTRACT failure (the ERP sent something the portal cannot
 * read), which the receiver answers with 422 so it shows up in the ERP's
 * outbox as `http 422` rather than silently vanishing.
 */
export function toCanonicalOrder(delivery: unknown): { ok: true; order: CanonicalOrder } | ParseFailure {
  if (!isRow(delivery)) return { ok: false, error: 'delivery must be an object', docNo: null }

  const docNo = text(delivery.docNo) ?? text(delivery.doc_no)
  if (!docNo) return { ok: false, error: 'docNo is required', docNo: null }

  const snapshotAt = isoTimestamp(delivery.snapshotAt)
  const deleted = delivery.deleted === true

  if (deleted) {
    return {
      ok: true,
      order: {
        docNo,
        snapshotAt,
        deleted: true,
        status: 'DELETED',
        onHold: false,
        orderDate: null,
        companyId: null,
        salespersonId: null,
        salespersonName: null,
        customerName: null,
        debtorCode: null,
        location: null,
        venue: null,
        brand: null,
        total: 0,
        balance: null,
        createdAt: null,
        lines: [],
        raw: { header: null, items: [], payments: [], salesperson: null },
      },
    }
  }

  const header = delivery.header
  if (!isRow(header)) return { ok: false, error: 'header is required unless deleted', docNo }

  const orderDate = isoDate(header.so_date)
  if (!orderDate) return { ok: false, error: 'header.so_date is not a date', docNo }

  const rawItems = delivery.items ?? []
  if (!Array.isArray(rawItems)) return { ok: false, error: 'items must be an array', docNo }
  const rawPayments = delivery.payments ?? []
  if (!Array.isArray(rawPayments)) return { ok: false, error: 'payments must be an array', docNo }
  const items = rawItems.filter(isRow)
  const payments = rawPayments.filter(isRow)

  const salesperson = isRow(delivery.salesperson) ? delivery.salesperson : null
  const salespersonId = text(salesperson?.id) ?? text(header.salesperson_id)
  const salespersonName = text(salesperson?.name) ?? text(header.agent)

  const total = senToRinggit(header.local_total_sen) ?? senToRinggit(header.subtotal_sen) ?? 0
  const balance = senToRinggit(header.balance_sen_live) ?? senToRinggit(header.balance_sen)

  return {
    ok: true,
    order: {
      docNo,
      snapshotAt,
      deleted: false,
      status: normaliseStatus(header.status),
      onHold: header.on_hold === true,
      orderDate,
      companyId: num(header.company_id),
      salespersonId,
      salespersonName,
      customerName: text(header.debtor_name),
      debtorCode: text(header.debtor_code),
      location: text(header.sales_location),
      venue: normaliseVenue(header.venue),
      brand: text(header.branding),
      total,
      balance,
      createdAt: isoTimestamp(header.created_at),
      lines: toCanonicalLines(items),
      raw: {
        header: stripHeaderPii(header),
        items,
        payments,
        salesperson,
      },
    },
  }
}

/**
 * The request body: one delivery, `{ orders: [...] }`, or a bare array.
 * Every order must parse for the request to be accepted — a batch is a
 * backfill tool, and half-applying one hides the half that failed.
 */
export function parseErpSyncBody(body: unknown): ParseResult {
  let deliveries: unknown[]
  if (Array.isArray(body)) {
    deliveries = body
  } else if (isRow(body) && Array.isArray(body.orders)) {
    deliveries = body.orders
  } else if (isRow(body)) {
    deliveries = [body]
  } else {
    return { ok: false, error: 'body must be a delivery object or { orders: [...] }', docNo: null }
  }

  if (deliveries.length === 0) return { ok: false, error: 'no orders in the request', docNo: null }
  if (deliveries.length > ERP_SYNC_MAX_ORDERS) {
    return { ok: false, error: `at most ${ERP_SYNC_MAX_ORDERS} orders per request`, docNo: null }
  }

  const orders: CanonicalOrder[] = []
  for (const d of deliveries) {
    const r = toCanonicalOrder(d)
    if (!r.ok) return r
    orders.push(r.order)
  }
  return { ok: true, orders }
}

/** The matching key the RPC derives — exported so the page can show it. */
export function agentKeyOf(name: string | null): string {
  return normaliseAgent(name ?? '(no salesperson)')
}
