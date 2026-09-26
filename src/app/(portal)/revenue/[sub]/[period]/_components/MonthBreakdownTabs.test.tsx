import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MonthBreakdownTabs from './MonthBreakdownTabs'

/**
 * The rail switches panels without a round trip: the key lives in `?tab=`,
 * pushed with the browser's own history, and Next re-renders `useSearchParams`
 * from it. The mock stands in for that sync — a click pushes, and the next
 * render reads what was pushed.
 */
const { url } = vi.hoisted(() => ({ url: { search: '' } }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(url.search),
}))

const PANELS = {
  openBill: <div>Open Bill panel</div>,
  upsales: <div>Upsales panel</div>,
}
const COUNTS = { openBill: 211, upsales: 11 }

function renderRail(openBill: React.ReactNode = PANELS.openBill, upsales: React.ReactNode | undefined = PANELS.upsales) {
  return render(<MonthBreakdownTabs openBill={openBill} upsales={upsales} counts={COUNTS} />)
}

beforeEach(() => {
  url.search = ''
  vi.restoreAllMocks()
})

describe('MonthBreakdownTabs', () => {
  it('opens on the first tab, and renders only the panel being read', () => {
    renderRail()
    expect(screen.getByText('Open Bill panel')).toBeVisible()
    expect(screen.queryByText('Upsales panel')).toBeNull()
  })

  // 2026-09-26: Sales by venue moved up into the workbench's tabs, and Sales
  // by person went — the workbench's own table is that.
  it('no longer carries Sales by venue or Sales by person', () => {
    renderRail()
    expect(screen.queryByRole('button', { name: /Sales by venue/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Sales by person/ })).toBeNull()
  })

  it('carries each panel’s count on its tab, upsales last', () => {
    renderRail()
    expect(screen.getByRole('button', { name: /Open Bill/ })).toHaveTextContent('211')
    expect(screen.getByRole('button', { name: /Upsales/ })).toHaveTextContent('11')
    expect(screen.getAllByRole('button').at(-1)?.textContent).toMatch(/Upsales/)
  })

  it('opens on the tab a link asked for', () => {
    url.search = 'tab=upsales'
    renderRail()
    expect(screen.getByText('Upsales panel')).toBeVisible()
    expect(screen.queryByText('Open Bill panel')).toBeNull()
  })

  it('pushes the tab into the URL instead of navigating', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const { rerender } = renderRail()

    fireEvent.click(screen.getByRole('button', { name: /Upsales/ }))
    expect(push).toHaveBeenCalledWith(null, '', '?tab=upsales')

    url.search = 'tab=upsales'
    rerender(<MonthBreakdownTabs openBill={PANELS.openBill} upsales={PANELS.upsales} counts={COUNTS} />)
    expect(screen.getByText('Upsales panel')).toBeVisible()
    expect(screen.queryByText('Open Bill panel')).toBeNull()
  })

  it('drops the key again on the way back to the first tab', () => {
    url.search = 'tab=upsales'
    const push = vi.spyOn(window.history, 'pushState')
    renderRail()

    fireEvent.click(screen.getByRole('button', { name: /Open Bill/ }))
    expect(push).toHaveBeenCalledWith(null, '', window.location.pathname)
  })

  it('has no Open Bill tab when the month pays none, whatever the URL says', () => {
    url.search = 'tab=open-bill'
    renderRail(null)
    expect(screen.queryByRole('button', { name: /Open Bill/ })).toBeNull()
    expect(screen.getByText('Upsales panel')).toBeVisible()
  })

  it('falls back to the first tab for a link to a tab that is gone', () => {
    url.search = 'tab=person'
    renderRail()
    expect(screen.getByText('Open Bill panel')).toBeVisible()
  })

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<MonthBreakdownTabs openBill={null} counts={COUNTS} />)
    expect(container).toBeEmptyDOMElement()
  })
})
