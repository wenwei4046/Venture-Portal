import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PageModel, PagePlace } from '@/lib/fin-app/page-model'

// A Finance page the phone app draws as a hub of its own (2026-10-15, part 5b):
// the headline and the period between its arrows (the server's to read), a card
// opening its lines, a line its own screen or its record, the desktop page's
// files in the bar and the Segment in its ⋯.

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/page/ledger',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))

import FinAppFrame from './FinAppFrame'
import PageApp from './PageApp'
import { resetNav } from './nav'

const MODEL: PageModel = {
  hero: { value: 'RM 500.00', label: 'Debits posted · October 2026' },
  chip: { text: '1 account · Dr = Cr', tone: 'ledger' },
  eyebrow: 'General Ledger · October 2026',
  cards: [
    {
      key: 'asset',
      tone: 'all',
      icon: 'doc',
      label: 'Assets',
      sub: '1 account',
      value: '1,300.00 Dr',
      groups: [
        {
          key: 'asset',
          title: 'Accounts',
          count: '1',
          lines: [
            {
              key: '3000',
              label: 'Cash & Bank - Hong Leong',
              sub: '3000',
              value: '1,300.00 Dr',
              detail: { title: 'Cash & Bank - Hong Leong', groups: [{ key: 'entries', title: '3000 · 1 entry', count: '1,300.00 Dr', lines: [{ key: 'e1', label: 'Settle invoice', value: '500.00 Dr', open: { href: '/fin-app/daily/payments?id=v1' } }] }] },
            },
          ],
        },
      ],
    },
  ],
}

const PLACE: PagePlace = {
  href: '/fin-app/page/ledger',
  title: 'General Ledger',
  roman: 'III.',
  keep: 'm=2026-09',
  period: { label: 'September 2026', prev: 'm=2026-08', next: '' },
  segments: [
    { value: '', label: 'All segments (consolidated)', keep: 'm=2026-09' },
    { value: 'hr', label: 'HR', keep: 'm=2026-09&s=hr' },
  ],
  segment: '',
}

const FILES = [
  { key: 'pdf', label: 'Export PDF', href: '/reports/ledger/export?format=pdf', format: 'pdf' as const },
  { key: 'xlsx', label: 'Export Excel', href: '/reports/ledger/export?format=xlsx', format: 'xlsx' as const },
]

const draw = (search = 'm=2026-09') =>
  render(
    <FinAppFrame platform="android" rows={['ledger']}>
      <PageApp place={PLACE} model={MODEL} search={search} files={FILES} />
    </FinAppFrame>,
  )

beforeEach(() => {
  resetNav()
  window.history.replaceState(null, '', '/fin-app/page/ledger?m=2026-09')
})
afterEach(() => vi.clearAllMocks())

describe('a Finance page as an app hub', () => {
  it('opens on its headline, its state, the period between its arrows and a card per part', () => {
    draw()
    expect(screen.getByText('Debits posted · October 2026')).toBeInTheDocument()
    expect(screen.getByText('1 account · Dr = Cr')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Assets 1 account 1,300\.00 Dr$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeInTheDocument()
  })

  it('the month before and after are the server’s to read, keeping what else is on show', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/page/ledger?m=2026-08', { scroll: false })
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(mocks.replace).toHaveBeenLastCalledWith('/fin-app/page/ledger', { scroll: false })
  })

  it('a card opens its lines, a line its own screen, and a record there opens in the app', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^Assets/ }))
    expect(window.location.search).toBe('?m=2026-09&f=asset')
    expect(screen.getByRole('heading', { name: 'Assets' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cash & Bank - Hong Leong 3000/ }))
    expect(window.location.search).toBe('?m=2026-09&f=asset&d=3000')
    expect(screen.getByRole('heading', { name: 'Cash & Bank - Hong Leong' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/payments?id=v1')
  })

  it('Back from a line’s screen reached by a link goes up to its card', () => {
    window.history.replaceState(null, '', '/fin-app/page/ledger?m=2026-09&f=asset&d=3000')
    draw('m=2026-09&f=asset&d=3000')
    fireEvent.click(screen.getByRole('button', { name: 'Back to Assets' }))
    expect(window.location.search).toBe('?m=2026-09&f=asset')
  })

  it('the Segment is the ⋯’s, each segment the server’s to read', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Segment · All segments/ }))
    const seg = await screen.findByRole('dialog', { name: 'Segment' })
    fireEvent.click(within(seg).getByRole('menuitem', { name: 'HR' }))
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/page/ledger?m=2026-09&s=hr', { scroll: false })
  })
})
