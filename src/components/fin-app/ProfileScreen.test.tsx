import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// The Finance app's Profile, as the Principal's own view opens it (2026-10-17): the view it names, Switch view
// with the Principal's own app here, and This phone's notifications (the portal's phone face had them, #514).
// Switch view lists every view since 2026-10-27, as every switcher does, and View as a person… opens the portal's picker.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/fin-app/profile',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/layout/view-as-actions', () => ({ setViewAs: vi.fn() }))
vi.mock('@/components/layout/AccountMenu', () => ({
  ChangePasswordDialog: () => null,
  RequestEmailDialog: () => null,
  SignOutDialog: (p: { view?: string }) => <div data-testid="sign-out">{p.view}</div>,
}))
// Me's card (2026-10-17) reads from the browser and writes through Server Actions: drawn here as its marker only.
vi.mock('@/components/me/MeCard', () => ({ MeCard: () => <div data-testid="me-card" /> }))
vi.mock('@/components/layout/ViewAsPersonPicker', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="View as a person" /> : null),
}))
vi.mock('./PushRow', () => ({
  default: ({ roman }: { roman: string }) => (
    <>
      <div className="menuHead">
        {roman}This phone
      </div>
      <button type="button">Phone notifications</button>
    </>
  ),
}))

import { setViewAs } from '@/components/layout/view-as-actions'
import FinAppFrame from './FinAppFrame'
import ProfileScreen from './ProfileScreen'

const draw = (props: Partial<Parameters<typeof ProfileScreen>[0]> = {}) =>
  render(
    <FinAppFrame platform="android" rows={['payments']} view={props.view ?? 'finance'}>
      <ProfileScreen name="Principal" email="principal@venture.my" personal={false} admin={[{ key: 'audit', label: 'Audit Log', icon: 'report', sub: '', href: '/fin-app/page/audit' }]} {...props} />
    </FinAppFrame>,
  )

describe('the Finance app’s Profile', () => {
  it('names the Principal’s own view, and lists it as here in Switch view', () => {
    draw({ view: 'principal', canSwitch: true, push: true })
    expect(screen.getByText('principal@venture.my · Principal view')).toBeInTheDocument()
    const views = screen.getByLabelText('Switch view')
    expect(within(views).getByRole('button', { name: /Principal You are here/ })).toBeDisabled()
    expect(within(views).getByRole('button', { name: /Finance This app/ })).toBeEnabled()
    expect(screen.getByTestId('sign-out')).toHaveTextContent('the Principal view')
  })

  it('Switch view: every view and where it opens on a phone; View as a person… opens the picker', () => {
    draw({ view: 'principal', canSwitch: true })
    const views = screen.getByLabelText('Switch view')
    expect(within(views).getAllByRole('button').map(b => b.textContent)).toEqual([
      'PrincipalYou are here', 'FinanceThis app›', 'HRThe HR app›', 'MarketingThe portal›', 'Revenue teamThe Revenue app›',
      'Lead ViewThe portal›', 'View as a person…Read-only›',
    ])
    fireEvent.click(within(views).getByRole('button', { name: /View as a person/ }))
    expect(screen.getByRole('dialog', { name: 'View as a person' })).toBeInTheDocument()
    expect(setViewAs).not.toHaveBeenCalled()
  })

  it('carries This phone’s notifications as the last section, numbered after the others', () => {
    draw({ view: 'principal', canSwitch: true, push: true })
    expect(screen.getByRole('button', { name: 'Phone notifications' })).toBeInTheDocument()
    const heads = [...document.querySelectorAll('[class*="menuHead"]')].map((h) => h.textContent)
    expect(heads).toEqual(['I.Admin', 'II.Switch view', 'III.This phone'])
  })

  it('Account: Change password and Request to change email — no Edit profile, Me › Profile’s is the one (2026-10-17)', () => {
    draw({ personal: true, me: true })
    expect(screen.getByText('Change password')).toBeInTheDocument()
    expect(screen.getByText('Request to change email')).toBeInTheDocument()
    expect(screen.queryByText('Edit profile')).toBeNull()
  })

  it('opens on Me’s card for a login of one’s own (the page says so), and on nothing else for a shared one', () => {
    draw({ personal: true, me: true })
    expect(screen.getByTestId('me-card')).toBeInTheDocument()
    draw({ personal: false, me: false })
    expect(screen.getAllByTestId('me-card')).toHaveLength(1)
  })

  it('draws no switch while viewing as a person (push off), and keeps Finance’s words on Finance’s view', () => {
    draw({ canSwitch: false, push: false })
    expect(screen.queryByRole('button', { name: 'Phone notifications' })).toBeNull()
    expect(screen.getByText('principal@venture.my · Finance view')).toBeInTheDocument()
    expect(screen.getByTestId('sign-out')).toHaveTextContent('the Finance view')
  })

  it('opens IT support from a shared account and numbers all following sections after Account', () => {
    draw({ personal: false, itSupport: true, canSwitch: true, push: true })
    expect(screen.getByRole('link', { name: 'IT support' })).toHaveAttribute('href', '/fin-app/it-support')
    expect(screen.queryByRole('button', { name: 'Change password' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Request to change email' })).toBeNull()
    const heads = [...document.querySelectorAll('[class*="menuHead"]')].map(h => h.textContent)
    expect(heads).toEqual(['I.Account', 'II.Admin', 'III.Switch view', 'IV.This phone'])
  })

  it('keeps IT support out while viewing as a person', () => {
    draw({ itSupport: false })
    expect(screen.queryByRole('link', { name: 'IT support' })).toBeNull()
  })
})
