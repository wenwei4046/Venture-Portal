import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../actions', () => ({ submitEscalation: vi.fn() }))

import EscalateButton from './EscalateButton'

// 2026-10-10 — the handoff: Escalate is a bordered button beside the row's
// others (it was an "Escalate →" link); it still asks before it escalates.
describe('EscalateButton', () => {
  it('is a bordered button that asks first', () => {
    render(<EscalateButton overdueId="o1" />)
    const button = screen.getByRole('button', { name: 'Escalate' })
    expect(button).toHaveClass('sch-row-btn')
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Confirm escalation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})
