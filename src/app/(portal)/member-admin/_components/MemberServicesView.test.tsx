import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminMemberData } from '@/lib/member/server'

// People › Member services (2026-10-10, the HR revamp): three tabs for whoever
// manages member requests — Publish memo moved to People › Documentation
// (round 2, 2026-10-11); Brand weeks reads its month only when it is first
// opened — never as the page's own Server Action — and a tab keeps its state.

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
  return render(<MemberServicesView data={{ ...data, ...over }} facts={{}} claimRates={null} initialRequestId={null} />)
}

beforeEach(() => {
  fetchWeeks.mockClear()
})
afterEach(cleanup)

describe('MemberServicesView', () => {
  it('heads the page and offers the three tabs — Capacity, Product options and Publish memo are gone', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Member services' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Request reviews', 'Brand weeks', 'Claim rates'])
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

  it('offers only what the viewer manages', () => {
    show({ canManageRequests: false })
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByText(/Memos are published from People › Documentation/)).toBeInTheDocument()
  })
})
