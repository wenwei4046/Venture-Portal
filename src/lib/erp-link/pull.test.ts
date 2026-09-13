import { describe, expect, it } from 'vitest'
import { toCanonicalOrder } from '@/lib/erp-sync/contract'
import {
  addPullStats,
  buildDelivery,
  deletedDelivery,
  describePull,
  emptyPullStats,
  listRowHash,
  mapLimit,
  monthBounds,
  planPull,
} from './pull'

const listRow = {
  doc_no: 'HC-SO-013403',
  so_date: '2026-09-03',
  status: 'CONFIRMED',
  on_hold: false,
  branding: 'KING KOIL',
  agent: 'LUCAS TAN',
  salesperson_id: '5e7a…',
  debtor_code: '300-C001',
  debtor_name: 'Ali',
  sales_location: 'KL',
  local_total_sen: 450000,
  subtotal_sen: 450000,
  total_cost_sen: 200000,
  line_count: 2,
  balance_sen: 450000,
  balance_sen_live: 150000,
  paid_total_sen: 300000,
  address1: '12 Jalan Something',
  phone: '0123456789',
  updated_at: '2026-09-03T10:00:00Z',
}

describe('listRowHash', () => {
  it('is stable for the same commission-relevant fields', () => {
    expect(listRowHash(listRow)).toBe(listRowHash({ ...listRow }))
  })

  it('ignores fields a commission run cannot feel', () => {
    expect(listRowHash({ ...listRow, address1: 'moved', phone: '000', remark2: 'x' })).toBe(listRowHash(listRow))
  })

  it('moves when a payment, a status, the hold marker or a cost moves', () => {
    const h = listRowHash(listRow)
    expect(listRowHash({ ...listRow, balance_sen_live: 0 })).not.toBe(h)
    expect(listRowHash({ ...listRow, status: 'CANCELLED' })).not.toBe(h)
    expect(listRowHash({ ...listRow, on_hold: true })).not.toBe(h)
    expect(listRowHash({ ...listRow, total_cost_sen: 210000 })).not.toBe(h)
    expect(listRowHash({ ...listRow, updated_at: '2026-09-04T10:00:00Z' })).not.toBe(h)
  })
})

describe('monthBounds', () => {
  it('finds the last day of the month', () => {
    expect(monthBounds('2026-09-01')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(monthBounds('2026-02-01')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthBounds('2028-02-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthBounds('2026-12-01')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })

  it('refuses anything but the first of a month', () => {
    expect(() => monthBounds('2026-09-15')).toThrow()
    expect(() => monthBounds('2026-13-01')).toThrow()
    expect(() => monthBounds('september')).toThrow()
  })
})

describe('planPull', () => {
  const a = { ...listRow, doc_no: 'HC-SO-A' }
  const b = { ...listRow, doc_no: 'HC-SO-B' }

  it('fetches everything the first time', () => {
    const plan = planPull([a, b], new Map(), false)
    expect(plan.listed).toBe(2)
    expect(plan.unchanged).toBe(0)
    expect(plan.items.map(i => i.docNo)).toEqual(['HC-SO-A', 'HC-SO-B'])
    expect(plan.items.every(i => i.kind === 'changed' && i.hash !== '')).toBe(true)
  })

  it('skips documents whose header has not moved', () => {
    const known = new Map([
      ['HC-SO-A', { listHash: listRowHash(a) }],
      ['HC-SO-B', { listHash: 'old' }],
    ])
    const plan = planPull([a, b], known, false)
    expect(plan.unchanged).toBe(1)
    expect(plan.items.map(i => i.docNo)).toEqual(['HC-SO-B'])
  })

  it('re-reads everything when forced', () => {
    const known = new Map([['HC-SO-A', { listHash: listRowHash(a) }]])
    const plan = planPull([a], known, true)
    expect(plan.unchanged).toBe(0)
    expect(plan.items).toHaveLength(1)
  })

  it('goes back for a document the ERP stopped listing', () => {
    const known = new Map([
      ['HC-SO-A', { listHash: listRowHash(a) }],
      ['HC-SO-GONE', { listHash: 'whatever' }],
    ])
    const plan = planPull([a], known, false)
    expect(plan.items).toEqual([{ docNo: 'HC-SO-GONE', hash: '', kind: 'verify' }])
  })

  it('ignores rows without a document number and repeats', () => {
    const plan = planPull([a, { ...a }, { so_date: '2026-09-01' }], new Map(), false)
    expect(plan.listed).toBe(1)
    expect(plan.items).toHaveLength(1)
  })
})

describe('buildDelivery', () => {
  const header = {
    doc_no: 'HC-SO-013403',
    so_date: '2026-09-03',
    status: 'CONFIRMED',
    on_hold: false,
    agent: 'LUCAS TAN',
    salesperson_id: '5e7a3c1e-0000-4000-8000-000000000001',
    salesperson_name: 'Lucas Tan',
    debtor_name: 'Ali',
    debtor_code: '300-C001',
    sales_location: 'KL',
    branding: 'KING KOIL',
    local_total_sen: 450000,
    balance_sen: 150000,
    paid_sen_total: 300000,
    created_at: '2026-09-03T02:00:00Z',
    phone: '0123456789',
    signature_b64: 'AAAA',
  }
  const items = [
    { line_no: 2, item_group: 'BEDFRAME', item_code: 'BF-1', qty: 1, unit_price_sen: 150000, total_sen: 150000, line_cost_sen: 70000, cancelled: false },
    { line_no: 1, item_group: 'MATTRESS', item_code: 'KK-1', qty: 1, unit_price_sen: 300000, total_sen: 300000, line_cost_sen: 130000, cancelled: false, branding: 'KING KOIL' },
    { line_no: 3, item_group: 'MATTRESS', item_code: 'X', qty: 1, unit_price_sen: 1, total_sen: 1, cancelled: true },
  ]
  const payments = [{ amount_sen: 300000, is_deposit: true }]

  it('is the delivery the outbox would have posted, and parses as one', () => {
    const d = buildDelivery({ docNo: 'HC-SO-013403', header, items, payments, companyId: 1, snapshotAt: '2026-09-13T04:00:00.000Z' })
    expect(d.deleted).toBe(false)
    expect(d.salesperson).toEqual({ id: header.salesperson_id, name: 'Lucas Tan' })

    const r = toCanonicalOrder(d)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.order.docNo).toBe('HC-SO-013403')
    expect(r.order.snapshotAt).toBe('2026-09-13T04:00:00.000Z')
    expect(r.order.total).toBe(4500)
    expect(r.order.balance).toBe(1500)
    expect(r.order.companyId).toBe(1)
    expect(r.order.salespersonId).toBe(header.salesperson_id)
    expect(r.order.salespersonName).toBe('Lucas Tan')
    expect(r.order.lines.map(l => l.itemCode)).toEqual(['KK-1', 'BF-1'])
    expect(r.order.lines[0].cost).toBe(1300)
    expect(r.order.raw.header?.phone).toBeUndefined()
    expect(r.order.raw.header?.signature_b64).toBeUndefined()
    expect(r.order.raw.payments).toEqual(payments)
  })

  it("prefers the list's live balance when the caller merged it in", () => {
    const d = buildDelivery({
      docNo: 'HC-SO-013403',
      header: { ...header, balance_sen_live: 120000 },
      items,
      payments,
      companyId: 1,
      snapshotAt: '2026-09-13T04:00:00.000Z',
    })
    const r = toCanonicalOrder(d)
    expect(r.ok && r.order.balance).toBe(1200)
  })

  it('falls back to the agent spelling when the ERP resolved no name', () => {
    const d = buildDelivery({
      docNo: 'HC-SO-1',
      header: { ...header, salesperson_name: null, salesperson_id: null },
      items: [],
      payments: [],
      companyId: 1,
      snapshotAt: '2026-09-13T04:00:00.000Z',
    })
    expect(d.salesperson).toEqual({ name: 'LUCAS TAN' })
    const r = toCanonicalOrder(d)
    expect(r.ok && r.order.salespersonName).toBe('LUCAS TAN')
    expect(r.ok && r.order.salespersonId).toBeNull()
  })

  it('keeps a company the header already names', () => {
    const d = buildDelivery({ docNo: 'HC-SO-1', header: { ...header, company_id: 2 }, items: [], payments: [], companyId: 1, snapshotAt: 'x' })
    expect(d.header?.company_id).toBe(2)
  })
})

describe('deletedDelivery', () => {
  it('parses as the deletion the contract expects', () => {
    const r = toCanonicalOrder(deletedDelivery('HC-SO-GONE', '2026-09-13T04:00:00.000Z'))
    expect(r.ok && r.order.deleted).toBe(true)
    expect(r.ok && r.order.status).toBe('DELETED')
  })
})

describe('pull stats', () => {
  it('adds up and reads out', () => {
    const s = addPullStats(addPullStats(emptyPullStats(), { listed: 300, unchanged: 288, fetched: 12, applied: 9 }), { held: 2, failed: 1 })
    expect(s.applied).toBe(9)
    expect(describePull(s)).toBe('300 listed · 288 unchanged · 12 read · 9 applied · 2 held · 1 failed')
    expect(describePull(emptyPullStats())).toBe('0 listed · 0 read')
  })
})

describe('mapLimit', () => {
  it('runs at most `limit` at once and keeps order', async () => {
    let running = 0
    let peak = 0
    const out = await mapLimit([30, 10, 20, 5], 2, async (ms, i) => {
      running++
      peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, ms))
      running--
      return i
    })
    expect(out).toEqual([0, 1, 2, 3])
    expect(peak).toBe(2)
  })

  it('handles an empty list', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([])
  })
})
