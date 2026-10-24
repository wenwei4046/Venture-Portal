import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'

// A person's page goes on below the card and the record in the same wells
// (2026-10-16, the user: "the promotion, permissions and activity go with new
// as well"): Promotion beside Employment, each its title in capitals.

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  acknowledgeProbation: vi.fn(),
  confirmProbation: vi.fn(),
  extendProbation: vi.fn(),
  acknowledgeContract: vi.fn(),
  renewContract: vi.fn(),
  letterTypeOf: vi.fn(),
  upload: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../promote-actions', () => ({ promoteStaff: vi.fn() }))
vi.mock('../actions', () => ({ deactivateStaff: vi.fn(), reactivateStaff: vi.fn() }))
vi.mock('../probation-actions', () => ({
  acknowledgeProbation: mocks.acknowledgeProbation,
  confirmProbation: mocks.confirmProbation,
  extendProbation: mocks.extendProbation,
}))
vi.mock('../contract-actions', () => ({ acknowledgeContract: mocks.acknowledgeContract, renewContract: mocks.renewContract }))
// Renew files the new contract (2026-10-24): its type, the file up, then renewContract.
vi.mock('@/lib/documentation/file-letters', () => ({ fileLetters: vi.fn(), letterTypeOf: mocks.letterTypeOf }))
vi.mock('@/lib/documentation/upload', () => ({ uploadDocumentationFile: mocks.upload }))

import PersonChanges from './PersonChanges'
import type { CardLadder } from '../card-actions'
import type { TermFacts } from './Employment'

const ladder = (over: Partial<CardLadder> = {}): CardLadder => ({
  level: 'L3',
  next: { level: 'L4', titles: [{ id: 't-senior', name: 'Senior Executive' }] },
  blocker: null,
  ...over,
})

const TODAY = '2026-10-23'

beforeEach(() => {
  for (const m of [mocks.refresh, mocks.acknowledgeProbation, mocks.confirmProbation, mocks.extendProbation, mocks.acknowledgeContract,
    mocks.renewContract, mocks.letterTypeOf, mocks.upload]) m.mockReset()
})
afterEach(cleanup)

const well = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section')!

describe('Promotion and Employment, as wells', () => {
  it('draws two wells, each its title, the next step in the reference’s words', () => {
    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active today={TODAY} />)
    expect(within(well('Promotion')).getByText('Next up')).toBeInTheDocument()
    expect(within(well('Promotion')).getByText('Senior Executive')).toBeInTheDocument()
    expect(within(well('Promotion')).getByText('L3 → L4')).toBeInTheDocument()
    expect(within(well('Promotion')).getByRole('button', { name: 'Promote' })).toBeEnabled()
    expect(within(well('Employment')).getByText('Status')).toBeInTheDocument()
    expect(within(well('Employment')).getByText('Active')).toBeInTheDocument()
  })

  it('says why Promote is off', () => {
    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder({ blocker: 'Would stand above BOSS — move the line first.' })} active today={TODAY} />)
    expect(within(well('Promotion')).getByRole('button', { name: 'Promote' })).toBeDisabled()
    expect(within(well('Promotion')).getByText('Would stand above BOSS — move the line first.')).toBeInTheDocument()
  })

  it('asks before deactivating, and an inactive person has only Reactivate and no Promotion', () => {
    const { unmount } = render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active today={TODAY} />)
    fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Deactivate' }))
    expect(within(well('Employment')).getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(within(well('Employment')).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    unmount()

    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active={false} today={TODAY} />)
    expect(screen.queryByRole('heading', { level: 2, name: 'Promotion' })).toBeNull()
    expect(within(well('Employment')).getByText('Inactive')).toBeInTheDocument()
    expect(within(well('Employment')).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })
})

// 2026-10-23 — the user: "if the probation is almost end, then it will notification hr acknowledge for further action".
describe('a probation in the Employment well', () => {
  const probation = (over: Partial<TermFacts> = {}): TermFacts => ({
    hireDate: '2026-08-02', months: 3, endsOn: '2026-11-01', ackEnd: null, ackName: null, ackAt: null, ...over,
  })
  const draw = (p: TermFacts | null) =>
    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active probation={p} today={TODAY} />)

  it('reads its period and end; while HR is being told, Acknowledge leads', async () => {
    draw(probation())
    expect(within(well('Employment')).getByText('Probation')).toBeInTheDocument()
    expect(within(well('Employment')).getByText('3 months · ends 1 Nov 2026 · in 9 days')).toBeInTheDocument()
    mocks.acknowledgeProbation.mockResolvedValue({ ok: true, endsOn: '2026-11-01', ackName: 'LI SEAN', ackAt: '2026-10-23T02:00:00Z' })
    await act(async () => {
      fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Acknowledge' }))
    })
    expect(mocks.acknowledgeProbation).toHaveBeenCalledWith('p1')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('no Acknowledge before the reminder, nor once acknowledged — who did it reads under the line', () => {
    const { unmount } = draw(probation({ endsOn: '2026-12-31' }))
    expect(within(well('Employment')).queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    expect(within(well('Employment')).getByRole('button', { name: 'Confirm as permanent' })).toBeInTheDocument()
    unmount()

    draw(probation({ ackEnd: '2026-11-01', ackName: 'LI SEAN', ackAt: '2026-10-23T02:00:00Z' }))
    expect(within(well('Employment')).queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    expect(within(well('Employment')).getByText('Acknowledged by LI SEAN · 23 Oct 2026')).toBeInTheDocument()
  })

  it('Confirm as permanent asks first, then confirms', async () => {
    draw(probation())
    fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Confirm as permanent' }))
    expect(within(well('Employment')).getByText(/as permanent\? Their probation ends here\./)).toBeInTheDocument()
    mocks.confirmProbation.mockResolvedValue({ ok: true })
    await act(async () => {
      fireEvent.click(within(well('Employment')).getAllByRole('button', { name: 'Confirm' })[0])
    })
    expect(mocks.confirmProbation).toHaveBeenCalledWith('p1')
  })

  it('Extend picks 1–3 months and shows the new end; a refusal is said in the well', async () => {
    draw(probation())
    fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Extend' }))
    const by = within(well('Employment')).getByLabelText('Extend by') as HTMLSelectElement
    expect(Array.from(by.options).map(o => o.text)).toEqual(['+ 1 month', '+ 2 months', '+ 3 months'])
    fireEvent.change(by, { target: { value: '2' } })
    // 2 Aug + 5 months − 1 day.
    expect(within(well('Employment')).getByText('Extend it by 2 months — to end 1 Jan 2027?')).toBeInTheDocument()
    mocks.extendProbation.mockResolvedValue({ ok: false, reason: 'Their probation changed since this page was opened — reload it.' })
    await act(async () => {
      fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Extend' }))
    })
    expect(mocks.extendProbation).toHaveBeenCalledWith('p1', 2)
    expect(within(well('Employment')).getByText('Their probation changed since this page was opened — reload it.')).toBeInTheDocument()
  })

  it('off probation, no such line', () => {
    draw(null)
    expect(within(well('Employment')).queryByText('Probation')).toBeNull()
  })

  // Two reminders (2026-10-24 — the user: "need 30 days and 15 days before remind, 2 reminder, then for probation need
  // same as well"): the first opens 30 days before, and its acknowledgement does not answer the second.
  it('Acknowledge from the first reminder — 30 days before — and again at the second, the first’s said under the line', () => {
    const { unmount } = draw(probation({ months: 3, endsOn: '2026-11-17' })) // 25 days: the first
    expect(within(well('Employment')).getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument()
    unmount()

    draw(probation({ ackEnd: '2026-11-01', ackName: 'LI SEAN', ackAt: '2026-10-05T02:00:00Z' })) // the first's, 27 days before
    expect(within(well('Employment')).getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument()
    expect(within(well('Employment')).getByText('30-day reminder acknowledged by LI SEAN · 5 Oct 2026')).toBeInTheDocument()
  })
})

// A contract (2026-10-24): its period and end, and Acknowledge at each reminder — renewing it is the card's own edit.
describe('a contract in the Employment well', () => {
  const contract = (over: Partial<TermFacts> = {}): TermFacts => ({
    hireDate: '2025-11-23', months: 12, endsOn: '2026-11-22', ackEnd: null, ackName: null, ackAt: null, ...over,
  })
  const draw = (c: TermFacts | null) =>
    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active contract={c} today={TODAY} />)

  it('reads its period and end; from 30 days before, Acknowledge — by its own action, and nothing else', async () => {
    draw(contract())
    expect(within(well('Employment')).getByText('Contract')).toBeInTheDocument()
    expect(within(well('Employment')).getByText('12 months · ends 22 Nov 2026 · in 30 days')).toBeInTheDocument()
    expect(within(well('Employment')).queryByRole('button', { name: 'Confirm as permanent' })).toBeNull()
    expect(within(well('Employment')).queryByRole('button', { name: 'Extend' })).toBeNull()
    mocks.acknowledgeContract.mockResolvedValue({ ok: true, endsOn: '2026-11-22', ackName: 'LI SEAN', ackAt: '2026-10-23T02:00:00Z' })
    await act(async () => {
      fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Acknowledge' }))
    })
    expect(mocks.acknowledgeContract).toHaveBeenCalledWith('p1')
    expect(mocks.acknowledgeProbation).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('no Acknowledge before the first reminder, nor once acknowledged; a refusal is said in the well', async () => {
    const { unmount } = draw(contract({ endsOn: '2026-11-23' })) // 31 days
    expect(within(well('Employment')).queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    unmount()

    const again = draw(contract({ ackEnd: '2026-11-22', ackName: 'LI SEAN', ackAt: '2026-10-23T02:00:00Z' }))
    expect(within(well('Employment')).queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    expect(within(well('Employment')).getByText('Acknowledged by LI SEAN · 23 Oct 2026')).toBeInTheDocument()
    again.unmount()

    draw(contract({ endsOn: '2026-10-30' }))
    mocks.acknowledgeContract.mockResolvedValue({ ok: false, reason: 'They are not on a contract any more — reload the page.' })
    await act(async () => {
      fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Acknowledge' }))
    })
    expect(within(well('Employment')).getByText('They are not on a contract any more — reload the page.')).toBeInTheDocument()
  })
})

// Renew (2026-10-24 — the user: "当它已经 expired 之后，到时候按一下 renew，就可以再选一次是几个月，对不对？同时要 attach 一个新的
// contract"): the new contract's first day, its period and its end, and the contract itself — filed as it is renewed.
describe('Renew a contract', () => {
  const TYPES = [
    { id: 'offer', name: 'Offer letter', compulsory: true },
    { id: 'cfs', name: 'Contract for Service', compulsory: false },
  ]
  // Ended 30 Sep 2026, still on it on 23 Oct.
  const contract = (over: Partial<TermFacts> = {}): TermFacts => ({
    hireDate: '2025-10-01', months: 12, endsOn: '2026-09-30', startsOn: '2025-10-01', ackEnd: null, ackName: null, ackAt: null, ...over,
  })
  const draw = (c: TermFacts, renew: { types: typeof TYPES } | null = { types: TYPES }) =>
    render(<PersonChanges personId="p1" personName="TEST STAFF" title="Executive" department="Marketing" ladder={ladder()} active contract={c} renew={renew} today={TODAY} />)
  const pdf = new File(['%PDF'], 'contract-2026.pdf', { type: 'application/pdf' })
  const open = () => {
    fireEvent.click(within(well('Employment')).getByRole('button', { name: 'Renew' }))
    return screen.getByRole('group', { name: 'Renew the contract' })
  }
  const filed = () => {
    mocks.letterTypeOf.mockResolvedValue({ ok: true, id: 'cfs', name: 'Contract for Service' })
    mocks.upload.mockResolvedValue({ ok: true, path: 'letters/p1/u/contract-2026.pdf', fileName: 'contract-2026.pdf', contentType: 'application/pdf', size: 4 })
  }

  it('is offered to whoever may file its new contract, beside Acknowledge — and never without', () => {
    const { unmount } = draw(contract())
    expect(within(well('Employment')).getByRole('button', { name: 'Renew' })).toBeInTheDocument()
    expect(within(well('Employment')).getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument()
    unmount()
    draw(contract(), null)
    expect(within(well('Employment')).queryByRole('button', { name: 'Renew' })).toBeNull()
  })

  it('opens on the day after the end, its period, the end it will have — and the type that says contract', () => {
    draw(contract())
    const form = open()
    expect(within(form).getByLabelText('New contract starts')).toHaveValue('2026-10-01')
    expect(within(form).getByLabelText('Period')).toHaveValue('12')
    expect(within(form).getByText('30 Sep 2027')).toBeInTheDocument()
    expect(within(form).getByLabelText('Letter type')).toHaveValue('cfs')
    fireEvent.change(within(form).getByLabelText('Period'), { target: { value: '24' } })
    expect(within(form).getByText('30 Sep 2028')).toBeInTheDocument()
    expect(within(well('Employment')).queryByRole('button', { name: 'Acknowledge' })).toBeNull()
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Renew the contract' })).toBeNull()
  })

  it('asks for the new contract, and for a first day after this one’s, before anything goes', async () => {
    draw(contract())
    const form = open()
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Renew' }))
    })
    expect(within(form).getByText('Attach the new contract.')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Letter file'), { target: { files: [pdf] } })
    fireEvent.change(within(form).getByLabelText('New contract starts'), { target: { value: '2025-09-01' } })
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Renew' }))
    })
    expect(within(form).getByText('The new contract starts after this one did (1 Oct 2025).')).toBeInTheDocument()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.renewContract).not.toHaveBeenCalled()
  })

  it('puts the contract up, then renews and files it together, and reads again', async () => {
    filed()
    mocks.renewContract.mockResolvedValue({ ok: true, endsOn: '2027-09-30' })
    draw(contract())
    const form = open()
    fireEvent.change(within(form).getByLabelText('Letter file'), { target: { files: [pdf] } })
    expect(within(form).getByText('contract-2026.pdf')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Renew' }))
    })
    expect(mocks.letterTypeOf).toHaveBeenCalledWith(expect.objectContaining({ typeId: 'cfs' }), TYPES)
    expect(mocks.upload).toHaveBeenCalledWith({ letterFor: 'p1' }, pdf)
    expect(mocks.renewContract).toHaveBeenCalledWith({
      staffId: 'p1',
      start: '2026-10-01',
      months: 12,
      endsWas: '2026-09-30',
      letter: { typeId: 'cfs', path: 'letters/p1/u/contract-2026.pdf', fileName: 'contract-2026.pdf', contentType: 'application/pdf', size: 4 },
    })
    expect(mocks.refresh).toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Renew the contract' })).toBeNull()
  })

  it('a refusal is said in the form, which stays open', async () => {
    filed()
    mocks.renewContract.mockResolvedValue({ ok: false, reason: 'Their contract changed since this page was opened — reload it.' })
    draw(contract())
    const form = open()
    fireEvent.change(within(form).getByLabelText('Letter file'), { target: { files: [pdf] } })
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Renew' }))
    })
    expect(within(form).getByText('Their contract changed since this page was opened — reload it.')).toBeInTheDocument()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('a renewed contract reads from its own first day', () => {
    draw(contract({ startsOn: '2026-10-01', endsOn: '2027-09-30' }))
    expect(within(well('Employment')).getByText('12 months · from 1 Oct 2026 · ends 30 Sep 2027 · in 342 days')).toBeInTheDocument()
  })
})
