import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { amendWindow, type AmendFacts } from '@/lib/fund-amend'

// Amend terms in English, both ways open to Finance (2026-10-27, the mockup terms-first-month-mockup.html — "照这个样稿做：
// 名字用 “From the first instalment” 和 “From a later month”，Finance 提交时不改 Repayment start"). Chai Meng Keat's
// 5,000 received 26 Mar 2026 at 0%, no fixed term: its first instalment April, so a later month starts May. Since the
// same day's second mockup (fund-forms-desktop-mockup.html — "分块 OK … 连同 Repayment type 一起"): the parts in cards,
// the principal a Repayment type chosen first — BI#7's January and October as one change — and the schedule beside it.

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

// BI#7 — Lim Wei Liang's 60,000 from 5 Apr 2025 at 0.5% over 60, 1,000 repaid each month from April 2025.
const PAID_2025: Record<string, number> = Object.fromEntries(['2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12'].map((m) => [m, 1000]))
const BI7: AmendFacts = {
  party: 'Lim Wei Liang (WL)',
  moneyDate: '2025-04-05',
  firstDue: '2025-04-05',
  window: amendWindow('2025-04', null),
  principal: 60000,
  paidByMonth: PAID_2025,
  currentBase: 60000,
}
const BI7_PROPS = { id: 'fs-bi7', ratePct: '0.5', lockInMonths: '60', repaymentDate: '2025-04-05', compound: false, notes: '[BI#7]', nextMonth: '2026-01', facts: BI7 }

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

  it('lays the parts out as cards, in order', () => {
    render(<AmendFundSourceForm {...PROPS} direct={false} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'When the new terms start',
      'Rate',
      'Repayment typeNew',
      'Interest is charged on',
      'Reason',
    ])
  })

  it('a later month: amounts that come to the same figure are one choice, saying the interest a month', () => {
    render(<AmendFundSourceForm {...PROPS} direct={false} />)
    const basis = screen.getByTestId('interest-basis')
    expect(within(basis).getAllByRole('radio')).toHaveLength(1)
    expect(basis).toHaveTextContent('What is owed — the same as the original amount and the amount now')
    expect(basis).toHaveTextContent('RM 5,000.00 → RM 0.00 a month')
  })

  it('BI#7: what is owed in January, or the original amount as now — each with its interest a month', () => {
    render(<AmendFundSourceForm {...BI7_PROPS} direct={false} />)
    fireEvent.change(screen.getByLabelText('Rate (% a month)'), { target: { value: '0.833' } })
    const basis = screen.getByTestId('interest-basis')
    expect(within(basis).getAllByRole('radio')).toHaveLength(2)
    expect(basis).toHaveTextContent('What is still owed on 1 Jan 2026RM 51,000.00 → RM 424.83 a month')
    expect(basis).toHaveTextContent('The original amount, as nowRM 60,000.00 → RM 499.80 a month')
  })

  it('no repayment type chosen keeps the principal as it is — no box, nothing sent for it', async () => {
    render(<AmendFundSourceForm {...BI7_PROPS} direct={false} />)
    expect(screen.queryByLabelText('Principal a month (RM)')).toBeNull()
    expect(screen.getByTestId('schedule-preview')).toHaveTextContent('No repayment type chosen — the principal stays as it is now.')
    fireEvent.change(screen.getByLabelText('Rate (% a month)'), { target: { value: '0.833' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.amendFundSourceFrom).toHaveBeenCalled())
    expect(sent(mocks.amendFundSourceFrom)).toEqual({ fund_source_id: 'fs-bi7', cost_rate_percent: '0.833', effective_from: '2026-01' })
  })

  it('BI#7 as one change: 1,000 a month from January, no fixed term from October', async () => {
    render(<AmendFundSourceForm {...BI7_PROPS} direct={false} />)
    fireEvent.change(screen.getByLabelText('Rate (% a month)'), { target: { value: '0.833' } })
    fireEvent.click(screen.getByRole('radio', { name: /A fixed amount a month/ }))
    fireEvent.change(screen.getByLabelText('Principal a month (RM)'), { target: { value: '1,000' } })
    expect(screen.getByTestId('repayment-worked')).toHaveTextContent('51 months to clear RM 51,000.00 — the last in Mar 2030.')
    fireEvent.change(screen.getByLabelText(/No fixed term from/), { target: { value: '2026-10' } })
    expect(screen.getByTestId('repayment-worked')).toHaveTextContent(
      'RM 1,000.00 a month, Jan 2026 – Sep 2026 — 9 months. From Oct 2026 no principal falls due; RM 42,000.00 is still owed then, with no fixed term.',
    )
    const preview = within(screen.getByTestId('schedule-preview'))
    expect(preview.getByText('Jan 2026 – Sep 2026').closest('tr')).toHaveTextContent('Jan 2026 – Sep 20261,000.00424.831,424.83')
    expect(preview.getByText('From Oct 2026').closest('tr')).toHaveTextContent('From Oct 2026—424.83424.83')
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '0.833% from January, 1,000 a month until September' } })
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.amendFundSourceFrom).toHaveBeenCalled())
    expect(sent(mocks.amendFundSourceFrom)).toEqual({
      fund_source_id: 'fs-bi7',
      cost_rate_percent: '0.833',
      effective_from: '2026-01',
      principal_per_month: '1000',
      open_from: '2026-10',
      reason: '0.833% from January, 1,000 a month until September',
    })
  })

  it('a number of months left, and none — no fixed term — as before', async () => {
    render(<AmendFundSourceForm {...BI7_PROPS} direct={false} />)
    fireEvent.click(screen.getByRole('radio', { name: /Over a number of months/ }))
    fireEvent.change(screen.getByLabelText('Number of months'), { target: { value: '51' } })
    expect(screen.getByTestId('repayment-worked')).toHaveTextContent('RM 1,000.00 a month (RM 51,000.00 ÷ 51) — the last in Mar 2030.')
    fireEvent.click(screen.getByRole('radio', { name: /None — no fixed term/ }))
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.amendFundSourceFrom).toHaveBeenCalled())
    expect(sent(mocks.amendFundSourceFrom)).toEqual({ fund_source_id: 'fs-bi7', effective_from: '2026-01', no_fixed_term: 'on' })
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

  it('the whole terms at a fixed amount a month: the box opens on what the deal has, and the amount is sent', async () => {
    render(<AmendFundSourceForm {...PROPS} principalPerMonth="500" direct={false} />)
    fireEvent.click(screen.getByRole('radio', { name: /From the first instalment/ }))
    fireEvent.click(screen.getByRole('radio', { name: /A fixed amount a month/ }))
    expect(screen.getByLabelText('Principal a month (RM)')).toHaveValue('500.00')
    fireEvent.change(screen.getByLabelText('Principal a month (RM)'), { target: { value: '1,000' } })
    expect(screen.getByTestId('repayment-worked')).toHaveTextContent('5 months to clear RM 5,000.00 — the last in Aug 2026.')
    fireEvent.submit(document.querySelector('form')!)
    await waitFor(() => expect(mocks.amendFundSource).toHaveBeenCalled())
    expect(sent(mocks.amendFundSource)).toEqual({ fund_source_id: 'fs-mk', principal_per_month: '1000' })
  })

  it('holds a box that does not work out yet, and says why', async () => {
    render(<AmendFundSourceForm {...BI7_PROPS} direct={false} />)
    fireEvent.click(screen.getByRole('radio', { name: /A fixed amount a month/ }))
    fireEvent.change(screen.getByLabelText('Principal a month (RM)'), { target: { value: '100' } })
    expect(screen.getByTestId('repayment-worked')).toHaveTextContent('At RM 100.00 a month it takes 510 months — the most is 120.')
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('At RM 100.00 a month it takes 510 months — the most is 120.', { selector: 'div' })).toBeInTheDocument()
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
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('applies a later month at once', () => {
    render(<AmendFundSourceForm {...PROPS} direct />)
    expect(screen.getByRole('button', { name: 'Apply from that month' })).toBeInTheDocument()
  })
})
