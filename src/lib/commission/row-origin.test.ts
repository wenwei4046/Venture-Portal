import { describe, expect, it } from 'vitest'
import { closeVerdicts, monthShort, ORIGIN_TONE, rowOrigin, type OriginRow } from './row-origin'

// 2026-10-12 — the user: "if the commission is pay in current month, but the
// bill is come from another month, i need the bar show different colour …
// then add a column status (show the reason — top up deposit, drop sales)".

const SEP = '2026-09-01'
const OCT = '2026-10-01'
const row = (over: Partial<OriginRow> = {}): OriginRow => ({ upsale: false, orderTotal: 1_000, periodMonth: OCT, status: 'eligible', ...over })

describe('rowOrigin — a month’s own bill', () => {
  it('says nothing of a bill sold and keyed in the month on screen', () => {
    expect(rowOrigin(row(), OCT)).toBeNull()
    expect(rowOrigin(row(), OCT, { saleMonth: OCT, closed: null })).toBeNull()
  })
  it('says nothing of a bill no fair claims', () => {
    expect(rowOrigin(row(), OCT, { saleMonth: null })).toBeNull()
  })
})

describe('rowOrigin — upsells and drops', () => {
  it('names an upsell on an August bill, paid in September', () => {
    expect(rowOrigin(row({ upsale: true, orderTotal: 600, periodMonth: SEP }), SEP, { upsale: { kind: 'upsale', originalPeriod: '2026-08-01' } }))
      .toEqual({ kind: 'upsell', label: 'Upsell', fromMonth: '2026-08-01', detail: 'Aug 2026 bill', paysHere: true })
  })
  it('names a drop by its kind, or by its sign when the row says no more', () => {
    expect(rowOrigin(row({ upsale: true, orderTotal: -10_399, periodMonth: OCT }), OCT, { upsale: { kind: 'drop', originalPeriod: '2026-08-01' } }))
      .toMatchObject({ kind: 'drop', label: 'Drop sales', detail: 'Aug 2026 bill', paysHere: true })
    expect(rowOrigin(row({ upsale: true, orderTotal: -2_088 }), OCT)).toMatchObject({ kind: 'drop', fromMonth: null, detail: 'An earlier bill' })
  })
})

describe('rowOrigin — a bill carried in from an earlier month', () => {
  const carried = row({ periodMonth: SEP })
  it('is a top-up when its month closed with the deposit gate holding it', () => {
    expect(rowOrigin(carried, OCT, { closed: 'held' }))
      .toEqual({ kind: 'deposit', label: 'Top up deposit', fromMonth: SEP, detail: 'Sep 2026 bill', paysHere: true })
  })
  it('is a late key-in when it was not there when its month closed', () => {
    expect(rowOrigin(carried, OCT, { closed: 'absent' })).toMatchObject({ kind: 'late', label: 'Late key-in', detail: 'Sep 2026 bill', paysHere: true })
  })
  it('only says the month when no close tells why', () => {
    expect(rowOrigin(carried, OCT, { closed: null })).toMatchObject({ kind: 'carried', label: 'From Sep 2026', paysHere: true })
    expect(rowOrigin(carried, OCT, { closed: 'counted' })).toMatchObject({ kind: 'carried' })
  })
  it('is not drawn as paid here while the gate still holds it', () => {
    expect(rowOrigin(row({ periodMonth: SEP, status: 'deposit_pending' }), OCT, { closed: 'held' }))
      .toMatchObject({ kind: 'held', label: 'Below deposit', paysHere: false })
  })
  it('wins over the bill’s fair — the month it came from is what is said', () => {
    expect(rowOrigin(carried, OCT, { closed: 'held', saleMonth: SEP })).toMatchObject({ kind: 'deposit' })
  })
})

describe('rowOrigin — a bill keyed in another month than its fair', () => {
  // HC-SO-2610-167 (SHAWN): IOI MALL PUTRAJAYA 16–20 Sep, keyed 12 Oct — October pays it.
  it('is a late key-in of an earlier month’s fair', () => {
    expect(rowOrigin(row(), OCT, { saleMonth: SEP }))
      .toEqual({ kind: 'late', label: 'Late key-in', fromMonth: SEP, detail: 'Sep 2026 fair', paysHere: true })
  })
  it('is an early key-in of a later month’s fair', () => {
    expect(rowOrigin(row({ periodMonth: SEP }), SEP, { saleMonth: OCT })).toMatchObject({ kind: 'early', label: 'Early key-in', detail: 'Oct 2026 fair' })
  })
  it('is not coloured while its deposit is short — this month pays none of it yet', () => {
    expect(rowOrigin(row({ status: 'deposit_pending' }), OCT, { saleMonth: SEP })).toMatchObject({ kind: 'late', paysHere: false })
  })
})

describe('rowOrigin — a bill of the month that came in after its salesperson was closed', () => {
  // 2026-10-12: sold 27 Sep, keyed 10 Oct with the ERP's fair day — it sits in
  // September (records), and September's close did not pay it: October will.
  it('says so, uncoloured — September pays none of it', () => {
    expect(rowOrigin(row({ periodMonth: SEP }), SEP, { afterClose: true, saleMonth: SEP }))
      .toEqual({ kind: 'after_close', label: 'After close', fromMonth: null, detail: 'Paid next month', paysHere: false })
  })
  it('is coloured in the month that does pay it — the late key-in of its own month', () => {
    expect(rowOrigin(row({ periodMonth: SEP }), OCT, { closed: 'absent' })).toMatchObject({ kind: 'late', paysHere: true })
  })
})

describe('ORIGIN_TONE', () => {
  it('adds in green, takes away in red, waits for a deposit in blue, comes late in amber', () => {
    expect([ORIGIN_TONE.upsell, ORIGIN_TONE.drop, ORIGIN_TONE.deposit, ORIGIN_TONE.late]).toEqual(['ledger', 'danger', 'wait', 'alert'])
  })
})

describe('closeVerdicts — what a carried bill’s own month’s close says of it', () => {
  const verdict = closeVerdicts([
    { staffId: 'SHAWN', periodMonth: SEP, heldIds: ['held-bill'], billIds: ['held-bill', 'paid-bill'] },
  ])
  it('held, counted, or absent from the close', () => {
    expect(verdict('SHAWN', SEP, 'held-bill')).toBe('held')
    expect(verdict('SHAWN', SEP, 'paid-bill')).toBe('counted')
    expect(verdict('SHAWN', SEP, 'keyed-after')).toBe('absent')
  })
  it('knows nothing of a salesperson or a month with no close', () => {
    expect(verdict('ADRIAN', SEP, 'held-bill')).toBeNull()
    expect(verdict('SHAWN', '2026-08-01', 'held-bill')).toBeNull()
  })
})

describe('monthShort', () => {
  it('is three letters and the year', () => {
    expect(monthShort('2026-09-01')).toBe('Sep 2026')
    expect(monthShort('2027-01-15')).toBe('Jan 2027')
  })
})
