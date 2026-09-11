import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import type { MemberBand, MemberData, QuoteInput } from './types'
import { acknowledgeMemberMemo, calculateMemberQuote, loadMemberData } from './server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), createClient: vi.fn(), adminClient: vi.fn(), rpc: vi.fn(), adminFrom: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ adminClient: mocks.adminClient }))

const schemeId = '10000000-0000-4000-8000-000000000001'
const productId = '10000000-0000-4000-8000-000000000002'
const userId = '10000000-0000-4000-8000-000000000003'
const band: MemberBand = { brand: 'AKEMI', key: 'Tier 1', kind: 'incentive', threshold: 40, multiplier: 1, amount: 100 }
const quote: QuoteInput = { schemeId, lines: [{ productId, quantity: 1, gift: false }], price: '5000', delivery: '500' }
const privateProduct = {
  id: productId, item_code: 'AK-QUEEN', product_name: 'Queen Mattress', brand_code: 'AKEMI',
  unit_cost: 2000, is_active: true, updated_at: '2026-09-12T00:00:00Z',
  member_product_options: { category: 'mattress', size: 'Queen', color: '', gift: false, available: true, updated_at: '2026-09-12T00:00:00Z' },
}
function user(overrides: Partial<User> = {}): User {
  return { id: userId, name: 'Principal', email: 'principal@example.com', role: 'principal', is_active: true, created_at: '', updated_at: '', permissions: [], ...overrides }
}
function snapshot(): MemberData {
  return {
    demo: false, configured: true, refreshedAt: '', profile: { id: userId, userId, name: 'Principal', email: 'principal@example.com', salary: null },
    memberships: [], products: [{ id: productId, code: 'AK-QUEEN', name: 'Queen Mattress', brand: 'AKEMI', category: 'mattress', size: 'Queen', color: '', gift: false, available: true, cost: 2000, version: 'v1' }],
    bands: [band], incomes: [], orders: [], requests: [], memos: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue(user())
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: snapshot(), error: null })
  mocks.adminFrom.mockImplementation(() => {
    const response = Promise.resolve({ data: [privateProduct], error: null })
    const query = { select: vi.fn(), in: vi.fn(), eq: vi.fn(), limit: vi.fn(), then: response.then.bind(response) }
    for (const method of [query.select, query.in, query.eq, query.limit]) method.mockReturnValue(query)
    return query
  })
  mocks.adminClient.mockReturnValue({ from: mocks.adminFrom })
})

describe('Principal Revenue View server boundary', () => {
  it.each([
    { role: 'principal' as const },
    { role: 'revenue_member' as const, actualRole: 'principal' as const },
  ])('loads the Principal overview for $role without requiring an employee membership', async identity => {
    mocks.getUser.mockResolvedValue(user(identity))
    const result = await loadMemberData()
    expect(mocks.rpc).toHaveBeenCalledWith('member_principal_snapshot', undefined)
    expect(result).toMatchObject({ demo: false, configured: true, principalView: true, profile: { id: userId, salary: null } })
    expect(result.products[0]).not.toHaveProperty('cost')
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })

  it('keeps real member accounts on the own-data RPC and rejects a Principal flag in its payload', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal'] }))
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), principalView: true }, error: null })
    const result = await loadMemberData()
    expect(mocks.rpc).toHaveBeenCalledWith('member_data_snapshot', undefined)
    expect(result.principalView).toBe(false)
  })

  it('does not call either snapshot for an account lacking member access', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'finance' }))
    expect((await loadMemberData()).configured).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    { role: 'principal' as const },
    { role: 'revenue_member' as const, actualRole: 'principal' as const },
  ])('quotes through the database-authorized Principal context for $role while keeping cost private', async identity => {
    mocks.getUser.mockResolvedValue(user(identity))
    mocks.rpc.mockResolvedValue({ data: { bands: [band] }, error: null })
    const result = await calculateMemberQuote(quote)
    expect(mocks.rpc).toHaveBeenCalledWith('member_principal_quote_context', { p_scheme: schemeId })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.margin).toBe(60)
    expect(result.data).not.toHaveProperty('cost')
    expect(JSON.stringify(result.data)).not.toContain('unit_cost')
    expect(result.data.customerText).toContain('Queen Mattress')
    expect(mocks.adminFrom).toHaveBeenCalledWith('comm_products')
  })

  it('keeps a real member quotation on the member membership authorization path', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_quote'] }))
    mocks.rpc.mockResolvedValue({ data: { bands: [band] }, error: null })
    expect((await calculateMemberQuote(quote)).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('member_quote_context', { p_scheme: schemeId })
  })

  it('never reads private costs if the database rejects Principal access', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Active Principal access is required' } })
    const result = await calculateMemberQuote(quote)
    expect(result).toEqual({ ok: false, error: 'Active Principal access is required' })
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })

  it.each([
    user({ is_active: false }),
    user({ role: 'revenue_member', permissions: [] }),
  ])('refuses unauthorized quotation before any cost lookup', async identity => {
    mocks.getUser.mockResolvedValue(identity)
    expect((await calculateMemberQuote(quote)).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })

  it('does not extend the Principal quote exception to personal member memo acknowledgements', async () => {
    expect((await acknowledgeMemberMemo(productId, true)).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
