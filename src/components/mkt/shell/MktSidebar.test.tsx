import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { changeViews } from '@/lib/marketing/change-view'
import { MKT_NAV } from '@/lib/marketing/nav'
import type { MktShellData } from '@/lib/marketing/shell'

// 2026-10-23 — ④-1: the sidebar's "+ Add subsidiary" (`Marketing Shell.dc.html`, the manager's): under the open
// Subsidiaries list, opening New Project with the client form. Marketing's other rows are the shell's own tests'
// (components/layout/PortalFrame.mkt.test.tsx).

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }))
vi.mock('@/lib/nav-warm', () => ({ warmOnIntent: vi.fn(), cancelWarmIntent: vi.fn() }))

import MktSidebar from './MktSidebar'

const shell: MktShellData = {
  today: '2026-10-23',
  me: null,
  subs: [
    { id: 's1', code: 'CAR', name: 'Carres', dot: 'x', emoji: '🛋️', client: false, count: 0 },
    { id: 's2', code: 'ACME', name: 'Acme Furniture', dot: 'y', emoji: '🏢', client: true, count: 0 },
  ],
  counts: { myspace: 0, calendar: 0, projects: 0, tracking: 0, claims: 0 },
  notices: 0,
}
const sidebar = (manager: boolean, subsOpen = true, views: ReturnType<typeof changeViews> = []) =>
  render(
    <MktSidebar
      rows={MKT_NAV.filter(r => manager || !r.manager)}
      active={null}
      shell={shell}
      collapsed={false}
      onFold={() => {}}
      subsOpen={subsOpen}
      onSubs={() => {}}
      avatar={{ letter: 'R', bg: 'x', title: 'Rachel · Marketing Manager' }}
      menuOpen={false}
      onMenu={() => {}}
      settingsOn={false}
      onSettings={() => {}}
      onPick={() => {}}
      views={views}
    />,
  )

describe('the sidebar’s + Add subsidiary', () => {
  it('sits under the open Subsidiaries list for the manager, opening New Project’s client form', () => {
    sidebar(true)
    expect(screen.getByRole('link', { name: /Acme Furniture/ }).getAttribute('href')).toBe('/marketing/subsidiaries/ACME')
    expect(screen.getByRole('link', { name: /Add subsidiary/ }).getAttribute('href')).toBe('/marketing/new?add=1')
  })

  it('is nobody else’s, and folds away with the list', () => {
    const { unmount } = sidebar(false)
    expect(screen.queryByRole('link', { name: /Add subsidiary/ })).toBeNull()
    unmount()
    sidebar(true, false)
    expect(screen.queryByRole('link', { name: /Add subsidiary/ })).toBeNull()
  })
})

// 2026-11-11 — Change view: a Marketing login the CRM was opened to (CRM · View in People › Permissions).
describe('the sidebar’s Change view', () => {
  const crm = changeViews({ permissions: ['marketing', 'member_crm'], actions: { 'marketing.view': 'all', 'crm.view': 'all' } })

  it('is not there without the cross-team permission', () => {
    sidebar(false, true, [])
    expect(screen.queryByRole('button', { name: /Change view/ })).toBeNull()
  })

  it('opens Marketing (ticked) and the CRM', () => {
    sidebar(false, true, crm)
    fireEvent.click(screen.getByRole('button', { name: /Change view/ }))
    const menu = screen.getByRole('menu', { name: 'Change view' })
    expect(menu.querySelector('[aria-checked="true"]')?.textContent).toContain('Marketing')
    expect(screen.getByRole('menuitemradio', { name: /CRM/ }).getAttribute('href')).toBe('/member?page=account&view=crm')
  })
})
