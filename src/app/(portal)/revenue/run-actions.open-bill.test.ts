import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({ client: vi.fn(), revalidate: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/auth', () => ({ requirePermission: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('./_lib/commission-input', () => ({ loadCommissionInput: vi.fn() }))

import { saveOpenBillPicks, setOpenBillRank } from './run-actions'

type Row = Record<string, unknown>
type Filter = { key: string; values: unknown[] }

function database(options: { enabled?: boolean; openMonths?: string[]; locked?: string[]; failWrite?: boolean; raceOccupant?: boolean; raceSameOrder?: boolean; closed?: Row[] } = {}) {
  const order = (id: string, period = '2026-09-01') => ({
    id, staff_id: 'person-a', event_date: '2026-08-31', period_month: period, cancelled: false,
    sales_import_batches: { sub_department_id: 'sub-1' },
  })
  const tag = (id: string, rank: number) => ({ order_id: id, bill_rank: rank, staff_id: 'person-a', event_date: '2026-08-31', sub_department_id: 'sub-1' })
  const tables: Record<string, Row[]> = {
    sales_orders: [order('a'), order('b'), order('older', '2026-08-01'), order('new-occupant')],
    comm_schemes: [{ sub_department_id: 'sub-1', is_active: true, effective_to: null, enable_open_bill: options.enabled ?? true }],
    sales_order_open_bill_tags: [tag('a', 1), tag('b', 2)],
    // Salespeople whose month is closed on Comm Cal (2026-09-27).
    comm_salesperson_closes: options.closed ?? [],
  }
  const writes: { operation: string; filters: Filter[] }[] = []
  const locks: string[] = []
  let raced = false
  function from(table: string) {
    const filters: Filter[] = []
    const overlaps: Filter[] = []
    let operation = 'read'
    let payload: Row | null = null
    const execute = () => {
      const matching = (row: Row) => filters.every(filter => filter.values.includes(row[filter.key]))
        && overlaps.every(filter => (row[filter.key] as unknown[]).some(value => filter.values.includes(value)))
      if (operation === 'delete') {
        writes.push({ operation, filters: [...filters] })
        const removed = tables[table].filter(matching)
        tables[table] = tables[table].filter(row => !matching(row))
        return { data: removed, error: null }
      }
      if (operation === 'upsert' || operation === 'insert') {
        writes.push({ operation, filters: [] })
        if (options.failWrite) return { data: null, error: { message: 'Network write failed' } }
        const row: Row = { ...payload!, sub_department_id: 'sub-1' }
        if (operation === 'insert' && tables[table].some(old => old.order_id === row.order_id)) {
          return { data: null, error: { message: 'Duplicate Open Bill order' } }
        }
        if (tables[table].some(old => old.order_id !== row.order_id && old.staff_id === row.staff_id && old.event_date === row.event_date && old.bill_rank === row.bill_rank)) {
          return { data: null, error: { message: 'Duplicate Open Bill rank' } }
        }
        tables[table] = [...tables[table].filter(old => old.order_id !== row.order_id), row]
        return { data: [row], error: null }
      }
      const result = tables[table].filter(matching).map(row => ({ ...row }))
      if (options.raceOccupant && !raced && table === 'sales_order_open_bill_tags' && filters.some(filter => filter.key === 'bill_rank')) {
        raced = true
        tables[table] = [tag('new-occupant', 1)]
      }
      if (options.raceSameOrder && !raced && table === 'sales_order_open_bill_tags' && filters.some(filter => filter.key === 'bill_rank')) {
        raced = true
        tables[table].push(tag('a', 1))
      }
      return { data: result, error: null }
    }
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push({ key, values: [value] }); return query },
      is: (key: string, value: unknown) => { filters.push({ key, values: [value] }); return query },
      in: (key: string, values: unknown[]) => { filters.push({ key, values }); return query },
      overlaps: (key: string, values: unknown[]) => { overlaps.push({ key, values }); return query },
      delete: () => { operation = 'delete'; return query },
      upsert: (row: Row) => { operation = 'upsert'; payload = row; return query },
      insert: (row: Row) => { operation = 'insert'; payload = row; return query },
      maybeSingle: () => { const result = execute(); return Promise.resolve({ ...result, data: result.data?.[0] ?? null }) },
      then: (resolve: (result: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    }
    return query
  }
  const client = {
    from,
    rpc: (name: string, args: { p_period: string }) => {
      // Open Bill is asked per month (2026-09-26); the rest is the run lock.
      if (name === 'comm_open_bill_on') {
        const on = options.openMonths ? options.openMonths.includes(args.p_period) : (options.enabled ?? true)
        return Promise.resolve({ data: on, error: null })
      }
      locks.push(args.p_period)
      return Promise.resolve({ data: options.locked?.includes(args.p_period) ?? false, error: null })
    },
  } as unknown as SupabaseClient
  mocks.client.mockResolvedValue(client)
  return { tables, writes, locks, tag }
}

beforeEach(() => vi.clearAllMocks())

describe('Open Bill saving safeguards', () => {
  it('refuses a pick on a closed salesperson’s bill before anything is written (2026-09-27)', async () => {
    const db = database({ closed: [{
      staff_id: 'person-a', period_month: '2026-09-01', reopened_at: null, order_ids: ['a', 'zzz'],
      hr_staff_costs: { employee_name: 'ANTHONY' },
    }] })
    await expect(saveOpenBillPicks([{ orderId: 'a', before: 1, after: null }]))
      .rejects.toThrow('ANTHONY’s September 2026 is closed. Reopen it on Comm Cal before changing this bill.')
    // Taking rank 1 for another bill would take it off the closed bill: refused too.
    await expect(setOpenBillRank('b', 1)).rejects.toThrow('ANTHONY’s September 2026 is closed')
    expect(db.tables.sales_order_open_bill_tags.find(row => row.order_id === 'a')).toMatchObject({ bill_rank: 1 })
    // A bill nobody closed, on a free rank, is still anybody's to pick.
    await expect(setOpenBillRank('b', 3)).resolves.toBeUndefined()
    expect(db.tables.sales_order_open_bill_tags.find(row => row.order_id === 'b')).toMatchObject({ bill_rank: 3 })
  })

  it('rejects source-switch-off saves before clearing any existing pick', async () => {
    const db = database({ enabled: false })
    await expect(saveOpenBillPicks([{ orderId: 'a', before: 1, after: 2 }, { orderId: 'b', before: 2, after: 1 }])).rejects.toThrow('switched off')
    expect(db.writes).toEqual([])
    expect(db.tables.sales_order_open_bill_tags).toHaveLength(2)
  })

  it('asks the order’s own month: August set on for itself takes a pick, September off refuses (2026-09-26)', async () => {
    const db = database({ openMonths: ['2026-08-01'] })
    await setOpenBillRank('older', 3)
    expect(db.tables.sales_order_open_bill_tags.find(row => row.order_id === 'older')).toMatchObject({ bill_rank: 3 })
    await expect(setOpenBillRank('a', 3)).rejects.toThrow('Open Bill is switched off for 2026-09')
    expect(db.tables.sales_order_open_bill_tags.find(row => row.order_id === 'a')).toMatchObject({ bill_rank: 1 })
  })

  it('rejects stale baseline ranks and duplicate desired slots before writes', async () => {
    const db = database()
    await expect(saveOpenBillPicks([{ orderId: 'a', before: null, after: 3 }])).rejects.toThrow('changed since this page loaded')
    await expect(saveOpenBillPicks([{ orderId: 'a', before: 1, after: 3 }, { orderId: 'b', before: 2, after: 3 }])).rejects.toThrow('Two orders')
    expect(db.writes).toEqual([])
  })

  it('checks a displaced order period and prevents a no-op edit from bypassing conflict protection', async () => {
    const db = database({ locked: ['2026-08-01'] })
    db.tables.sales_order_open_bill_tags = [db.tag('older', 1)]
    await expect(saveOpenBillPicks([{ orderId: 'a', before: null, after: 1 }])).rejects.toThrow('applied or locked')
    expect(db.locks).toContain('2026-08-01')
    expect(db.writes).toEqual([])

    const unlocked = database()
    await expect(saveOpenBillPicks([{ orderId: 'a', before: 1, after: 1 }, { orderId: 'b', before: 2, after: 1 }])).rejects.toThrow('Another order now holds')
    expect(unlocked.writes).toEqual([])
  })

  it('saves a deliberate rank swap after checking the whole allocation', async () => {
    const db = database()
    await saveOpenBillPicks([{ orderId: 'a', before: 1, after: 2 }, { orderId: 'b', before: 2, after: 1 }])
    expect(db.tables.sales_order_open_bill_tags.map(row => [row.order_id, row.bill_rank])).toEqual([['a', 2], ['b', 1]])
    expect(db.writes.map(write => write.operation)).toEqual(['delete', 'delete', 'insert', 'insert'])
    expect(db.writes[0].filters).toContainEqual({ key: 'bill_rank', values: [1] })
  })

  it('reports partial saves explicitly when a later write fails', async () => {
    const db = database({ failWrite: true })
    await expect(saveOpenBillPicks([{ orderId: 'a', before: 1, after: 3 }])).rejects.toThrow('Some picks were saved')
    expect(db.writes.map(write => write.operation)).toEqual(['delete', 'insert'])
    expect(mocks.revalidate).toHaveBeenCalledWith('/revenue', 'layout')
  })

  it('does not delete a new occupant introduced after the original slot read', async () => {
    const db = database({ raceOccupant: true })
    await expect(setOpenBillRank('b', 1)).rejects.toThrow('Duplicate Open Bill rank')
    expect(db.tables.sales_order_open_bill_tags).toEqual([db.tag('new-occupant', 1)])
    expect(db.writes[0].filters).toContainEqual({ key: 'order_id', values: ['a'] })
  })

  it('preserves a concurrent pick inserted for the same order after the empty check', async () => {
    const db = database({ raceSameOrder: true })
    await expect(saveOpenBillPicks([{ orderId: 'a', before: 1, after: 3 }])).rejects.toThrow('Duplicate Open Bill order')
    expect(db.tables.sales_order_open_bill_tags.find(row => row.order_id === 'a')?.bill_rank).toBe(1)
    expect(db.writes.map(write => write.operation)).toEqual(['delete', 'insert'])
  })

  it('validates direct-action ranks and locked displaced orders before mutations', async () => {
    const db = database({ locked: ['2026-08-01'] })
    await expect(setOpenBillRank('a', 4 as 1)).rejects.toThrow('rank must be')
    db.tables.sales_order_open_bill_tags = [db.tag('older', 1)]
    await expect(setOpenBillRank('a', 1)).rejects.toThrow('applied or locked')
    expect(db.writes).toEqual([])
  })
})
