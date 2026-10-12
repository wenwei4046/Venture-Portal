import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MonthOrder } from './month-orders'

const mocks = vi.hoisted(() => ({
  input: vi.fn(), calendar: vi.fn(), pay: vi.fn(), month: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('./commission-input', () => ({ loadCommissionInput: mocks.input }))
vi.mock('./fair-calendar', () => ({ loadFairCalendar: mocks.calendar }))
vi.mock('./pay-preview', () => ({ loadPayBoard: mocks.pay }))
vi.mock('./month-orders', () => ({ loadMonthOrders: mocks.month }))

import { loadCommissionWorkbench } from './commission-workbench'

describe('commission workbench server metadata', () => {
  it('uses the persisted fair for late ERP orders and keeps denied salary inputs unavailable', async () => {
    mocks.input.mockResolvedValue({
      input: { hierarchy: [], orders: [{ id: 'order-a', staffId: 'person-a', periodMonth: '2026-08-01' }] },
      currentHierarchy: [{ staffId: 'person-a' }], currentRules: {}, unmatchedOrderNos: [],
    })
    mocks.calendar.mockResolvedValue([{
      fairId: 'fair-aug', venueKey: 'VENUE', displayName: 'Venue Hall', periodMonth: '2026-08-01', startDate: '2026-08-28', endDate: '2026-08-31',
      organiserName: 'Assigned organiser', erpOrganiserText: null,
    }])
    mocks.pay.mockRejectedValue(new Error('Individual pay is visible to HR and the Principal only'))
    const db = {
      from: (table: string) => ({ select: () => ({ in: () => Promise.resolve({
        data: table === 'sales_orders' ? [{ id: 'order-a', fair_event_id: 'fair-aug' }]
          : [{ id: 'person-a', employee_name: 'Anthony', employee_code: 'A' }], error: null,
      }) }) }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as SupabaseClient
    const order = {
      orderId: 'order-a', orderDate: '2026-09-15', eventDate: '2026-09-15',
      venueGroupKey: 'VENUE', venueGroupName: 'Venue', venue: 'Venue', location: 'Warehouse', organizer: 'Old month organiser',
    } as MonthOrder
    const result = await loadCommissionWorkbench(db, 'sub-1', '2026-08-01', [order])
    // The month's bills ride along for the directors' incentive threshold (2026-09-27).
    expect(mocks.input).toHaveBeenCalledWith('2026-08-01', 'sub-1', db, { replayRunId: undefined, includeCurrentRules: true, monthOrders: [order] })
    expect(result.orders).toEqual([{
      orderId: 'order-a', venue: 'Venue', location: 'Warehouse', organizer: 'Assigned organiser', eventName: '28–31 Aug',
      // The fair itself rides along, so Sales exhibition can group on it (2026-09-26).
      fair: { id: 'fair-aug', venueKey: 'VENUE', venueName: 'Venue Hall' },
      // No ERP pick on this bill, so no booth (2026-10-03).
      booth: null,
      // Sold at an August fair (no day named, so the fair's month) — 2026-10-12.
      saleMonth: '2026-08-01',
    }])
    // Nothing from another month to explain: no upsells, no carried bills.
    expect(result.upsales).toEqual({})
    expect(result.carriedCloses).toEqual([])
    expect(result.payRows).toEqual([])
    expect(result.payUnavailable).toBe(true)
    expect(result.payLinesClosed).toBeNull()
  })

  // Sales exhibition groups a bill under the booth the salesperson picked in
  // the ERP (user 2026-10-03) — but only while that pick IS the bill's fair.
  it('carries the ERP booth a bill was opened at, only while the ERP’s pick is its fair', async () => {
    mocks.input.mockResolvedValue({
      input: { hierarchy: [], orders: [] }, currentHierarchy: [], currentRules: {}, unmatchedOrderNos: [],
    })
    mocks.calendar.mockResolvedValue([])
    mocks.pay.mockRejectedValue(new Error('no pay'))
    const selects: string[] = []
    const db = {
      from: (table: string) => ({ select: (columns: string) => {
        if (table === 'sales_orders') selects.push(columns)
        return { in: () => Promise.resolve({
          data: table === 'sales_orders' ? [
            { id: 'picked', fair_event_id: 'f1', fair_source: 'erp', booth_brand: ' DUNLOPILLO ', booth_status: 'confirmed' },
            { id: 'pinned', fair_event_id: 'f1', fair_source: 'manual', booth_brand: 'AKEMI', booth_status: 'confirmed' },
            { id: 'cancelled', fair_event_id: null, fair_source: 'erp', booth_brand: 'AKEMI', booth_status: 'cancelled' },
          ] : [], error: null,
        }) }
      } }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    } as unknown as SupabaseClient
    const bill = (orderId: string) => ({ orderId, venue: 'HALL', venueGroupName: 'HALL', location: null, organizer: null }) as MonthOrder
    const result = await loadCommissionWorkbench(db, 'sub-1', '2026-09-01', [bill('picked'), bill('pinned'), bill('cancelled')])
    // …and the day of the fair the ERP says it was sold on (2026-10-12).
    expect(selects).toEqual(['id, fair_event_id, fair_source, booth_brand:raw->fair->>brand, booth_status:raw->fair->>status, fair_date:raw->fair->>fairDate'])
    expect(result.orders.map(o => [o.orderId, o.booth])).toEqual([['picked', 'DUNLOPILLO'], ['pinned', null], ['cancelled', null]])
  })

  it('says why the month’s pay lines can no longer change (2026-09-27)', async () => {
    mocks.input.mockResolvedValue({ input: { hierarchy: [], orders: [] }, currentHierarchy: [], currentRules: {}, unmatchedOrderNos: [] })
    mocks.calendar.mockResolvedValue([])
    mocks.pay.mockResolvedValue({ runStatus: 'computed', runId: 'run', rows: [], missing: 0 })
    const rpc = vi.fn(() => Promise.resolve({ data: 'Payroll for Aug 2026 has already been submitted.', error: null }))
    const db = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }), rpc } as unknown as SupabaseClient
    const result = await loadCommissionWorkbench(db, 'sub-1', '2026-08-01', [])
    expect(rpc).toHaveBeenCalledWith('revenue_pay_lines_closed', { p_period: '2026-08-01' })
    expect(result.payUnavailable).toBe(false)
    expect(result.payLinesClosed).toBe('Payroll for Aug 2026 has already been submitted.')

    // The All bills page reads commission only: no salary, no question asked.
    rpc.mockClear()
    const bills = await loadCommissionWorkbench(db, 'sub-1', '2026-08-01', [], undefined, { pay: false })
    expect(rpc).not.toHaveBeenCalled()
    expect(bills.payLinesClosed).toBeNull()
  })
})
