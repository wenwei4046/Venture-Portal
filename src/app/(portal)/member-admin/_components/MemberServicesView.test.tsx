import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminMemberData } from '@/lib/member/server'

// People › Member services (2026-10-10, the HR revamp): four tabs by what the
// viewer manages; Brand weeks reads its month only when it is first opened —
// never as the page's own Server Action — and a tab keeps what was typed.

const fetchWeeks = vi.hoisted(() => vi.fn(() => new Promise(() => {})))
vi.mock('../brand-weeks-actions', () => ({ fetchBrandWeeksAdmin: fetchWeeks, saveBrandWeeksAdmin: vi.fn() }))
vi.mock('../claim-rates-actions', () => ({ saveClaimRatesAdmin: vi.fn() }))
vi.mock('@/app/(member)/member/actions', () => ({ adminMemberAction: vi.fn() }))
vi.mock('@/components/hrv/toast', () => ({ flash: vi.fn() }))

import MemberServicesView from './MemberServicesView'

const FAIR = '71709f7e-9f7c-4e28-80cf-ce21be336995'
const data: AdminMemberData = {
  canManageRequests: true, canPublishMemos: true, canConfigureProducts: true, requests: [], memos: [], products: [], candidates: [], titles: [], uplines: [], events: [],
  departments: [{ id: FAIR, name: 'Fair', capacity: null, occupied: 0, reserved: 0 }],
}

function show(over: Partial<AdminMemberData> = {}) {
  return render(<MemberServicesView data={{ ...data, ...over }} facts={{}} memoReads={{}} claimRates={null} initialRequestId={null} />)
}

beforeEach(() => {
  fetchWeeks.mockClear()
})
afterEach(cleanup)

describe('MemberServicesView', () => {
  it('heads the page and offers the four tabs — Capacity and Product options are gone', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Member services' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Request reviews', 'Brand weeks', 'Claim rates', 'Publish memo'])
    expect(screen.getByRole('tab', { name: 'Request reviews' })).toHaveAttribute('aria-selected', 'true')
  })

  it('reads brand weeks only when the tab is opened, and once', () => {
    show()
    expect(fetchWeeks).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Brand weeks' }))
    expect(fetchWeeks).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('tab', { name: 'Request reviews' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Brand weeks' }))
    expect(fetchWeeks).toHaveBeenCalledTimes(1)
  })

  it('keeps a typed memo across tabs', () => {
    show()
    fireEvent.click(screen.getByRole('tab', { name: 'Publish memo' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Request reviews' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Publish memo' }))
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Draft')
  })

  it('offers only what the viewer manages', () => {
    show({ canManageRequests: false })
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Publish a new memo' })).toBeInTheDocument()
  })
})
