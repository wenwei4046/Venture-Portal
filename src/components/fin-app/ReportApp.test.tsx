import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReportModel } from '@/lib/fin-app/report-model'

// The Report tab on the phone (2026-10-15, M15–M16): a report's headline under
// its month, its cards, a card's lines (an invoice opening in the app), the
// design's two files in the bar, ours in the ⋯ with the Segment.

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, replace: mocks.replace }),
  usePathname: () => '/fin-app/report/debtor',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/layout/RouteFreshener', () => ({ default: () => null }))

import FinAppFrame from './FinAppFrame'
import ReportApp, { type ReportFile } from './ReportApp'
import { resetNav } from './nav'

const MODEL: ReportModel = {
  hub: 'debtor',
  hero: { value: 'RM 64,645.66', label: 'Owed to HV · as at 15 Oct 2026' },
  chip: null,
  eyebrow: 'Debtor aging · as at 15 Oct 2026',
  cards: [
    {
      key: 'd0_30',
      tone: 'paid',
      icon: 'payroll',
      label: '0–30 days',
      sub: '1 invoice',
      value: 'RM 63,440.00',
      groups: [{ key: 'd0_30', title: 'Invoices', count: '1 · RM 63,440.00', lines: [{ key: 'i3', label: 'Hookka', sub: 'HV-INV-202610-0024 · 3 days', value: '63,440.00', open: { hub: 'invoices', id: 'i3' } }] }],
    },
    {
      key: 'd90_plus',
      tone: 'pending_approval',
      icon: 'calendar',
      label: '90+ days',
      sub: '0 invoices',
      value: 'RM 0.00',
      groups: [{ key: 'd90_plus', title: 'Invoices', count: '0 · RM 0.00', lines: [], empty: 'Nothing in this bucket.' }],
    },
  ],
}
const FILES: ReportFile[] = [
  { key: 'pdf', label: 'Export PDF', href: '/reports/debtor-aging/export?format=pdf&view=detail', format: 'pdf' },
  { key: 'xlsx', label: 'Export Excel', href: '/reports/debtor-aging/export?format=xlsx&view=detail', format: 'xlsx' },
  { key: 'summary-pdf', label: 'Summary PDF', href: '/reports/debtor-aging/export?format=pdf&view=summary', format: 'pdf' },
]

function draw({ search = '', model = MODEL, files = FILES, segment = null, ym = '2026-10' }: { search?: string; model?: ReportModel; files?: ReportFile[]; segment?: { value: string; options: Array<{ value: string; label: string }> } | null; ym?: string } = {}) {
  window.history.replaceState(null, '', `/fin-app/report/${model.hub}${search ? `?${search}` : ''}`)
  return render(
    <FinAppFrame platform="android" rows={['pnl', 'cf', 'debtor', 'loan', 'bs']}>
      <ReportApp model={model} search={search} month={{ ym, thisMonth: '2026-10' }} segment={segment} files={files} />
    </FinAppFrame>,
  )
}

let opened: string[] = []
beforeEach(() => {
  resetNav()
  opened = []
  vi.spyOn(window, 'open').mockImplementation((url) => {
    opened.push(String(url))
    return null
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('a report on the phone', () => {
  it('opens on its headline under the month, its cards, the design’s two files and our ⋯', () => {
    draw()
    expect(screen.getByRole('link', { name: 'Debtor aging' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('RM 64,645.66')).toBeInTheDocument()
    expect(screen.getByText('Owed to HV · as at 15 Oct 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled() // nothing past the office's month
    expect(screen.getByRole('button', { name: /^0–30 days 1 invoice RM 63,440\.00/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }))
    expect(opened).toEqual(['/reports/debtor-aging/export?format=pdf&view=detail'])
  })

  it('a card opens its lines; an invoice opens in the app', async () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /^0–30 days/ }))
    expect(window.location.search).toBe('?f=d0_30')
    expect(screen.getByRole('heading', { name: '0–30 days' })).toBeInTheDocument()
    expect(screen.getByText('Debtor aging · as at 15 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('HV-INV-202610-0024 · 3 days')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(mocks.push).toHaveBeenCalledWith('/fin-app/daily/invoices?id=i3')
  })

  it('an empty card says so', () => {
    draw({ search: 'f=d90_plus' })
    expect(screen.getByText('Nothing in this bucket.')).toBeInTheDocument()
  })

  it('another month is the server’s to read — the list kept', async () => {
    draw({ search: 'f=d0_30' })
    fireEvent.click(screen.getByRole('button', { name: /Back to/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    })
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/report/debtor?m=2026-09', { scroll: false })
  })

  it('the ⋯ holds the other files and the Segment; a segment is said under the headline', async () => {
    const segment = { value: 'marketing', options: [{ value: '', label: 'All segments (consolidated)' }, { value: 'marketing', label: 'Marketing' }] }
    draw({ segment, model: { ...MODEL, hub: 'bs', chip: 'Segment only · won’t balance', hero: { value: 'RM 222,561.11', label: 'Total assets · 31 Oct 2026' } } })
    expect(screen.getByText('Total assets · 31 Oct 2026 · Marketing')).toBeInTheDocument()
    expect(screen.getByText('Segment only · won’t balance')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Summary PDF' })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Segment · Marketing' }))
    const choices = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(choices).getByRole('menuitem', { name: 'All segments (consolidated)' }))
    })
    expect(mocks.replace).toHaveBeenCalledWith('/fin-app/report/bs', { scroll: false })
  })

  it('a reader who may not export sees no files', () => {
    draw({ files: [] })
    expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })
})
