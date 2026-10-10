import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SubDeptRequest } from '@/lib/commission/sales-group-requests'
import WaitingList from './WaitingList'
import ReplacementList from './ReplacementList'

// Sales Groups' Waiting list and Replacement list (2026-10-10, the HR revamp):
// rows in the order the handoff draws them, a drawer of facts and history,
// and the way to Member services where they are decided.

const req = (over: Partial<SubDeptRequest>): SubDeptRequest =>
  ({ id: 'r', requestNo: null, kind: 'waiting', status: 'waiting', createdAt: '2026-10-01T00:00:00Z', submittedAt: null, submittedBy: null,
    newPerson: null, contact: null, start: null, signature: null, original: null, destination: null, replacementSource: null,
    effective: null, reason: null, target: null, acceptedAt: null, events: [], ...over })

afterEach(cleanup)

describe('WaitingList', () => {
  const rows = [
    req({ id: 'daniel', requestNo: 'RQ-2610-004', newPerson: 'Daniel Lee', contact: '016-221 0457', submittedBy: 'STANLEY', start: '2026-10-20', acceptedAt: '2026-10-04T02:00:00Z' }),
    req({
      id: 'amelia', requestNo: 'RQ-2609-012', newPerson: 'Amelia Tan', contact: '012-345 6789', submittedBy: 'CHEA HUAN', start: '2026-09-11',
      signature: 'Amelia Tan', acceptedAt: '2026-09-10T02:00:00Z',
      events: [
        { to: 'submitted', at: '2026-09-09T02:00:00Z', note: null, by: 'CHEA HUAN' },
        { to: 'waiting', at: '2026-09-10T02:00:00Z', note: null, by: 'HR' },
      ],
    }),
    req({ id: 'pending', status: 'submitted', newPerson: 'Siti Aisyah' }),
  ]

  it('numbers the accepted applicants in the order they were accepted', () => {
    render(<WaitingList rows={rows} subDeptName="Fair" />)
    const list = screen.getAllByRole('row').slice(1).map(r => [within(r).getAllByRole('cell')[0].textContent, r.querySelector('div')?.textContent])
    expect(list.map(([pos]) => pos)).toEqual(['#1', '#2'])
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Amelia Tan')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('RQ-2609-012 · 012-345 6789')
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('11 Sep 2026')
    expect(screen.queryByText('Siti Aisyah')).toBeNull()
  })

  it('opens an applicant’s facts and action history, and Member services for the decisions', () => {
    render(<WaitingList rows={rows} subDeptName="Fair" />)
    fireEvent.click(screen.getAllByRole('row')[1])
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent("#1 of 2 on Fair's waiting list")
    expect(drawer).toHaveTextContent('Revenue · Fair')
    expect(drawer).toHaveTextContent('Accepted onto the waiting list')
    expect(within(drawer).getByRole('link', { name: 'Open in Member services' })).toHaveAttribute('href', '/member-admin?request=amelia')
  })

  it('says so when nobody is on the list', () => {
    render(<WaitingList rows={[]} subDeptName="Fair" />)
    expect(screen.getByText("Nobody is on Fair's waiting list.")).toBeInTheDocument()
  })
})

describe('ReplacementList', () => {
  const rows = [
    req({ id: 'louis', kind: 'replacement', status: 'submitted', requestNo: 'RQ-2610-009', original: 'LOUIS', replacementSource: 'vacancy',
      destination: 'resignation', effective: '2026-10-31', submittedBy: 'KAR JUN', submittedAt: '2026-10-09T00:00:00Z', reason: 'Resigning at month end' }),
    req({ id: 'marcus', kind: 'replacement', status: 'executed', requestNo: 'RQ-2610-001', original: 'MARCUS', newPerson: 'Ryan Tan', replacementSource: 'new',
      destination: 'member_exit', effective: '2026-10-08', submittedBy: 'KAR JUN', submittedAt: '2026-10-01T00:00:00Z' }),
  ]

  it('lists every replacement with its arrangement and where it stands', () => {
    render(<ReplacementList rows={rows} subDeptName="Fair" />)
    const [first, second] = screen.getAllByRole('row').slice(1)
    expect(first).toHaveTextContent('MARCUS → Ryan Tan')
    expect(first).toHaveTextContent('Leave this department only')
    expect(first).toHaveTextContent('Completed')
    expect(second).toHaveTextContent('LOUIS → seat released')
    expect(second).toHaveTextContent('31 Oct 2026')
    expect(second).toHaveTextContent('Pending review')
  })

  it('opens the replacement’s facts, and Review in Member services', () => {
    render(<ReplacementList rows={rows} subDeptName="Fair" />)
    fireEvent.click(screen.getAllByRole('row')[2])
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('LOUIS → seat released')
    expect(drawer).toHaveTextContent('Release the position without a replacement')
    expect(drawer).toHaveTextContent('Resigning at month end')
    expect(within(drawer).getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/member-admin?request=louis')
  })
})
