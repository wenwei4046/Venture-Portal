import { describe, expect, it } from 'vitest'
import { STAFF_MAX, parseStaffDelivery } from './staff'

// The ERP's staff list (contract §13, 2026-11-10): the envelope is checked here; the ingest reads every field again.
describe('parseStaffDelivery', () => {
  it('takes one company’s list and counts it', () => {
    const r = parseStaffDelivery({ companyId: 1, snapshotAt: '2026-11-10T01:00:00Z', staff: [
      { staffId: 'a', name: 'Daniel', active: true }, { staffId: 'b', name: 'Sharon', active: false }, { name: 'no id' }, 'junk'] })
    expect(r.ok && r.counts).toEqual({ staff: 2, inactive: 1, unreadable: 2 })
    expect(r.ok && r.delivery.companyId).toBe(1)
  })
  it('refuses what is not a delivery, with the reason', () => {
    expect(parseStaffDelivery([])).toEqual({ ok: false, error: 'a staff delivery is one JSON object' })
    expect(parseStaffDelivery({ companyId: 0, staff: [] })).toMatchObject({ ok: false, error: 'companyId must be the ERP company id' })
    expect(parseStaffDelivery({ companyId: 1, snapshotAt: 'soon', staff: [] })).toMatchObject({ ok: false, error: 'snapshotAt must be a time' })
    expect(parseStaffDelivery({ companyId: 1 })).toMatchObject({ ok: false, error: 'staff must be a list' })
    expect(parseStaffDelivery({ companyId: '1', staff: Array(STAFF_MAX + 1).fill({ staffId: 'x' }) })).toMatchObject({ ok: false })
  })
})
