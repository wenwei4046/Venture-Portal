import { beforeEach, describe, expect, it, vi } from 'vitest'

// 2026-10-28 — Marketing's own pool hands out the very Excel and PDF Finance takes for Marketing (the user: "Excel/PDF
// 也给"): Marketing's segment, never one from the address.

const mocks = vi.hoisted(() => ({
  requireActionOn: vi.fn(),
  adminClient: vi.fn(),
  monthlyPnlFile: vi.fn(),
  monthlyCashFlowFile: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireActionOn: mocks.requireActionOn }))
vi.mock('@/lib/supabase/admin', () => ({ adminClient: mocks.adminClient }))
vi.mock('../../../reports/_lib/monthly-files', async (orig) => ({
  ...(await orig<object>()),
  monthlyPnlFile: mocks.monthlyPnlFile,
  monthlyCashFlowFile: mocks.monthlyCashFlowFile,
}))
vi.mock('@/lib/office-time', async (orig) => ({ ...(await orig<object>()), officeMonth: () => '2026-10' }))

import { GET } from './route'

const ADMIN = { admin: true }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireActionOn.mockResolvedValue({ id: 'sj', role: 'staff', permissions: ['marketing_pool'] })
  mocks.adminClient.mockReturnValue(ADMIN)
  mocks.monthlyPnlFile.mockResolvedValue(new Response('pnl'))
  mocks.monthlyCashFlowFile.mockResolvedValue(new Response('cash'))
})

describe('Marketing’s pool files', () => {
  it('asks for the page’s Export', async () => {
    await GET(new Request('http://localhost/marketing/pool/export?format=xlsx&period=2026-10'))
    expect(mocks.requireActionOn).toHaveBeenCalledWith('/marketing/pool', 'marketing_pool', 'export')
  })

  it('hands out the P&L’s file for Marketing, through the service role', async () => {
    const res = await GET(new Request('http://localhost/marketing/pool/export?view=pnl&format=pdf&period=2026-09&from=2026-04'))
    expect(await res.text()).toBe('pnl')
    expect(mocks.monthlyPnlFile).toHaveBeenCalledWith(ADMIN, { format: 'pdf', period: '2026-09', from: '2026-04', segment: 'marketing' })
    expect(mocks.monthlyCashFlowFile).not.toHaveBeenCalled()
  })

  it('hands out the Cash Flow’s unless the P&L is asked for — and never another segment', async () => {
    await GET(new Request('http://localhost/marketing/pool/export?format=xlsx&period=2026-10&segment=hr'))
    expect(mocks.monthlyCashFlowFile).toHaveBeenCalledWith(ADMIN, { format: 'xlsx', period: '2026-10', from: undefined, segment: 'marketing' })
  })
})
