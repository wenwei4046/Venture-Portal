import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ATTENDANCE_MAX_BOOTHS, parseAttendanceDelivery } from './attendance'

const booth = (projectId: unknown, attendees: unknown[] = []) => ({
  projectId, code: 'P', name: 'MID VALLEY AKEMI', brand: 'AKEMI', venue: 'MID VALLEY', organizer: 'BIGHOME',
  startDate: '2026-10-02', endDate: '2026-10-04', status: 'confirmed', eventType: 'exhibition', attendees,
})
const person = (salesRepId: number, name: string) => ({ salesRepId, code: `SR-${salesRepId}`, name, salespersonId: null })
const delivery = (over: Record<string, unknown> = {}) => ({
  companyId: 1, since: '2026-04-01', snapshotAt: '2026-10-12T07:46:03.571758+00:00',
  booths: [booth(363, [person(54, 'Chea Huan'), person(48, 'Kar Jiun')]), booth(2262, [person(61, 'Anthony')])],
  ...over,
})

describe('parseAttendanceDelivery', () => {
  it('reads a whole delivery into what ingest_erp_sales_attending is given', () => {
    const parsed = parseAttendanceDelivery(delivery())
    expect(parsed).toEqual({
      ok: true,
      delivery: { companyId: 1, since: '2026-04-01', snapshotAt: '2026-10-12T07:46:03.571758+00:00', booths: delivery().booths },
      counts: { booths: 2, attendees: 3, unreadable: 0 },
    })
  })

  it('takes a company id and a project id written as digits', () => {
    const parsed = parseAttendanceDelivery(delivery({ companyId: '1', booths: [booth('363')] }))
    expect(parsed.ok && parsed.delivery.companyId).toBe(1)
    expect(parsed.ok && parsed.counts).toEqual({ booths: 1, attendees: 0, unreadable: 0 })
  })

  it('keeps a booth with nobody listed — the portal then counts that weekend by the bills', () => {
    const parsed = parseAttendanceDelivery(delivery({ booths: [booth(359)] }))
    expect(parsed.ok && parsed.delivery.booths).toHaveLength(1)
  })

  it('drops what cannot be a booth and says how many', () => {
    const parsed = parseAttendanceDelivery(delivery({ booths: [booth(363), 'x', null, booth('P-1'), booth(-1), { venue: 'NO ID' }] }))
    expect(parsed.ok && parsed.counts).toEqual({ booths: 1, attendees: 0, unreadable: 5 })
  })

  it('refuses what is not a delivery, with the reason', () => {
    expect(parseAttendanceDelivery([])).toEqual({ ok: false, error: 'a Sales Attending delivery is one JSON object' })
    expect(parseAttendanceDelivery(delivery({ companyId: 0 }))).toEqual({ ok: false, error: 'companyId must be the ERP company id' })
    expect(parseAttendanceDelivery(delivery({ since: undefined }))).toMatchObject({ ok: false, error: expect.stringContaining('since') })
    expect(parseAttendanceDelivery(delivery({ since: '2026-13-40' }))).toMatchObject({ ok: false })
    expect(parseAttendanceDelivery(delivery({ snapshotAt: 'yesterday' }))).toEqual({ ok: false, error: 'snapshotAt must be a time' })
    expect(parseAttendanceDelivery(delivery({ booths: {} }))).toEqual({ ok: false, error: 'booths must be a list' })
    expect(parseAttendanceDelivery(delivery({ booths: Array.from({ length: ATTENDANCE_MAX_BOOTHS + 1 }, (_, i) => booth(i + 1)) })))
      .toMatchObject({ ok: false, error: expect.stringContaining('at most') })
  })

  it('caps at the same number the ingest RPC refuses beyond', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261012140000_erp_sales_attending.sql'), 'utf8')
    expect(sql).toContain(`jsonb_array_length(p_batch->'booths') > ${ATTENDANCE_MAX_BOOTHS}`)
  })
})
