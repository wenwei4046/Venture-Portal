import { describe, it, expect } from 'vitest'
import {
  batchFundingView,
  batchesHeadline,
  closeReadiness,
  dayLabel,
  normaliseMonthStatus,
  rowActions,
  rowStatusView,
  statusCounts,
  submitPreview,
  type LifecycleRow,
  type PayrollBatch,
} from './payroll-lifecycle'

function row(over: Partial<LifecycleRow> = {}): LifecycleRow {
  return {
    id: 'r1', scope: 'staff', origin: 'staff', status: 'draft', name: 'CHEW WEE HO', dept: 'Finance',
    ctc: 7910, submittedCtc: 0, batchNos: [], completedAt: null, topupOpenedAt: null, ...over,
  }
}

function batch(over: Partial<PayrollBatch> = {}): PayrollBatch {
  return {
    id: 'b1', no: 1, status: 'submitted', legacy: false, submittedAt: '2026-09-27T08:40:00Z', submittedBy: 'HR Manager',
    people: 3, topups: 0, total: 23700.35, departments: [{ name: 'Finance', people: 3 }],
    sentBackAt: null, sentBackBy: null, sentBackReason: null,
    request: { id: 'q1', status: 'submitted', amount: 23700.35, requestedAt: '2026-09-27T08:40:00Z', cancelledAt: null, cancellationReason: null, paidAmount: 0, pvCount: 0 },
    ...over,
  }
}

describe('rowStatusView', () => {
  it('says where a draft is completed', () => {
    expect(rowStatusView(row()).label).toBe('Draft')
    expect(rowStatusView(row({ origin: 'revenue' })).label).toBe('Open on Comm Cal')
    expect(rowStatusView(row({ origin: 'director', scope: 'directors' })).label).toBe('On Director Salary')
  })

  it('dates a completion in Malaysia time', () => {
    // 16:40 UTC on the 26th is past midnight on the 27th in Kuala Lumpur.
    expect(rowStatusView(row({ status: 'completed', completedAt: '2026-09-26T16:40:00Z' })).label).toBe('Completed 27 Sep')
    expect(rowStatusView(row({ status: 'completed', origin: 'revenue', completedAt: '2026-09-27T08:50:00Z' })).detail)
      .toMatch(/^Closed on Comm Cal 27 Sep 16:50/)
  })

  it('names the batch that carried a submitted row', () => {
    expect(rowStatusView(row({ status: 'submitted', batchNos: [1] })).label).toBe('Submitted #1')
    expect(rowStatusView(row({ status: 'submitted', batchNos: [1, 4] })).detail).toBe('With Finance · batches #1, #4')
  })

  it('shows a resubmit in progress, and ready', () => {
    const open = row({ status: 'draft', batchNos: [1], topupOpenedAt: '2026-09-28T02:00:00Z' })
    expect(rowStatusView(open).label).toBe('Resubmit · editing')
    expect(rowStatusView({ ...open, status: 'completed', completedAt: '2026-09-28T03:00:00Z' }).label).toBe('Resubmit ready')
  })
})

describe('rowActions', () => {
  it('lets staff drafts be completed or removed, completed rows unlocked', () => {
    expect(rowActions(row(), false)).toMatchObject({ complete: true, remove: true, unlock: false, resubmit: false })
    expect(rowActions(row({ status: 'completed' }), false)).toMatchObject({ complete: false, unlock: true, remove: false })
  })

  it('never completes a salesperson or a director here', () => {
    const rev = rowActions(row({ origin: 'revenue' }), false)
    expect(rev.complete).toBe(false)
    expect(rev.unlock).toBe(false)
    const dir = rowActions(row({ origin: 'director', scope: 'directors' }), false)
    expect(dir).toMatchObject({ complete: false, remove: false, hint: 'Completed from Director Salary' })
  })

  it('offers Resubmit only to somebody a batch carried', () => {
    expect(rowActions(row({ status: 'submitted', batchNos: [2] }), false).resubmit).toBe(true)
    expect(rowActions(row({ status: 'paid', batchNos: [1] }), false).resubmit).toBe(true)
    // Paid before batches existed (a director of July): nothing to add to.
    expect(rowActions(row({ status: 'paid', batchNos: [] }), false).resubmit).toBe(false)
  })

  it('keeps a row under resubmit — it cannot be deleted, only put back', () => {
    const open = row({ status: 'draft', batchNos: [1], topupOpenedAt: '2026-09-28T02:00:00Z' })
    expect(rowActions(open, false)).toMatchObject({ complete: true, remove: false, cancelResubmit: true })
  })

  it('offers nothing once the month is closed', () => {
    expect(rowActions(row({ status: 'submitted', batchNos: [1] }), true))
      .toMatchObject({ complete: false, resubmit: false, hint: 'This month is closed for good' })
  })
})

describe('submitPreview', () => {
  it('sends only the completed, and only the difference on a resubmit', () => {
    const rows = [
      row({ id: 'a', status: 'completed', ctc: 7910, dept: 'Finance' }),
      row({ id: 'b', status: 'completed', ctc: 9634.2, submittedCtc: 7910, batchNos: [1], dept: 'Finance' }),
      row({ id: 'c', status: 'completed', ctc: 5600, dept: 'HR' }),
      row({ id: 'd', status: 'draft', ctc: 4000, dept: 'HR' }),
      row({ id: 'e', status: 'submitted', ctc: 3000, submittedCtc: 3000, batchNos: [1], dept: 'HR' }),
    ]
    expect(submitPreview(rows)).toEqual({
      people: 3,
      topups: 1,
      ctc: 15234.2,
      byDept: [{ dept: 'Finance', people: 2, ctc: 9634.2 }, { dept: 'HR', people: 1, ctc: 5600 }],
    })
  })

  it('is empty when nobody is completed', () => {
    expect(submitPreview([row()])).toEqual({ people: 0, topups: 0, ctc: 0, byDept: [] })
  })
})

describe('closeReadiness', () => {
  it('needs everybody with Finance', () => {
    const r = closeReadiness([row({ status: 'submitted', batchNos: [1] }), row({ id: 'x', name: 'LOW CHENG AN', status: 'completed' })], false)
    expect(r).toEqual({ ready: false, waiting: ['LOW CHENG AN'], reason: '1 person has not been submitted to Finance yet' })
    expect(closeReadiness([row({ status: 'paid', batchNos: [1] })], false).ready).toBe(true)
    expect(closeReadiness([], false).ready).toBe(false)
    expect(closeReadiness([row({ status: 'paid' })], true).reason).toBe('Already closed')
  })
})

describe('statusCounts', () => {
  it('counts each state and the resubmits in progress', () => {
    expect(statusCounts([
      row(), row({ status: 'completed' }), row({ status: 'submitted' }), row({ status: 'paid' }),
      row({ status: 'draft', batchNos: [1], topupOpenedAt: '2026-09-28T00:00:00Z' }),
    ])).toEqual({ draft: 2, completed: 1, submitted: 1, paid: 1, topups: 1 })
  })
})

describe('batchFundingView', () => {
  it('follows the funding request, beside the batch', () => {
    expect(batchFundingView(batch()).label).toBe('Waiting for Finance')
    expect(batchFundingView(batch({ request: { ...batch().request!, status: 'pv_generated', pvCount: 2, paidAmount: 10000 } })).detail)
      .toBe('2 PVs raised · RM 10,000.00 of 23,700.35 funded')
    expect(batchFundingView(batch({ request: { ...batch().request!, status: 'completed' } }))).toMatchObject({ label: 'Funded', tone: 'ledger' })
  })

  it('lets HR file a cancelled request again, and says when Finance sent it back', () => {
    expect(batchFundingView(batch({ request: { ...batch().request!, status: 'cancelled', cancellationReason: 'wrong bank' } })))
      .toMatchObject({ label: 'No funding request', canRefile: true, detail: 'Cancelled — wrong bank' })
    expect(batchFundingView(batch({ status: 'sent_back', sentBackAt: '2026-09-28T01:00:00Z', sentBackBy: 'Finance Manager', sentBackReason: 'check HR' })))
      .toMatchObject({ label: 'Sent back by Finance', detail: '28 Sep · Finance Manager · check HR', canRefile: false })
  })
})

describe('batchesHeadline', () => {
  it('sums what is with Finance and how much of it is funded', () => {
    expect(batchesHeadline([
      batch(),
      batch({ id: 'b2', no: 2, total: 1724.2, request: { ...batch().request!, id: 'q2', status: 'completed', amount: 1724.2 } }),
      batch({ id: 'b3', no: 3, status: 'sent_back' }),
    ])).toEqual({ text: '2 batches with Finance · RM 25,424.55 · 1 of 2 funded', tone: 'alert' })
    expect(batchesHeadline([])).toBeNull()
  })
})

describe('normaliseMonthStatus', () => {
  it('reads the RPC, money as numbers', () => {
    const s = normaliseMonthStatus({
      closed: null,
      batches: [{ id: 'b', no: 1, status: 'submitted', legacy: true, total: '109770.21', people: 22, departments: [{ name: 'HR', people: 4 }],
        request: { id: 'q', status: 'completed', amount: '109770.21', paid_amount: '109770.21', pv_count: 1 } }],
      director_legacy_request: { status: 'completed', amount: '64311.63' },
    })
    expect(s.batches[0]).toMatchObject({ no: 1, legacy: true, total: 109770.21, request: { status: 'completed', paidAmount: 109770.21 } })
    expect(s.directorLegacyRequest).toEqual({ status: 'completed', amount: 64311.63, requestedAt: null })
    expect(s.closed).toBeNull()
  })

  it('formats days in Malaysia time', () => {
    expect(dayLabel('2026-09-30T17:00:00Z')).toBe('1 Oct')
    expect(dayLabel(null)).toBe('')
  })
})
