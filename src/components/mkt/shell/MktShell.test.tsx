import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@/types'
import { DEFAULT_LOOK } from '@/lib/marketing/look'
import { useFinView } from '@/components/layout/fin-view'

// 2026-10-28 — the Pool is Finance's own Marketing page (the user: "我要exactly 给他们看这个part"): Marketing's shell
// draws it on Finance's sheet in Finance's view — `.fin-view` on the frame and FinViewProvider, as PortalFrame sets
// them on Finance's shell. Marketing's own pages stay on Marketing's card.

const path = vi.hoisted(() => ({ now: '/marketing/pool' }))
vi.mock('next/navigation', () => ({ usePathname: () => path.now, useSearchParams: () => new URLSearchParams() }))
// next/font, which only Next's compiler can run.
vi.mock('../fonts', () => ({
  nunito: { variable: '' },
  plex: { variable: '' },
  playfair: { variable: '' },
  dmSerif: { variable: '' },
  grotesk: { variable: '' },
  lookFamily: () => 'inherit',
}))
vi.mock('./useMktShell', () => ({ useMktShell: () => ({ data: null, reload: () => undefined }) }))
vi.mock('./MktSidebar', () => ({ default: () => <aside /> }))
vi.mock('./MktTopBar', () => ({ default: () => <header /> }))
vi.mock('./MktAccountMenu', () => ({ default: () => null }))
vi.mock('./MktPanels', () => ({ AppearancePanel: () => null, NoticesPanel: () => null }))
vi.mock('@/components/hrv/toast', () => ({ ToastHost: () => null }))
vi.mock('@/components/layout/AccountMenu', () => ({ ChangePasswordDialog: () => null, RequestEmailDialog: () => null, SignOutDialog: () => null }))
vi.mock('@/components/layout/ViewingAsBanner', () => ({ default: () => null }))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))

import MktShell from './MktShell'

function Page() {
  return <p>{useFinView() ? 'in Finance’s view' : 'in Marketing’s'}</p>
}
const user = { id: 'sj', role: 'staff', name: 'Sia Josiah', permissions: [], actions: {}, tabs: ['mkt.overview.view', 'mkt.pool.view'] } as unknown as User
const draw = () =>
  render(
    <MktShell user={user} navUser={user} initialCollapsed={false} initialLook={DEFAULT_LOOK}>
      <Page />
    </MktShell>,
  )

beforeEach(() => {
  path.now = '/marketing/pool'
})

describe('Marketing’s shell around Finance’s page', () => {
  it('draws the Pool on Finance’s sheet in Finance’s view, as Dept Pool is drawn', () => {
    draw()
    const main = screen.getByRole('main')
    expect(main).toHaveClass('sheet-theme', 'sheet', 'hrv-sheet', 'fin-sheet')
    expect(main.parentElement).toHaveClass('fin-view')
    expect(screen.getByText('in Finance’s view')).toBeInTheDocument()
  })

  it('keeps Marketing’s own pages on its card, out of Finance’s view', () => {
    path.now = '/marketing/billing'
    draw()
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('data-mkt-own')
    expect(main.parentElement).not.toHaveClass('fin-view')
    expect(screen.getByText('in Marketing’s')).toBeInTheDocument()
  })
})
