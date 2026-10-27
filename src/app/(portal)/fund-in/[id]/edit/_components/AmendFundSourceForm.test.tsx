import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { amendWindow, type AmendFacts } from '@/lib/fund-amend'

// Amend terms in English, both ways open to Finance (2026-10-27, the mockup terms-first-month-mockup.html — "照这个样稿做：
// 名字用 “From the first instalment” 和 “From a later month”，Finance 提交时不改 Repayment start"). Chai Meng Keat's
// 5,000 received 26 Mar 2026 at 0%, no fixed term: its first instalment April, so a later month starts May.

const mocks = vi.hoisted(() => ({ amendFundSource: vi.fn(), amendFundSourceFrom: vi.fn() }))
vi.mock('../../../actions', () => ({ amendFundSource: mocks.amendFundSource, amendFundSourceFrom: mocks.amendFundSourceFrom }))

import AmendFundSourceForm from './AmendFundSourceForm'

const FACTS: AmendFacts = {
  party: 'Chai Meng Keat (MK)',
  moneyDate: '2026-03-26',
  firstDue: '2026-04-26',
  window: amendWindow('2026-04', null),
  principal: 5000,
  paidByMonth: {},
  currentBase: 5000,
}
const PROPS = { id: 'fs-mk', ratePct: '0', lockInMonths: '', repaymentDate: '2026-04-26', compound: false, notes: '', nextMonth: '2026-11', facts: FACTS }
const sent = (fn: { mock: { calls: unknown[][] } }) => Object.fromEntries((fn.mock.calls[0][0] as FormData).entries())

beforeEach(() => {
  vi.clearAllMocks()
  mocks.amendFundSource.mockResolvedValue(undefined)
  mocks.amendFundSourceFrom.mockResolvedValue(undefined)
})

describe('Amend terms, for Finance', () => {
  it('offers both ways and says where the terms stand', () => {
    render(<AmendFundSourceForm {...PROPS} direct={false} />)
    expect(screen.getByRole('radio', { name: /From the first instalment/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /From a later month/ })).toBeChecked()
    expect(screen.getByTestId('amend-facts')).toHaveTextContent(
      'Received 26 Mar 2026 · first instalment 26 Apr 2026 · the terms in force run from the first instalment (Apr 2026) and have never been changed.',
    )
    expect(screen.getByTestId('amend-earliest')).toHaveTextContent(
      'Earliest May 2026. Apr 2026 is the first instalment — to change from there, choose “From the first instalment” above.',
    )
    expect(screen.getByLabelText('Effective from')).toHaveAttribute('min', '2026-05')
    expect(screen.getByLabelText('Effective from')).toHaveValue('2026-11')
    expect(screen.getByRole('button', { name: 'Submit to the Principal' })).toBeInTheDocument()
  })

  it('a later month: the interest charged on one of three amounts, each said', () => {
    render(<AmendFundSourceForm {...PROPS} direct={false} />)
    const basis = screen.getByTestId('interest-basis')
    expect(basis).toHaveTextContent('What is still owed when it starts')
    expect(basis).toHaveTextContent('RM 5,000.00 — the principal still owed on 1 Nov 2026')
    expect(basis).toHaveTextContent('The original amount')
    expect(basis).toHaveTextContent('The same amount as now')
    expect(basis).toHaveTextContent('On this deal all three are RM 5,000.00.')
  })

  it('files the whole terms from the first instalment — the rate and why, never the repayment start', async () => {
    render(<AmendFundSourceForm {...PROPS} direct={false} />)
    fireEvent.click(screen.getByRole('radio', { name: /From the first instalment/ }))
    expect(screen.queryByLabelText('Repayment start')).toBeNull()
    expect(screen.getByText('As set under Repayment settings (first instalment 26 Apr 2026)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Rate (% a month)'), { target: { value: '0.833' } })
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'agreed from the start' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.amendFundSource).toHaveBeenCalled())
    expect(sent(mocks.amendFundSource)).toEqual({ fund_source_id: 'fs-mk', cost_rate_percent: '0.833', reason: 'agreed from the start' })
    expect(mocks.amendFundSourceFrom).not.toHaveBeenCalled()
  })

  it('a deal changed before names the choice by when its terms began', () => {
    render(<AmendFundSourceForm {...PROPS} direct={false} facts={{ ...FACTS, window: amendWindow('2026-04', '2026-08-01') }} />)
    expect(screen.getByRole('radio', { name: /From when these terms began/ })).toBeInTheDocument()
    expect(screen.getByTestId('amend-earliest')).toHaveTextContent('Earliest Sep 2026. Aug 2026 is when these terms began')
  })
})

describe('Amend terms, for the Principal', () => {
  it('saves the whole terms at once, the repayment start with them', () => {
    render(<AmendFundSourceForm {...PROPS} direct />)
    fireEvent.click(screen.getByRole('radio', { name: /From the first instalment/ }))
    expect(screen.getByLabelText('Repayment start')).toHaveValue('2026-04-26')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('applies a later month at once', () => {
    render(<AmendFundSourceForm {...PROPS} direct />)
    expect(screen.getByRole('button', { name: 'Apply from that month' })).toBeInTheDocument()
  })
})
