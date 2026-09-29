import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DoubleClaimBill, DoubleClaimGroup } from '@/lib/commission/double-claims'
import { groupDoubleClaims } from '@/lib/commission/double-claims'
import { explainDoubleClaim, type ClaimBillEvidence } from '@/lib/commission/double-claim-reasons'
import DoubleClaimPanel from './DoubleClaimPanel'

const { dismiss, restore, refresh } = vi.hoisted(() => ({ dismiss: vi.fn(), restore: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../double-claim-actions', () => ({ dismissDoubleClaim: dismiss, restoreDoubleClaim: restore }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

const bill = (billRef: string, orderNo: string, periodMonth: string, extra: Partial<DoubleClaimBill> = {}): DoubleClaimBill => ({
  billRef, orderId: `${orderNo}-id`, orderNo, periodMonth, orderDate: periodMonth.replace(/01$/, '20'),
  staffId: 'ch', employeeName: 'CHEA HUAN', agentName: 'Chea Huan', orderTotal: 8290,
  source: 'erp_sync', paidByRun: false, dismissed: false, ...extra,
})

const hc11366 = (dismissed = false): DoubleClaimGroup[] => groupDoubleClaims([
  bill('HC11366', 'HC11366', '2026-08-01', { source: 'file', dismissed }),
  bill('HC11366', 'HC-SO-2610-001', '2026-09-01', { dismissed, paidByRun: false }),
])

const props = { period: '2026-09-01', subDepartmentId: 'fair', basePath: '/revenue/fair', unavailable: null }

beforeEach(() => {
  vi.clearAllMocks()
  dismiss.mockResolvedValue(2)
  restore.mockResolvedValue(undefined)
  // happy-dom has no dialogs; the browser's confirm() is what the button asks.
  Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true, writable: true })
})
afterEach(cleanup)

describe('DoubleClaimPanel', () => {
  it('says nothing when there is nothing to ask', () => {
    const { container } = render(<DoubleClaimPanel {...props} groups={[]} carried={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows one paper on two bills in two months — which is which, and where each came from', () => {
    render(<DoubleClaimPanel {...props} groups={hc11366()} carried={[]} />)
    const panel = screen.getByRole('region', { name: 'Possible double claims' })
    expect(panel).toHaveTextContent('To check1')
    expect(panel).toHaveTextContent('HC11366on 2 bills in August 2026 and September 2026')
    const rows = within(panel).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      'Aug 2026HC11366CHEA HUANRM 8,290.00Imported',
      'Sep 2026HC-SO-2610-001CHEA HUANRM 8,290.00ERP',
    ])
    expect(within(panel).getByRole('link', { name: 'HC11366' })).toHaveAttribute('href', '/revenue/fair/2026-08-01/orders/HC11366-id')
  })

  it('marking a pair as separate sales asks first, then saves', async () => {
    render(<DoubleClaimPanel {...props} groups={hc11366()} carried={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Checked — separate sales' }))
    expect(window.confirm).toHaveBeenCalledWith('HC11366: these 2 bills are separate sales, not one bill claimed twice?')
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith('fair', 'HC11366'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('an answered pair steps aside but can be asked again', async () => {
    render(<DoubleClaimPanel {...props} groups={hc11366(true)} carried={[]} />)
    expect(screen.getByRole('region', { name: 'Possible double claims' })).toHaveTextContent('To check0')
    expect(screen.queryByRole('table')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 checked — separate sales' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }))
    await waitFor(() => expect(restore).toHaveBeenCalledWith('fair', 'HC11366'))
  })

  it("names the months no run paid whose bills ride into this one — CH's June and July in August", () => {
    render(<DoubleClaimPanel {...props} period="2026-08-01" groups={[]}
      carried={[{ periodMonth: '2026-06-01', bills: 1, value: 3888 }, { periodMonth: '2026-07-01', bills: 9, value: 74026 }]} />)
    const panel = screen.getByRole('region', { name: 'Possible double claims' })
    expect(panel).toHaveTextContent('10 bills carried in from June 2026 and July 2026 · RM 77,914.00')
    expect(panel).toHaveTextContent('computing August 2026 would pay these bills again')
    expect(panel).toHaveTextContent('Jun 2026 · 1 bill · RM 3,888.00')
    expect(panel).toHaveTextContent('Jul 2026 · 9 bills · RM 74,026.00')
  })

  it('says so when the check itself could not run', () => {
    render(<DoubleClaimPanel {...props} groups={[]} carried={[]} unavailable="function revenue_possible_double_claims does not exist" />)
    expect(screen.getByRole('region', { name: 'Possible double claims' }))
      .toHaveTextContent('The check for bills claimed twice could not run: function revenue_possible_double_claims does not exist')
  })

  // As a tab of the month's workbench (2026-09-30), every group says WHY it
  // was flagged and what each bill has been through (user: 我要你全部都写原因).
  describe('in the tab, with the reasons', () => {
    const evidence = (id: string, extra: Partial<ClaimBillEvidence>): ClaimBillEvidence => ({
      orderId: id, customer: null, fair: null, fairSource: null, venue: null, soDate: null, erpOpenedAt: null,
      importFile: null, importedAt: null, paidAmount: 4_100, lines: [], deliveries: [], adjustments: [],
      paidByRun: null, closed: null, ...extra,
    })
    const FORM = "SALARY CLAIM FORM_AUGUST'26.xlsx"
    function explained(dismissed = false) {
      const groups = groupDoubleClaims([
        bill('HC8977', 'HC8977', '2026-08-01', { source: 'file', orderTotal: 13_500, orderDate: '2026-08-10', staffId: 'ethan', employeeName: 'ETHAN', dismissed }),
        bill('HC8977', 'HC-SO-2609-291', '2026-09-01', { orderTotal: 13_500, orderDate: '2026-09-28', staffId: 'ethan', employeeName: 'ETHAN', dismissed }),
      ])
      const byId = new Map([
        ['HC8977-id', evidence('HC8977-id', {
          importFile: FORM, importedAt: '2026-09-26T10:08:58Z',
          lines: [{ code: 'CLAIM FORM', name: 'August claim form — sales amount', qty: 1, amount: 13_500, earns: true }],
        })],
        ['HC-SO-2609-291-id', evidence('HC-SO-2609-291-id', {
          customer: 'Mohd Saifullah bin Rosdi', erpOpenedAt: '2026-09-28T08:48:55Z', soDate: '2026-09-28',
          lines: [{ code: 'AKEMI BULWARK MATT (K)', name: 'AKEMI BULWARK MATTRESS', qty: 1, amount: 13_500, earns: true }],
          deliveries: [{ at: '2026-09-29T15:25:09Z', status: 'applied', message: 'created', month: '2026-09-01' }],
        })],
      ])
      const ctx = { firstPaidMonth: '2026-09-01', cutoverNote: 'June–August paid from the claim forms' }
      return { groups, explanations: Object.fromEntries(groups.map(g => [g.billRef, explainDoubleClaim(g, byId, ctx)])) }
    }

    it('opens each group on its verdict and the reasons for it, then what to do', () => {
      const { groups, explanations } = explained()
      render(<DoubleClaimPanel {...props} groups={groups} carried={[]} explanations={explanations} inTab
        returnTo="/revenue/fair/2026-09-01?view=claims" />)
      const card = screen.getByRole('article', { name: 'Already claimed in August 2026 — HC-SO-2609-291 would pay the same sale again' })
      expect(card).toHaveTextContent('Would pay twice')
      expect(card).toHaveTextContent('2 bills · August 2026 and September 2026 · ETHAN')
      const reasons = within(card).getAllByRole('listitem').slice(0, 4).map(li => li.textContent)
      expect(reasons).toEqual([
        'Paper HC8977 is on 2 bills: HC8977 (August 2026) and HC-SO-2609-291 (September 2026).',
        `HC8977 was already paid on the August 2026 claim form (${FORM}) — RM 13,500.00 under ETHAN.`,
        'HC-SO-2609-291 is an ERP document opened on 28 Sep 2026. Nothing has paid it yet — it is in September 2026’s commission.',
        'Both have the same salesperson (ETHAN), sales value (RM 13,500.00) and deposit (RM 4,100.00 paid).',
      ])
      expect(card).toHaveTextContent('What to do: If it is the same sale, take HC-SO-2609-291 out of September 2026')
      // The month's summary: one group that would pay twice, its sales value at stake.
      const panel = screen.getByRole('region', { name: 'Possible double claims' })
      expect(panel).toHaveTextContent('Would be paid twiceRM 13,500.00')
    })

    it('lays the bills side by side with a match column, and tells each one’s history', () => {
      const { groups, explanations } = explained()
      render(<DoubleClaimPanel {...props} groups={groups} carried={[]} explanations={explanations} inTab
        returnTo="/revenue/fair/2026-09-01?view=claims" />)
      const table = screen.getByRole('table', { name: 'HC8977: the bills side by side' })
      expect(within(table).getAllByRole('columnheader').map(h => h.textContent))
        .toEqual(['Bill', 'HC8977Aug 2026', 'HC-SO-2609-291Sep 2026 · this month', 'Match'])
      expect(within(table).getByRole('row', { name: /^Salesperson/ })).toHaveTextContent('ETHANETHAN✓ Same')
      expect(within(table).getByRole('row', { name: /^Sales value/ })).toHaveTextContent('✓ Same')
      expect(within(table).getByRole('row', { name: /^Customer/ })).toHaveTextContent('? Can’t tell')
      expect(within(table).getByRole('row', { name: /^Date on the bill/ })).toHaveTextContent('≠ Differs49 days apart')
      // A bill opened from here comes back to this tab.
      expect(within(table).getByRole('link', { name: 'HC-SO-2609-291' })).toHaveAttribute('href',
        `/revenue/fair/2026-09-01/orders/HC-SO-2609-291-id?from=${encodeURIComponent('/revenue/fair/2026-09-01?view=claims')}`)
      const history = screen.getByRole('region', { name: 'History of HC-SO-2609-291' })
      expect(within(history).getAllByRole('listitem').map(li => li.textContent)).toEqual([
        '28 Sep 2026, 16:48Opened in the ERP, dated 28 Sep 2026, on paper HC8977.',
        '29 Sep 2026, 23:25Became a sale in the portal, counted in September 2026.',
        'Not paid yet — September 2026’s commission counts it.',
      ])
      expect(screen.getByRole('region', { name: 'History of HC8977' })).toHaveTextContent(
        'Paid: August 2026 was paid from the claim form — the portal pays from September 2026.')
    })

    it('says plainly when nothing this month is claimed twice', () => {
      render(<DoubleClaimPanel {...props} groups={[]} carried={[]} explanations={{}} inTab />)
      expect(screen.getByRole('region', { name: 'Possible double claims' }))
        .toHaveTextContent('No bill of September 2026 shares its paper number with another bill.')
    })

    it('says which part of the history could not be read, and explains the rest', () => {
      const { groups, explanations } = explained()
      render(<DoubleClaimPanel {...props} groups={groups} carried={[]} explanations={explanations} inTab
        evidenceUnavailable="Could not read the ERP’s deliveries (fetch failed)." />)
      expect(screen.getByRole('region', { name: 'Possible double claims' })).toHaveTextContent(
        'Some of the history behind these bills could not be read — Could not read the ERP’s deliveries (fetch failed). The reasons below use what could.')
    })

    it('a checked group keeps its reasons, under Show checked', () => {
      const { groups, explanations } = explained(true)
      render(<DoubleClaimPanel {...props} groups={groups} carried={[]} explanations={explanations} inTab />)
      expect(screen.queryByRole('article')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Show 1 checked — separate sales' }))
      expect(screen.getByRole('article')).toHaveTextContent('Why it is here')
      expect(screen.getByRole('button', { name: 'Ask again' })).toBeVisible()
    })
  })
})
