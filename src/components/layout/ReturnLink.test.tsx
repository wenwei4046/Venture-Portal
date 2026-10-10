import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { back, previousEntryIs } = vi.hoisted(() => ({ back: vi.fn(), previousEntryIs: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back }) }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}))
vi.mock('@/lib/history-entry', () => ({ previousEntryIs }))

import ReturnLink from './ReturnLink'

const LEDGER = '/revenue/fair/2026-09-01?person=agent'

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('ReturnLink', () => {
  it('steps back when the page it names is the one the reader came from', () => {
    previousEntryIs.mockReturnValue(true)
    render(<ReturnLink href={LEDGER}>← ANTHONY</ReturnLink>)
    const link = screen.getByRole('link', { name: '← ANTHONY' })
    expect(link).toHaveAttribute('href', LEDGER)
    expect(fireEvent.click(link)).toBe(false) // the link's own navigation is replaced
    expect(previousEntryIs).toHaveBeenCalledWith(LEDGER)
    expect(back).toHaveBeenCalledOnce()
  })

  it('is an ordinary link when the reader came from anywhere else', () => {
    previousEntryIs.mockReturnValue(false)
    render(<ReturnLink href={LEDGER}>← ANTHONY</ReturnLink>)
    expect(fireEvent.click(screen.getByRole('link', { name: '← ANTHONY' }))).toBe(true)
    expect(back).not.toHaveBeenCalled()
  })

  // 2026-10-10 — a list the sidebar opened has no ?period=, while the link
  // names its month: that list counts as where the reader came from too.
  it('steps back to any of the other addresses the page counts as where it came from', () => {
    previousEntryIs.mockImplementation((href: string) => href === '/statements')
    render(<ReturnLink href="/statements?period=2026-10-01" alsoFrom={['/statements']}>← Back to Service Billing</ReturnLink>)
    expect(fireEvent.click(screen.getByRole('link', { name: '← Back to Service Billing' }))).toBe(false)
    expect(back).toHaveBeenCalledOnce()
  })

  it('leaves a new-tab or modified click to the browser', () => {
    previousEntryIs.mockReturnValue(true)
    render(<ReturnLink href={LEDGER}>← ANTHONY</ReturnLink>)
    const link = screen.getByRole('link', { name: '← ANTHONY' })
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true)
    expect(fireEvent.click(link, { metaKey: true })).toBe(true)
    expect(fireEvent.click(link, { shiftKey: true })).toBe(true)
    expect(back).not.toHaveBeenCalled()
  })
})
