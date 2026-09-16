import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import OpenBillSection from './OpenBillSection'
import {
  summariseOpenBill,
  type OpenBillOrderInput,
} from '@/lib/commission/open-bill-summary'

function order(over: Partial<OpenBillOrderInput> & { orderId: string }): OpenBillOrderInput {
  return {
    orderNo: `HC-SO-${over.orderId}`,
    orderDate: '2026-09-03',
    eventDate: '2026-09-03',
    customerName: 'WONG LIEN TAA',
    venue: 'SPICE ARENA',
    venueGroupName: null,
    staffId: 'chea',
    employeeName: 'CHEA HUAN',
    agentName: 'CHEA',
    orderTotal: 9_500,
    commissionable: 9_500,
    depositMet: true,
    openBillRank: 1,
    openBillAuto: false,
    ...over,
  }
}

const RATES = new Map([
  [1, 0.5],
  [2, 0.4],
  [3, 0.3],
])

function view(
  orders: OpenBillOrderInput[],
  paid: Array<[string, number]>,
  runStatus: 'draft' | 'computed' | 'applied' | 'locked' | null,
) {
  return render(
    <OpenBillSection
      summary={summariseOpenBill(orders, { paidByOrder: new Map(paid), rates: RATES })}
      ordersPath="/revenue/fair/2026-09-01/orders"
      queuePath="/revenue/fair/2026-09-01/open-bill"
      runStatus={runStatus}
      fromFeed
    />,
  )
}

describe('OpenBillSection', () => {
  it('states the uplift each rank earns and what it paid', () => {
    view([order({ orderId: '1' }), order({ orderId: '2', openBillRank: 3 })], [['1', 350], ['2', 90]], 'computed')

    const rank = screen.getByText('1st bill of the day').closest('tr')!
    expect(within(rank).getByText('+50% of its commission')).toBeVisible()
    expect(within(rank).getByText('RM 350.00')).toBeVisible()

    const foot = screen.getByText("This month's picks").closest('tr')!
    expect(within(foot).getByText('RM 440.00')).toBeVisible()
  })

  it('reports what the run paid on bills carried in from earlier months', () => {
    view([order({ orderId: '1' })], [['1', 350], ['aug', 150]], 'computed')
    expect(screen.getByText(/This run paid/)).toHaveTextContent(
      "RM 500.00 of Open Bill in all: RM 350.00 on this month's picks and RM 150.00 on 1 bill carried in from earlier months",
    )
    // The salesperson total is the run's, not just this month's bills.
    expect(screen.getByText('Open Bill in this run').closest('tr')).toHaveTextContent('RM 500.00')
  })

  it('quotes no money at all for a month nobody has computed', () => {
    view([order({ orderId: '1' })], [], null)
    expect(screen.getByText(/Nothing has been computed for this month/)).toBeVisible()
    expect(screen.queryByText(/Open Bill in this run/)).toBeNull()
    const foot = screen.getByText("This month's picks").closest('tr')!
    // The last cell is Extra paid — a dash, never a zero the run never agreed to.
    expect(foot.cells[foot.cells.length - 2]).toHaveTextContent('—')
  })

  it('draws a suggestion dashed and a decision solid', () => {
    const { container } = view(
      [order({ orderId: '1', openBillAuto: true }), order({ orderId: '2', openBillRank: 2 })],
      [],
      null,
    )
    const bills = container.querySelectorAll('table')[2]
    const guess = within(bills as HTMLElement).getByText('1st')
    const decided = within(bills as HTMLElement).getByText('2nd')
    expect(guess.className).toContain('border-dashed')
    expect(decided.className).toContain('bg-accent')
    expect(screen.getByText(/are still the importer/)).toHaveTextContent('1 of 2')
  })

  it('marks a bill the deposit gate is holding rather than showing it as unpaid', () => {
    view([order({ orderId: '1', depositMet: false })], [], 'computed')
    expect(screen.getByText('Held')).toBeVisible()
    expect(screen.getByText(/still waiting on a deposit/)).toBeVisible()
  })

  it('says which bills the run has never seen, because that is the one to act on', () => {
    view(
      [
        order({ orderId: 'late' }),
        order({ orderId: 'nobase', openBillRank: 2, commissionable: 0 }),
        order({
          orderId: 'nobody',
          openBillRank: 3,
          staffId: null,
          employeeName: null,
          agentName: 'WHO',
        }),
      ],
      [],
      'computed',
    )
    expect(screen.getByText('Not in this run')).toBeVisible()
    expect(screen.getByText('No base')).toBeVisible()
    expect(screen.getByText('Nobody to pay')).toBeVisible()
    expect(screen.getByText(/not in this run at all/)).toBeVisible()
  })

  it('says so plainly when the month has no picks', () => {
    view([order({ orderId: '1', openBillRank: null })], [], 'computed')
    expect(screen.getByText('No bill of this month carries a pick.')).toBeVisible()
    expect(screen.queryByText('By salesperson')).toBeNull()
  })
})
