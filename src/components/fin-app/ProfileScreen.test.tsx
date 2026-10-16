import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// The Finance app's Profile, as the Principal's own view opens it (2026-10-17): the view it names, Switch view
// with the Principal's own app here, and This phone's notifications (the portal's phone face had them, #514).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/fin-app/profile',
  useSearchParams: () => new URLSearchParams(''),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))
vi.mock('@/components/layout/view-as-actions', () => ({ setViewAs: vi.fn() }))
vi.mock('@/components/layout/AccountMenu', () => ({
  ChangePasswordDialog: () => null,
  EditProfileDialog: () => null,
  RequestEmailDialog: () => null,
  SignOutDialog: (p: { view?: string }) => <div data-testid="sign-out">{p.view}</div>,
}))
// Me's card (2026-10-17) reads from the browser and writes through Server Actions: drawn here as its marker only.
vi.mock('@/components/me/MeCard', () => ({ MeCard: () => <div data-testid="me-card" /> }))
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

import FinAppFrame from './FinAppFrame'
import ProfileScreen from './ProfileScreen'

const draw = (props: Partial<Parameters<typeof ProfileScreen>[0]> = {}) =>
  render(
    <FinAppFrame platform="android" rows={['payments']} view={props.view ?? 'finance'}>
      <ProfileScreen name="Principal" email="principal@venture.my" phone="" personal={false} admin={[{ key: 'audit', label: 'Audit Log', icon: 'report', sub: '', href: '/fin-app/page/audit' }]} {...props} />
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

  it('carries This phone’s notifications as the last section, numbered after the others', () => {
    draw({ view: 'principal', canSwitch: true, push: true })
    expect(screen.getByRole('button', { name: 'Phone notifications' })).toBeInTheDocument()
    const heads = [...document.querySelectorAll('[class*="menuHead"]')].map((h) => h.textContent)
    expect(heads).toEqual(['I.Admin', 'II.Switch view', 'III.This phone'])
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
})
