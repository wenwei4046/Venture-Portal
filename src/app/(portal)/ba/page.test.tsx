import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { withActions } from '@/test/with-actions'

// 2026-10-10 — the handoff: the Financing register keeps a default
// arrangement for everyone like the other Finance tables — set by whoever may
// record financing (Treasury · Create), as on Fund IN / Fund OUT.

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), createClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, requirePermission: mocks.requirePermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('./_components/BaView', () => ({
  default: (p: { canSetDefault?: boolean; rows: unknown[] }) => (
    <pre data-testid="view">{JSON.stringify({ canSetDefault: !!p.canSetDefault, rows: p.rows.length })}</pre>
  ),
}))

import BaPage from './page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({
    from: () => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'neq', 'in', 'order']) q[m] = () => q
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res)
      return q
    },
  })
})

const page = () => BaPage({ searchParams: Promise.resolve({}) })

describe('Invoice Financing’s default arrangement', () => {
  it('may be set by an account that records financing', async () => {
    mocks.requirePermission.mockResolvedValue(withActions({ role: 'finance', permissions: ['treasury'] }))
    render(await page())
    expect(JSON.parse(screen.getByTestId('view').textContent ?? '{}')).toEqual({ canSetDefault: true, rows: 0 })
  })

  it('not by one that only reads it', async () => {
    mocks.requirePermission.mockResolvedValue({ ...withActions({ role: 'finance', permissions: ['treasury'] }), actions: { 'treasury.view': 'all' } })
    render(await page())
    expect(JSON.parse(screen.getByTestId('view').textContent ?? '{}')).toEqual({ canSetDefault: false, rows: 0 })
  })
})
