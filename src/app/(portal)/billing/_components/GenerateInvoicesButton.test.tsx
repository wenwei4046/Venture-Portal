import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'

// 2026-10-10 — "Generate Marketing invoices" moved from the Marketing
// projects head into the handoff's "+ Create Invoice ▾" menu. From a menu the
// confirmation cannot sit where the button was, so it arrives as a dialog:
// confirm, then what was generated, then Close.

const { generateMonthlyInvoices } = vi.hoisted(() => ({ generateMonthlyInvoices: vi.fn() }))
vi.mock('../actions', () => ({ generateMonthlyInvoices }))

import GenerateInvoicesButton from './GenerateInvoicesButton'

beforeEach(() => vi.clearAllMocks())

describe('GenerateInvoicesButton from a menu', () => {
  it('arrives as an open dialog, generates on Yes, says what it made, and closes', async () => {
    generateMonthlyInvoices.mockResolvedValue({ generated: 2, skipped: 1, errors: [], period: '2026-09-01', mode_counts: { marketing_project: 2 } })
    render(<GenerateInvoicesButton currentPeriod="2026-09-01" modes={['marketing_project']} label="Generate Marketing invoices" autoOpen hideTrigger />)
    const dialog = screen.getByRole('dialog', { name: 'Generate Marketing invoices' })
    expect(dialog).toHaveTextContent('September 2026')
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, generate' }))
    })
    const fd = generateMonthlyInvoices.mock.calls[0][0] as FormData
    expect(fd.get('period_month')).toBe('2026-09-01')
    expect(fd.get('modes')).toBe('marketing_project')
    expect(screen.getByRole('dialog')).toHaveTextContent('2 generated, 1 preserved')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Cancel closes it without generating', () => {
    render(<GenerateInvoicesButton currentPeriod="2026-09-01" modes={['marketing_project']} label="Generate Marketing invoices" autoOpen hideTrigger />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(generateMonthlyInvoices).not.toHaveBeenCalled()
  })
})
