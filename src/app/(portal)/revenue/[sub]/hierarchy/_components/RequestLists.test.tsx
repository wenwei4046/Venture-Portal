import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SubDeptRequest } from '@/lib/commission/sales-group-requests'
import ReplacementList from './ReplacementList'

// Sales Groups' Replacement list (2026-10-10, the HR revamp): rows in the
// order the handoff draws them, a drawer of facts and history, and the way to
// Member services where they are decided. The Waiting list has its own file.

const req = (over: Partial<SubDeptRequest>): SubDeptRequest =>
  ({ id: 'r', requestNo: null, kind: 'waiting', status: 'waiting', createdAt: '2026-10-01T00:00:00Z', submittedAt: null, submittedBy: null,
    newPerson: null, contact: null, start: null, signature: null, original: null, destination: null, replacementSource: null,
    effective: null, reason: null, target: null, acceptedAt: null, events: [], ...over })

afterEach(cleanup)

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
