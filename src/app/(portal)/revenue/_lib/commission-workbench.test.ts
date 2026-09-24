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
      fairId: 'fair-aug', venueKey: 'VENUE', startDate: '2026-08-28', endDate: '2026-08-31',
      organiserName: 'Assigned organiser', erpOrganiserText: null,
    }])
    mocks.pay.mockRejectedValue(new Error('Individual pay is visible to HR and the Principal only'))
    const db = {
      from: (table: string) => ({ select: () => ({ in: () => Promise.resolve({
        data: table === 'sales_orders' ? [{ id: 'order-a', fair_event_id: 'fair-aug' }]
          : [{ id: 'person-a', employee_name: 'Anthony', employee_code: 'A' }], error: null,
      }) }) }),
    } as unknown as SupabaseClient
    const order = {
      orderId: 'order-a', orderDate: '2026-09-15', eventDate: '2026-09-15',
      venueGroupKey: 'VENUE', venueGroupName: 'Venue', venue: 'Venue', location: 'Warehouse', organizer: 'Old month organiser',
    } as MonthOrder
    const result = await loadCommissionWorkbench(db, 'sub-1', '2026-08-01', [order])
    expect(mocks.input).toHaveBeenCalledWith('2026-08-01', 'sub-1', db, { replayRunId: undefined, includeCurrentRules: true })
    expect(result.orders).toEqual([{
      orderId: 'order-a', venue: 'Venue', location: 'Warehouse', organizer: 'Assigned organiser', eventName: '28–31 Aug',
    }])
    expect(result.payRows).toEqual([])
    expect(result.payUnavailable).toBe(true)
  })
})
