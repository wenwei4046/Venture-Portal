import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import FixedAssetsView from './FixedAssetsView'
import type { FaData } from '@/lib/fixed-assets'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('../actions', () => ({ postDepreciation: vi.fn(), undoDepreciation: vi.fn(), saveFaAsset: vi.fn(), saveFaClass: vi.fn() }))

// 2026-11-24 — the user's screenshot: the first year picked, Post said RM 3,883.22 (through November) under "Jun 2026".
const data: FaData = {
  classes: [{ id: 'c1', name: 'Computer & equipment', lifeMonths: 36, residualPct: 0, startRule: 'purchase_month', assetAccount: '2000', accumAccount: '2090', expenseAccount: '9100', isActive: true }],
  lines: [],
  postings: [],
  assets: [{ id: 'a1', name: 'Desktop', classId: 'c1', inServiceDate: '2026-03-06', lifeMonths: null, disposedOn: null, notes: null, draft: true, lineIds: ['l1'], cost: 3600, voucher: 'PV-000003' }],
}
const props = { data, accounts: [], years: [], now: '2026-11', view: 'register' as const, canEdit: true, canPost: true }

describe('Fixed Assets › Post', () => {
  it('posts through the year’s own month, whatever year the page opened on', () => {
    const { rerender } = render(<FixedAssetsView {...props} fy={{ from: '2026-07', to: '2027-06' }} />)
    expect(screen.getByRole('button', { name: /^Post RM/ })).toHaveTextContent('RM 900.00') // Mar – Nov, 9 × 100
    rerender(<FixedAssetsView {...props} fy={{ from: '2025-01', to: '2026-06' }} />)
    expect(screen.getByRole('button', { name: /^Post RM/ })).toHaveTextContent('RM 400.00') // Mar – Jun
  })
})
