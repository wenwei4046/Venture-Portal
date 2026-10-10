import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../actions', () => ({ exportLoansCSV: vi.fn() }))

import ExportCSVButton from './ExportCSVButton'

// 2026-10-10 — the handoff: Export CSV is one of the head's sheet buttons,
// beside BA Calculator and Repayment Schedule.
describe('Export CSV', () => {
  it('is a sheet button at the head', () => {
    render(<ExportCSVButton />)
    const button = screen.getByRole('button', { name: 'Export CSV' })
    expect(button).toHaveClass('btn-quiet-sheet')
    expect(button).not.toHaveClass('btn-secondary')
  })
})
