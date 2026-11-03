import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { sellerCheckFromRow, type SellerCheck } from '@/lib/commission/seller-checks'
import SellerChecksPanel, { checkStatus } from './SellerChecksPanel'

const { answer, answerMove, refresh } = vi.hoisted(() => ({ answer: vi.fn(), answerMove: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../seller-check-actions', () => ({ answerSellerCheck: answer, answerSellerMove: answerMove }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))

// As `revenue_seller_checks` answers it (tests/member-sql/validate-whose-sale.mjs): SHAWN re-keyed STEPHY's HC12110.
const check = (over: Record<string, unknown> = {}): SellerCheck => sellerCheckFromRow({
  orderId: 'o-241', orderNo: 'HC-SO-2610-241', refNo: 'HC12110', orderDate: '2026-10-20', periodMonth: '2026-10-01',
  customer: 'MS CHAN', total: 7794, staffId: 'shawn', staffName: 'SHAWN', kind: 'paper', status: 'waiting',
  evidence: {
    orders: [{ source: 'erp', docNo: 'HC-SO-008712', papers: ['HC12110'], soldOn: '2025-10-22', month: null, seller: 'STEPHY',
      sellerLeft: true, handledBySeller: true, total: 7794, cancelled: false }],
    booth: null,
  },
  sellerName: 'STEPHY', askedAt: '2026-10-30T17:00:00Z', decidedByName: null, decidedAt: null, note: null,
  counts: false, held: true,
  ...over,
})!
const WEI_HOW = check({
  orderId: 'o-307', orderNo: 'HC-SO-2610-307', refNo: 'HC77777+ZNT6186', total: 4288, sellerName: 'WEI HOW',
  evidence: {
    orders: [{ source: 'claim_form', docNo: 'ZNT6186', papers: ['ZNT6186'], soldOn: '2026-08-15', month: '2026-08-01',
      seller: 'WEI HOW', sellerLeft: true, handledBySeller: false, total: 4288, cancelled: false }],
    booth: { fair: 'KUALA LUMPUR [ZANOTTI] PERFECT LIFESTYLE @ MID VALLEY', staff: ['Wei How', 'Zack'] },
  },
})

const props = { unavailable: null, canDecide: true, basePath: '/revenue/fair', returnTo: '/revenue/fair/2026-10-01?view=sellers', period: '2026-10-01' }

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('Comm Cal › Whose sale', () => {
  it('lists the month’s held bills: the paper, whose order it was on, and that they left', () => {
    render(<SellerChecksPanel {...props} checks={[check(), WEI_HOW]} />)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      'HC-SO-2610-241MS CHANSHAWNHC12110STEPHY · HC-SO-008712ERP order · 22 Oct 2025 · leftRM 7,794.00Held · to answer',
      'HC-SO-2610-307MS CHANSHAWNZNT6186WEI HOW · ZNT6186Claim form · Aug 2026 · leftRM 4,288.00Held · to answer',
    ])
    expect(screen.getByRole('table')).toHaveAttribute('aria-label', 'Whose sale, 2 to answer')
  })

  it('says so when nothing was held', () => {
    render(<SellerChecksPanel {...props} checks={[]} />)
    expect(screen.getByText('No bill of October 2026 waits on whose sale it is.')).toBeTruthy()
  })

  it('opens what was found — the ERP’s Shared with said as the ERP’s, never as a share of the sale', () => {
    render(<SellerChecksPanel {...props} checks={[check()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-241'))
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('Bill totalRM 7,794.00')
    expect(drawer).toHaveTextContent('Ref No.HC12110')
    // When it was asked, never "Held": a bill may be asked while it still counts (found on production, 2026-10-31).
    expect(drawer).toHaveTextContent('Asked31 Oct, 01:00')
    expect(drawer).not.toHaveTextContent(/Held\d/)
    expect(drawer).toHaveTextContent('HC-SO-008712ERP order')
    expect(drawer).toHaveTextContent('STEPHY · 22 Oct 2025 · RM 7,794.00 · HC12110')
    expect(drawer).toHaveTextContent('STEPHY left')
    expect(drawer).toHaveTextContent('ERP Shared with · SHAWN')
    expect(within(drawer).getByRole('link', { name: 'HC-SO-2610-241' }))
      .toHaveAttribute('href', '/revenue/fair/2026-10-01/orders/o-241?from=%2Frevenue%2Ffair%2F2026-10-01%3Fview%3Dsellers')
  })

  it('a booth that did not list the salesperson is said beside the claim form', () => {
    render(<SellerChecksPanel {...props} checks={[WEI_HOW]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-307'))
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('ZNT6186Claim form')
    expect(drawer).toHaveTextContent('WEI HOW · Aug 2026 · RM 4,288.00 · ZNT6186')
    expect(drawer).toHaveTextContent('KUALA LUMPUR [ZANOTTI] PERFECT LIFESTYLE @ MID VALLEYWei How, Zack')
  })

  it('answers in the salesperson’s name, with HR’s note, and shows the answer at once', async () => {
    answer.mockResolvedValue({ ok: true, answer: { orderNo: 'HC-SO-2610-241', status: 'not_theirs', counts: false } })
    render(<SellerChecksPanel {...props} checks={[check()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-241'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'STEPHY left; SHAWN looks after the customer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Not SHAWN’s sale' }))
    await waitFor(() => expect(answer).toHaveBeenCalledWith('o-241', false, 'STEPHY left; SHAWN looks after the customer'))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Not theirs')).toBeTruthy())
    expect(refresh).toHaveBeenCalled()
    // Answered not theirs, only the other answer is left.
    expect(screen.queryByRole('button', { name: 'Not SHAWN’s sale' })).toBeNull()
    expect(screen.getByRole('button', { name: 'SHAWN’s own sale' })).toBeTruthy()
  })

  it('says the database’s refusal in the drawer', async () => {
    answer.mockResolvedValue({ ok: false, reason: 'The run for October 2026 has paid. Reopen it before changing which of its bills count.' })
    render(<SellerChecksPanel {...props} checks={[check()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-241'))
    fireEvent.click(screen.getByRole('button', { name: 'SHAWN’s own sale' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The run for October 2026 has paid.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('without Revenue · Edit it only reads', () => {
    render(<SellerChecksPanel {...props} canDecide={false} checks={[check()]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-241'))
    expect(screen.queryByRole('button', { name: /sale/ })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('names each state: held, counted again by hand, answered', () => {
    expect(checkStatus({ status: 'waiting', counts: false })).toEqual({ text: 'Held · to answer', tone: 'alert' })
    expect(checkStatus({ status: 'waiting', counts: true })).toEqual({ text: 'Counting · to answer', tone: 'info' })
    expect(checkStatus({ status: 'theirs', counts: true })).toEqual({ text: 'Their own sale', tone: 'ledger' })
    expect(checkStatus({ status: 'not_theirs', counts: false })).toEqual({ text: 'Not theirs', tone: 'plain' })
  })
})

// A bill the ERP gave to another salesperson after the portal had it (mig 20261031040000): stopped — still KINGSLEY's,
// counting — until HR answers.
const MOVED = check({
  orderId: 'o-600', orderNo: 'HC-SO-2610-600', refNo: 'HC99001', total: 3000, staffId: 'kingsley', staffName: 'KINGSLEY',
  kind: 'erp_moved', status: 'waiting', sellerName: 'KINGSLEY', counts: true, held: false,
  evidence: { from: { staffId: 'kingsley', name: 'KINGSLEY' }, to: { staffId: 'shawn', name: 'SHAWN' }, movedAt: '2026-10-31T01:30:00Z' },
})

describe('Comm Cal › Whose sale — a bill the ERP moved', () => {
  it('lists it as a stopped move: still KINGSLEY’s, whom the ERP gave it to, waiting on HR', () => {
    render(<SellerChecksPanel {...props} checks={[MOVED]} />)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.map(r => r.textContent)).toEqual([
      'HC-SO-2610-600MS CHANKINGSLEYHC99001KINGSLEY → SHAWNMoved in the ERP · 31 Oct, 09:30RM 3,000.00Stopped · to answer',
    ])
  })

  it('a bill asked both ways is two questions, never one row over the other', () => {
    render(<SellerChecksPanel {...props} checks={[check({ orderId: 'o-600', orderNo: 'HC-SO-2610-600' }), MOVED]} />)
    expect(within(screen.getByRole('table')).getAllByRole('row').slice(1)).toHaveLength(2)
  })

  it('opens on the move and answers in both names — keep KINGSLEY’s moves it back', async () => {
    answerMove.mockResolvedValue({ ok: true, answer: { orderNo: 'HC-SO-2610-600', status: 'not_theirs', counts: true } })
    render(<SellerChecksPanel {...props} checks={[MOVED]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-600'))
    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveTextContent('Moved in the ERPKINGSLEY → SHAWN · 31 Oct, 09:30')
    expect(drawer).not.toHaveTextContent('Found on')
    expect(screen.getByRole('button', { name: 'SHAWN’s now' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep KINGSLEY’s' }))
    await waitFor(() => expect(answerMove).toHaveBeenCalledWith('o-600', true, null))
    expect(answer).not.toHaveBeenCalled()
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Kept KINGSLEY’s')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Keep KINGSLEY’s' })).toBeNull()
  })

  it('SHAWN’s now leaves it where the ERP put it', async () => {
    answerMove.mockResolvedValue({ ok: true, answer: { orderNo: 'HC-SO-2610-600', status: 'theirs', counts: true } })
    render(<SellerChecksPanel {...props} checks={[MOVED]} />)
    fireEvent.click(screen.getByText('HC-SO-2610-600'))
    fireEvent.click(screen.getByRole('button', { name: 'SHAWN’s now' }))
    await waitFor(() => expect(answerMove).toHaveBeenCalledWith('o-600', false, null))
    await waitFor(() => expect(within(screen.getByRole('dialog')).getAllByText('SHAWN’s now').length).toBeGreaterThan(0))
  })

  it('names a move’s states', () => {
    const move = MOVED.move
    expect(checkStatus({ status: 'theirs', counts: true, kind: 'erp_moved', move })).toEqual({ text: 'SHAWN’s now', tone: 'ledger' })
    expect(checkStatus({ status: 'not_theirs', counts: true, kind: 'erp_moved', move })).toEqual({ text: 'Kept KINGSLEY’s', tone: 'plain' })
  })
})
