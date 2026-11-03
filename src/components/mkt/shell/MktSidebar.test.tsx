import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
const sidebar = (manager: boolean, subsOpen = true) =>
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
