import { describe, expect, it } from 'vitest'
import {
  ERP_SYNC_MAX_ORDERS,
  agentKeyOf,
  isoDate,
  normaliseStatus,
  parseErpSyncBody,
  senToRinggit,
  stripHeaderPii,
  toCanonicalLines,
  toCanonicalOrder,
} from './contract'

/** A header as scm.mfg_sales_orders_with_payment_totals serialises it. */
function header(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    doc_no: 'HC-SO-013403',
    so_date: '2026-08-29',
    branding: 'AKEMI',
    debtor_code: '300-C001',
    debtor_name: 'Darren',
    agent: 'LUCAS',
    sales_location: 'KL',
    phone: '+60 16-501 7640',
    email: 'darren@example.com',
    address1: '12 Jalan Test',
    local_total_sen: 400000,
    subtotal_sen: 400000,
    balance_sen: 200000,
    paid_total_sen: 200000,
    balance_sen_live: 200000,
    status: 'IN_PRODUCTION',
    on_hold: false,
    salesperson_id: '3c1c9c1e-0000-4000-8000-000000000012',
    company_id: 1,
    created_at: '2026-08-29T02:15:33.123+00:00',
    updated_at: '2026-08-29T02:15:33.123+00:00',
    customer_po_image_b64: 'iVBORw0KGgo=',
    ...overrides,
  }
}

function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'a1',
    doc_no: 'HC-SO-013403',
    item_group: 'MATTRESS',
    item_code: 'AK-CS-K',
    description: 'Akemi Cool Sleep King',
    description2: null,
    uom: 'UNIT',
    location: 'KL',
    qty: 1,
    unit_price_sen: 400000,
    total_sen: 400000,
    branding: 'AKEMI',
    cancelled: false,
    unit_cost_sen: 210000,
    line_cost_sen: 210000,
    line_no: 1,
    created_at: '2026-08-29T02:15:33.200+00:00',
    ...overrides,
  }
}

function delivery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    docNo: 'HC-SO-013403',
    snapshotAt: '2026-09-05T10:12:33.123456+00:00',
    header: header(),
    items: [item(), item({ id: 'a2', item_code: 'PIL-001', item_group: 'ACC', description: 'Pillow', qty: 2, unit_price_sen: 0, total_sen: 0, line_cost_sen: 0, line_no: 2, branding: null })],
    payments: [{ id: 'p1', so_doc_no: 'HC-SO-013403', amount_sen: 200000, paid_at: '2026-08-29', method: 'transfer', note: 'deposit' }],
    salesperson: { id: '3c1c9c1e-0000-4000-8000-000000000012', name: 'Lucas Tan', staff_code: 'EMP-0012', user_id: 12 },
    ...overrides,
  }
}

describe('senToRinggit', () => {
  it('turns integer sen into exact ringgit', () => {
    expect(senToRinggit(400000)).toBe(4000)
    expect(senToRinggit(123456)).toBe(1234.56)
    expect(senToRinggit('708,800')).toBe(7088)
    expect(senToRinggit(0)).toBe(0)
  })

  it('is null for nothing and for junk', () => {
    expect(senToRinggit(null)).toBeNull()
    expect(senToRinggit(undefined)).toBeNull()
    expect(senToRinggit('')).toBeNull()
    expect(senToRinggit('abc')).toBeNull()
  })
})

describe('isoDate / normaliseStatus', () => {
  it('reads a date, a timestamp, or a Date', () => {
    expect(isoDate('2026-08-29')).toBe('2026-08-29')
    expect(isoDate('2026-08-29T16:00:00+08:00')).toBe('2026-08-29')
    expect(isoDate(new Date('2026-08-29T00:00:00Z'))).toBe('2026-08-29')
    expect(isoDate('29/08/2026')).toBeNull()
    expect(isoDate(null)).toBeNull()
  })

  it('spells the status the way the portal stores it', () => {
    expect(normaliseStatus('IN_PRODUCTION')).toBe('IN_PRODUCTION')
    expect(normaliseStatus('ready to ship')).toBe('READY_TO_SHIP')
    expect(normaliseStatus('On-Hold')).toBe('ON_HOLD')
    expect(normaliseStatus(null)).toBe('CONFIRMED')
  })
})

describe('toCanonicalOrder', () => {
  it('translates a live delivery: sen to ringgit, view balance, salesperson, lines', () => {
    const r = toCanonicalOrder(delivery())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const o = r.order
    expect(o.docNo).toBe('HC-SO-013403')
    expect(o.snapshotAt).toBe('2026-09-05T10:12:33.123Z')
    expect(o.deleted).toBe(false)
    expect(o.status).toBe('IN_PRODUCTION')
    expect(o.onHold).toBe(false)
    expect(o.orderDate).toBe('2026-08-29')
    expect(o.companyId).toBe(1)
    expect(o.salespersonId).toBe('3c1c9c1e-0000-4000-8000-000000000012')
    expect(o.salespersonName).toBe('Lucas Tan')
    expect(o.customerName).toBe('Darren')
    expect(o.debtorCode).toBe('300-C001')
    expect(o.location).toBe('KL')
    expect(o.brand).toBe('AKEMI')
    expect(o.total).toBe(4000)
    expect(o.balance).toBe(2000)
    expect(o.createdAt).toBe('2026-08-29T02:15:33.123Z')
    expect(o.lines).toHaveLength(2)
    expect(o.lines[0]).toMatchObject({ lineNo: 1, itemGroup: 'MATTRESS', itemCode: 'AK-CS-K', qty: 1, unitPrice: 4000, amount: 4000, brand: 'AKEMI', cost: 2100 })
    expect(o.lines[1]).toMatchObject({ lineNo: 2, itemCode: 'PIL-001', amount: 0, brand: null, cost: 0 })
  })

  it('prefers the live balance from the view and falls back to the stored one', () => {
    const live = toCanonicalOrder(delivery({ header: header({ balance_sen_live: 50000, balance_sen: 200000 }) }))
    const stored = toCanonicalOrder(delivery({ header: header({ balance_sen_live: undefined, balance_sen: 200000 }) }))
    expect(live.ok && live.order.balance).toBe(500)
    expect(stored.ok && stored.order.balance).toBe(2000)
  })

  it('uses the AutoCount agent text when no salesperson object came along', () => {
    const r = toCanonicalOrder(delivery({ salesperson: undefined }))
    expect(r.ok && r.order.salespersonName).toBe('LUCAS')
    expect(r.ok && r.order.salespersonId).toBe('3c1c9c1e-0000-4000-8000-000000000012')
  })

  it('carries the hold marker and the retired ON_HOLD label separately', () => {
    const marker = toCanonicalOrder(delivery({ header: header({ on_hold: true }) }))
    const legacy = toCanonicalOrder(delivery({ header: header({ status: 'ON_HOLD' }) }))
    expect(marker.ok && marker.order.onHold).toBe(true)
    expect(marker.ok && marker.order.status).toBe('IN_PRODUCTION')
    expect(legacy.ok && legacy.order.onHold).toBe(false)
    expect(legacy.ok && legacy.order.status).toBe('ON_HOLD')
  })

  it('drops cancelled lines and orders the rest by line_no', () => {
    const lines = toCanonicalLines([
      item({ line_no: 3, item_code: 'C' }),
      item({ line_no: 1, item_code: 'A' }),
      item({ line_no: 2, item_code: 'B', cancelled: true }),
      item({ line_no: null, item_code: 'D' }),
    ])
    expect(lines.map(l => l.itemCode)).toEqual(['A', 'C', 'D'])
    expect(lines.map(l => l.lineNo)).toEqual([1, 3, 3])
  })

  it('strips the customer PII and the images from what is kept', () => {
    const r = toCanonicalOrder(delivery())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const kept = r.order.raw.header as Record<string, unknown>
    for (const k of ['phone', 'email', 'address1', 'customer_po_image_b64']) {
      expect(kept).not.toHaveProperty(k)
    }
    expect(kept.debtor_name).toBe('Darren')
    expect(kept.local_total_sen).toBe(400000)
    expect(stripHeaderPii({ signature_b64: 'x', note: 'y', doc_no: 'z' })).toEqual({ doc_no: 'z' })
  })

  it('reads a delete as a delete and nothing else', () => {
    const r = toCanonicalOrder({ docNo: 'HC-SO-000001', deleted: true, snapshotAt: '2026-09-05T10:00:00Z' })
    expect(r.ok && r.order).toMatchObject({ docNo: 'HC-SO-000001', deleted: true, status: 'DELETED', lines: [] })
  })

  it('refuses what it cannot read, naming the document', () => {
    expect(toCanonicalOrder(null)).toMatchObject({ ok: false, docNo: null })
    expect(toCanonicalOrder({})).toMatchObject({ ok: false, error: 'docNo is required' })
    expect(toCanonicalOrder({ docNo: 'X' })).toMatchObject({ ok: false, docNo: 'X', error: 'header is required unless deleted' })
    expect(toCanonicalOrder({ docNo: 'X', header: { so_date: 'nope' } })).toMatchObject({ ok: false, error: 'header.so_date is not a date' })
    expect(toCanonicalOrder({ docNo: 'X', header: header(), items: 'no' })).toMatchObject({ ok: false, error: 'items must be an array' })
  })
})

describe('parseErpSyncBody', () => {
  it('takes one delivery, a wrapped batch, or a bare array', () => {
    const one = parseErpSyncBody(delivery())
    const wrapped = parseErpSyncBody({ orders: [delivery(), delivery({ docNo: 'HC-SO-2' })] })
    const bare = parseErpSyncBody([delivery()])
    expect(one.ok && one.orders).toHaveLength(1)
    expect(wrapped.ok && wrapped.orders.map(o => o.docNo)).toEqual(['HC-SO-013403', 'HC-SO-2'])
    expect(bare.ok && bare.orders).toHaveLength(1)
  })

  it('rejects the whole request when any order is unreadable', () => {
    const r = parseErpSyncBody({ orders: [delivery(), { docNo: 'BAD' }] })
    expect(r).toMatchObject({ ok: false, docNo: 'BAD' })
  })

  it('bounds a batch and refuses an empty one', () => {
    expect(parseErpSyncBody([])).toMatchObject({ ok: false })
    expect(parseErpSyncBody({ orders: Array.from({ length: ERP_SYNC_MAX_ORDERS + 1 }, () => delivery()) })).toMatchObject({ ok: false })
    expect(parseErpSyncBody('nope')).toMatchObject({ ok: false })
  })
})

describe('agentKeyOf', () => {
  it("is the importer's key: trimmed, collapsed, upper-cased", () => {
    expect(agentKeyOf('  Lim  Yau Wei ')).toBe('LIM YAU WEI')
    expect(agentKeyOf(null)).toBe('(NO SALESPERSON)')
  })
})
