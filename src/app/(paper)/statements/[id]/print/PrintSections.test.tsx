import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { HandoffSections } from './PrintSections'

// 2026-10-10 — the handoff's printed statement: "A · Invoice Items
// (Billable)" in a green box tagged "<CO> owes HV · <CO> → HV", "B · Contra
// Items (Non-Billable)" in a red box tagged "HV owes <CO> · HV → <CO> ·
// deducted", and the net with its direction — "Net Payable · <company> pays
// HOUZS Venture" over "A x − B y = net · why".

const lines = {
  invoiceLines: [
    { id: 'l1', category: 'HR Pool', description: 'HR shared service — Oct', amount: 3800 },
    { id: 'l2', category: 'Rent', description: null, amount: 1200 },
  ],
  contraLines: [{ id: 'c1', category: 'Loan Interest', description: 'Interest on CAR deposit — Oct 2026', amount: 1200 }],
}

describe('the printed statement, the handoff’s way', () => {
  it('boxes the invoice items green as what the company owes HV, the contra red as what is deducted', () => {
    render(<HandoffSections company="Carres" code="CAR" {...lines} totalInvoice={5000} totalContra={1200} net={3800} />)
    const a = document.querySelector('.bil-ps-box.a') as HTMLElement
    expect(within(a).getByRole('heading', { level: 2 })).toHaveTextContent('A · Invoice Items (Billable)')
    expect(a).toHaveTextContent('CAR owes HV · CAR → HV')
    expect(a).toHaveTextContent('HR shared service — Oct')
    expect(within(a).getByText('Subtotal Invoice (A)').closest('tr')).toHaveTextContent('5,000.00')
    const b = document.querySelector('.bil-ps-box.b') as HTMLElement
    expect(within(b).getByRole('heading', { level: 2 })).toHaveTextContent('B · Contra Items (Non-Billable)')
    expect(b).toHaveTextContent('HV owes CAR · HV → CAR · deducted')
    expect(within(b).getByText('Subtotal Contra (B)').closest('tr')).toHaveTextContent('(1,200.00)')
  })

  it('says who pays whom on the net line, and why', () => {
    render(<HandoffSections company="Carres" code="CAR" {...lines} totalInvoice={5000} totalContra={1200} net={3800} />)
    const net = document.querySelector('.bil-ps-net') as HTMLElement
    expect(net).toHaveTextContent('Net Payable · Carres pays HOUZS Venture')
    expect(net).toHaveTextContent('A 5,000.00 − B 1,200.00 = 3,800.00 · Invoices are more than contra — the balance is due to HV.')
    expect(within(net).getByText('RM 3,800.00')).toHaveClass('pos')
  })

  it('turns the other way when the contra is the larger, and says when a side is empty', () => {
    render(<HandoffSections company="2990" code="2990" invoiceLines={[]} contraLines={lines.contraLines} totalInvoice={0} totalContra={4400} net={-4400} />)
    expect(screen.getByText('No invoice items this period.')).toBeInTheDocument()
    const net = document.querySelector('.bil-ps-net') as HTMLElement
    expect(net).toHaveTextContent('Net Credit · HOUZS Venture pays 2990')
    expect(net).toHaveTextContent('A 0.00 − B 4,400.00 = −4,400.00 · Contra (interest HV owes you) is more than the invoices — HV owes you the balance.')
    expect(within(net).getByText('RM 4,400.00')).toHaveClass('neg')
  })
})
