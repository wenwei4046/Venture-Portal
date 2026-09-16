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
  venue: <div>Venue panel</div>,
  person: <div>Person panel</div>,
  openBill: <div>Open Bill panel</div>,
}
const COUNTS = { venue: 30, person: 26, openBill: 211 }

function renderRail(openBill: React.ReactNode = PANELS.openBill) {
  return render(
    <MonthBreakdownTabs
      venue={PANELS.venue}
      person={PANELS.person}
      openBill={openBill}
      counts={COUNTS}
    />,
  )
}

beforeEach(() => {
  url.search = ''
  vi.restoreAllMocks()
})

describe('MonthBreakdownTabs', () => {
  it('opens on Sales by venue, and renders only the panel being read', () => {
    renderRail()
    expect(screen.getByText('Venue panel')).toBeVisible()
    expect(screen.queryByText('Person panel')).toBeNull()
    expect(screen.queryByText('Open Bill panel')).toBeNull()
  })

  it('carries each panel’s count on its tab', () => {
    renderRail()
    expect(screen.getByRole('button', { name: /Sales by venue/ })).toHaveTextContent('30')
    expect(screen.getByRole('button', { name: /Sales by person/ })).toHaveTextContent('26')
    expect(screen.getByRole('button', { name: /Open Bill/ })).toHaveTextContent('211')
  })

  it('opens on the tab a link asked for', () => {
    url.search = 'tab=open-bill'
    renderRail()
    expect(screen.getByText('Open Bill panel')).toBeVisible()
    expect(screen.queryByText('Venue panel')).toBeNull()
  })

  it('pushes the tab into the URL instead of navigating', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const { rerender } = renderRail()

    fireEvent.click(screen.getByRole('button', { name: /Sales by person/ }))
    expect(push).toHaveBeenCalledWith(null, '', '?tab=person')

    url.search = 'tab=person'
    rerender(
      <MonthBreakdownTabs
        venue={PANELS.venue}
        person={PANELS.person}
        openBill={PANELS.openBill}
        counts={COUNTS}
      />,
    )
    expect(screen.getByText('Person panel')).toBeVisible()
    expect(screen.queryByText('Venue panel')).toBeNull()
  })

  it('drops the key again on the way back to the default tab', () => {
    url.search = 'tab=person'
    const push = vi.spyOn(window.history, 'pushState')
    renderRail()

    fireEvent.click(screen.getByRole('button', { name: /Sales by venue/ }))
    expect(push).toHaveBeenCalledWith(null, '', window.location.pathname)
  })

  it('has no Open Bill tab when the scheme pays none, whatever the URL says', () => {
    url.search = 'tab=open-bill'
    renderRail(null)
    expect(screen.queryByRole('button', { name: /Open Bill/ })).toBeNull()
    expect(screen.getByText('Venue panel')).toBeVisible()
  })
})
