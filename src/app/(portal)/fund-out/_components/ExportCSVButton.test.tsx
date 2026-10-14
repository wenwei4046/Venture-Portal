import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const exportLoansCSV = vi.fn()
const flash = vi.fn()
vi.mock('../actions', () => ({ exportLoansCSV: (...a: unknown[]) => exportLoansCSV(...a) }))
vi.mock('@/components/hrv/toast', () => ({ flash: (...a: unknown[]) => flash(...a) }))

import ExportCSVButton from './ExportCSVButton'

// 2026-10-15 — the Finance revamp v2 (D12): Export CSV is one of the hub
// head's white buttons; a refusal is said in the toast (the head has no room).
describe('Export CSV', () => {
  it('is a head button, not the primary', () => {
    render(<ExportCSVButton />)
    const button = screen.getByRole('button', { name: 'Export CSV' })
    expect(button).not.toHaveAttribute('data-kind', 'primary')
    expect(button).not.toHaveClass('btn-quiet-sheet')
  })

  it('says a refusal in the toast', async () => {
    exportLoansCSV.mockRejectedValueOnce(new Error('No loans to export'))
    render(<ExportCSVButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(flash).toHaveBeenCalledWith('No loans to export'))
  })
})
