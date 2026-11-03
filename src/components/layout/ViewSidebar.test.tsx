import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { User } from '@/types'
import type { HrNavItem, HrNavSection } from './hr-nav'

// A row's count (2026-11-03 — Finance's Payment request: what waits for the voucher, the user's soft sample B): drawn
// after the row's name, read with it ("Payment request 3 waiting"), and not drawn at all at nought.

vi.mock('next/navigation', () => ({
  usePathname: () => '/payments',
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/nav-warm', () => ({
  cancelWarmIntent: vi.fn(),
  railEntered: vi.fn(),
  recordVisit: vi.fn(),
  usualPages: () => [],
  warmOnIntent: vi.fn(),
  warmWhenIdle: vi.fn(),
}))
vi.mock('./nav-owner', () => ({ useNavOwner: () => null }))

import ViewSidebar from './ViewSidebar'

const item = (key: string, label: string, href: string): HrNavItem => ({
  key,
  label,
  icon: 'inbox',
  href,
  visible: () => true,
  match: (p) => p === href,
  group: { key: 'payments', label: 'Payments', icon: 'out' },
})
const sections: Array<HrNavSection & { roman: string | null }> = [
  {
    label: 'Daily',
    tone: 'clay',
    roman: 'I.',
    items: [item('payment-vouchers', 'Payment voucher', '/payments'), item('payment-requests', 'Payment request', '/payments/requests')],
  },
]
const user = { id: 'u', role: 'finance', name: 'Finance', email: 'f@x' } as unknown as User

describe('a row’s count on the view sidebar', () => {
  it('stands after the row’s name and is read with it', () => {
    render(<ViewSidebar user={user} sections={sections} initialCollapsed={false} footerSub="Finance" counts={{ 'payment-requests': 3 }} />)
    const row = screen.getByRole('link', { name: /Payment request/ })
    expect(row).toHaveAccessibleName('Payment request 3 waiting')
    expect(within(row).getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Payment voucher/ })).toHaveAccessibleName('Payment voucher')
  })

  it('is not drawn at nought, nor without counts', () => {
    const { rerender } = render(<ViewSidebar user={user} sections={sections} initialCollapsed={false} footerSub="Finance" counts={{ 'payment-requests': 0 }} />)
    expect(screen.getByRole('link', { name: /Payment request/ })).toHaveAccessibleName('Payment request')
    rerender(<ViewSidebar user={user} sections={sections} initialCollapsed={false} footerSub="Finance" />)
    expect(screen.getByRole('link', { name: /Payment request/ })).toHaveAccessibleName('Payment request')
  })
})
