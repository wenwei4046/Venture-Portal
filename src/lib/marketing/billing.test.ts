import { describe, expect, it } from 'vitest'
import {
  amountLocked, billEditOf, billingFromRow, billingTotals, billMissing, billOf, billPartyLines, billPatch, billProblems, canStop,
  clientBillFromRow, clientLines, confirmable, EMPTY_ADDR, lineWhen, monthKey, monthLabel, monthParam, projectBillFromRow, projectBillWords,
  shiftMonth,
} from './billing'

// 2026-10-24 — ②b-2b, billing drafts (the user's answers 43–48, 50, 51): the month's lines by client, what is still to
// confirm, a line's words, the product page's card, an outside client's billing details as their forms edit them. The
// database's side is tests/member-sql/validate-marketing-billing.mjs.

const ADDR = { line1: 'No 8, Jalan Kenari 5', line2: '', postcode: '47100', city: 'Puchong', state: 'Selangor', country: 'Malaysia' }
const row = {
  today: '2026-10-24', month: '2026-10-01', now: '2026-10-01',
  lines: [
    { project: 'p1', track: 'MKT-CAR-2610-001', title: 'Carres · Post pack · Oct 2026', sub: 's-car', status: 'done', product: 'Post pack', kind: 'one',
      doneAt: '2026-10-11T18:30:00Z', from: null, until: null, amount: 520, bill: { id: 'b1', amount: 500, words: "Post pack - Oct'26", by: 'Sia', at: '2026-10-24T03:00:00Z' } },
    { project: 'p2', track: 'MKT-CAR-2610-002', title: 'x', sub: 's-car', status: 'active', product: 'Social Media Management', kind: 'recurring',
      doneAt: null, from: '2026-08-01', until: null, amount: '2800.00', bill: null },
    { project: 'p3', track: 'MKT-BLUE-2610-001', title: 'y', sub: 's-blue', status: 'done', product: 'Event day', kind: 'one',
      doneAt: '2026-10-20T02:00:00Z', from: null, until: null, amount: null, bill: null },
  ],
  subs: [
    { id: 's-car', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, company: 'Carres Sdn Bhd', bill: null },
    { id: 's-blue', code: 'BLUE', name: 'Blue Van', dot: 'y', emoji: '🏢', client: true, company: null,
      bill: { name: 'Blue Van Trading', address: ADDR, phone: '03-8888 1234', email: null } },
    { id: 's-idle', code: 'IDLE', name: 'Idle', dot: 'z', emoji: '🏢', client: true, company: null, bill: null },
  ],
  open: [{ month: '2026-09-01', due: 2 }, { month: 'nope', due: 1 }],
}

describe('the month’s billing as the page reads it', () => {
  const page = billingFromRow(row)!

  it('reads mkt_billing: its lines, their clients, the months still open — nothing else', () => {
    expect([page.month, page.now, page.lines.length, page.open]).toEqual(['2026-10-01', '2026-10-01', 3, [{ month: '2026-09-01', due: 2 }]])
    expect(page.lines[1]).toMatchObject({ kind: 'recurring', amount: 2800, from: '2026-08-01', bill: null })
    expect(page.lines[0].bill).toEqual({ id: 'b1', amount: 500, words: "Post pack - Oct'26", by: 'Sia', at: '2026-10-24T03:00:00Z' })
    expect(page.subs[0].bill).toBeNull()
    expect(page.subs[2].bill).toEqual({ name: null, address: null, phone: null, email: null })
    expect(billingFromRow(null)).toBeNull()
    expect(billingFromRow({ month: 'October' })).toBeNull()
  })

  it('by client, each with what is still to confirm and what is confirmed — a client with nothing billed left out', () => {
    const groups = clientLines(page)
    expect(groups.map(g => [g.sub.code, g.lines.length, g.due, g.dueLines, g.noAmount, g.confirmed, g.confirmedLines])).toEqual([
      ['CAR', 2, 2800, 1, 0, 500, 1],
      ['BLUE', 1, 0, 1, 1, 0, 0],
    ])
    expect(billingTotals(page)).toEqual({ due: 2800, dueLines: 2, confirmed: 500, confirmedLines: 1, clients: 2 })
  })

  it('Confirm all sends the lines not confirmed yet that have an amount', () => {
    expect(confirmable(page.lines)).toEqual(['p2'])
  })

  it('a line in words: one-time and the day it was done (the office’s), monthly and its months', () => {
    expect(page.lines.map(lineWhen)).toEqual(['One-time · done 12 Oct', 'Monthly · from Aug 2026', 'One-time · done 20 Oct'])
    expect(lineWhen({ ...page.lines[1], until: '2026-12-01' })).toBe('Monthly · from Aug 2026 · last Dec 2026')
  })

  it('an outside client billed in its own details; one without its name or address is asked for them', () => {
    expect(billPartyLines(page.subs[1].bill)).toEqual(['Blue Van Trading', 'No 8, Jalan Kenari 5', '47100 Puchong', 'Selangor, Malaysia', '03-8888 1234'])
    expect(page.subs.map(billMissing)).toEqual([false, false, true])
    expect(billMissing({ ...page.subs[1], bill: { ...page.subs[1].bill!, address: null } })).toBe(true)
  })
})

describe('months', () => {
  it('?m=2026-10 is October; anything else is this month', () => {
    expect(['2026-10', '2026-1', '2026-13', '2026-10-01', undefined, ['2026-10']].map(monthParam)).toEqual(['2026-10-01', null, null, null, null, null])
  })
  it('in words, back and on', () => {
    expect([monthLabel('2026-09-01'), monthKey('2026-09-01'), shiftMonth('2026-01-01', -1), shiftMonth('2026-12-01', 1)])
      .toEqual(['Sep 2026', '2026-09', '2025-12-01', '2027-01-01'])
  })
})

describe('a product project’s billing card', () => {
  const none = { amount: 500, from: null, until: null, confirmed: 0, last: null }

  it('reads its billing (the manager’s), and nothing for anybody else', () => {
    expect(projectBillFromRow({ amount: '450.50', from: '2026-08-01', until: null, confirmed: 2, last: '2026-09-01' }))
      .toEqual({ amount: 450.5, from: '2026-08-01', until: null, confirmed: 2, last: '2026-09-01' })
    expect(projectBillFromRow(null)).toBeNull()
  })

  it('says when it is billed', () => {
    expect([
      projectBillWords('one', none, 'active'),
      projectBillWords('one', none, 'done'),
      projectBillWords('one', { ...none, confirmed: 1, last: '2026-10-01' }, 'done'),
      projectBillWords('recurring', none, 'minutes'),
      projectBillWords('recurring', { ...none, from: '2026-08-01' }, 'active'),
      projectBillWords('recurring', { ...none, from: '2026-08-01', confirmed: 2, last: '2026-09-01' }, 'active'),
      projectBillWords('recurring', { ...none, from: '2026-08-01', until: '2026-10-01' }, 'done'),
    ]).toEqual([
      'Billed once it is done', 'Done · to confirm on Billing', 'Billed once done · confirmed for Oct 2026',
      'Monthly · from the month its work starts', 'Monthly · from Aug 2026', 'Monthly · from Aug 2026 · confirmed to Sep 2026',
      'Stopped · Aug 2026 – Oct 2026',
    ])
  })

  it('Stop: a recurring project whose work started, not stopped, still open; a one-time amount stays once confirmed', () => {
    const running = { ...none, from: '2026-08-01' }
    expect([canStop('recurring', running, 'active'), canStop('recurring', running, 'paused'), canStop('recurring', none, 'active'),
      canStop('recurring', { ...running, until: '2026-10-01' }, 'active'), canStop('recurring', running, 'done'), canStop('one', running, 'active'),
      canStop('recurring', null, 'active')]).toEqual([true, true, false, false, false, false, false])
    expect([amountLocked('one', { ...none, confirmed: 1 }), amountLocked('one', none), amountLocked('recurring', { ...none, confirmed: 3 })])
      .toEqual([true, false, false])
  })
})

describe('an outside client’s billing details as its forms edit them', () => {
  const saved = billEditOf({ name: 'Blue Van Trading', address: ADDR, phone: '03-8888 1234', email: null })

  it('only what changed, emptied as none; the address whole', () => {
    expect(billPatch(saved, saved)).toEqual({})
    expect(billPatch(saved, { ...saved, billName: '  Blue  Van Trading ', billEmail: 'a@b.my', billPhone: '' }))
      .toEqual({ billEmail: 'a@b.my', billPhone: null })
    expect(billPatch(saved, { ...saved, billAddress: { ...ADDR, postcode: '47110' } })).toEqual({ billAddress: { ...ADDR, postcode: '47110' } })
    expect(billPatch(saved, { ...saved, billAddress: EMPTY_ADDR })).toEqual({ billAddress: null })
  })

  it('a new client’s whole set — none when nothing was given', () => {
    expect(billOf(billEditOf(null))).toBeNull()
    expect(billOf({ ...billEditOf(null), billName: ' Red  Truck ', billEmail: ' accounts@redtruck.my ' }))
      .toEqual({ name: 'Red Truck', address: null, phone: null, email: 'accounts@redtruck.my' })
  })

  it('what the database would refuse, said first', () => {
    expect(billProblems(saved)).toEqual([])
    expect(billProblems({ ...saved, billPhone: '012-ABC', billEmail: 'accounts', billName: 'x'.repeat(121) }))
      .toEqual(['A billing name of at most 120 characters', 'A phone number, digits only', 'An email address, like name@company.com'])
  })

  it('reads the details on file — an address of nothing is none', () => {
    expect(clientBillFromRow({ name: 'A', address: { line1: '', country: 'Malaysia' }, phone: null, email: 'a@b.my' }))
      .toEqual({ name: 'A', address: null, phone: null, email: 'a@b.my' })
    expect(clientBillFromRow(null)).toBeNull()
  })
})
