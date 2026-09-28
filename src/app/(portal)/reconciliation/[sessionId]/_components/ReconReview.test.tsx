import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReconReview from './ReconReview'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('../../actions', () => ({
  contraBookLines: vi.fn(),
  contraStatementLines: vi.fn(),
  dissolveGroup: vi.fn(),
  manualMatch: vi.fn(),
  setLineIgnored: vi.fn(),
  unmatchLine: vi.fn(),
}))

const line = (id: string, amount: number, matchKind: string | null) => ({
  id,
  date: '2026-08-04',
  description: `line ${id}`,
  amount,
  matchKind,
})

function setup(kinds: Array<string | null>) {
  const statementLines = kinds.map((k, i) => line(`l${i}`, 100 + i, k))
  return render(
    <ReconReview
      sessionId="s1"
      periodMonth="2026-08-01"
      statementLines={statementLines}
      groups={statementLines.filter((l) => l.matchKind === 'auto' || l.matchKind === 'manual').map((l) => ({
        id: `g-${l.id}`,
        statementLineIds: [l.id],
        journalLineIds: [`j-${l.id}`],
      }))}
      contraGroups={[]}
      unmatchedBook={[]}
      bookInfo={{}}
    />,
  )
}

describe('ReconReview summary tiles', () => {
  it('counts ignored lines as cleared, with the split underneath', () => {
    // 2 matched + 2 ignored out of 5 → 4/5 cleared, 1 still open.
    setup(['auto', 'manual', 'ignored', 'ignored', null])
    expect(screen.getByText('4 / 5')).toBeInTheDocument()
    expect(screen.getByText('2 matched · 2 ignored')).toBeInTheDocument()
    const openTile = screen.getByText('Statement unmatched').parentElement!
    expect(openTile.textContent).toContain('1')
  })

  it('shows no split line when nothing is ignored', () => {
    setup(['auto', null])
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.queryByText(/ignored/)).toBeNull()
  })

  // 2026-09-28: a bank charge the bank waived cancels on the statement alone.
  it('counts statement-side contra lines as cleared and lists the group', () => {
    const lines = [line('l0', -1.6, 'contra'), line('l1', 1.6, 'contra'), line('l2', 500, 'auto')]
    render(
      <ReconReview
        sessionId="s1"
        periodMonth="2026-08-01"
        statementLines={lines}
        groups={[{ id: 'g1', statementLineIds: ['l2'], journalLineIds: ['j2'] }]}
        contraGroups={[]}
        statementContraGroups={[{ id: 'c1', statementLineIds: ['l0', 'l1'] }]}
        unmatchedBook={[]}
        bookInfo={{}}
      />,
    )
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getByText('1 matched · 2 contra')).toBeInTheDocument()
    expect(screen.getByText('Contra — bank charge waived (1)')).toBeInTheDocument()
  })
})
