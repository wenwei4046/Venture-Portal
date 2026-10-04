import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import type { MemberBand, MemberData, QuoteInput } from './types'
import { acknowledgeMemberMemo, calculateMemberQuote, loadMemberData, loadMemberInsight, loadMemberOrgMap } from './server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), createClient: vi.fn(), adminClient: vi.fn(), rpc: vi.fn(), adminRpc: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ getMemberUser: mocks.getUser }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ adminClient: mocks.adminClient }))

const schemeId = '10000000-0000-4000-8000-000000000001'
const productId = '10000000-0000-4000-8000-000000000002'
const userId = '10000000-0000-4000-8000-000000000003'
const band: MemberBand = { brand: 'AKEMI', key: 'Tier 1', kind: 'incentive', threshold: 40, multiplier: 1, amount: 100 }
const quote: QuoteInput = { schemeId, lines: [{ productId, quantity: 1, gift: false }], price: '5000', delivery: '500' }
// A SKU as `member_catalogue(…, p_priced => true)` answers it: the portal's price rides along.
const privateProduct = {
  id: productId, code: 'AK-QUEEN', name: 'Queen Mattress', brand: 'AKEMI', category: 'Mattress',
  size: 'Queen', color: '', available: true, gift: false, modelId: null, kind: 'MATTRESS',
  baseModel: 'AK', moduleCode: null, price: 2000, grid: null, version: '2026-09-12T00:00:00Z:',
}
function pricedCatalogue(products: unknown[], extra: Record<string, unknown> = {}) {
  return { data: { products, models: [], optionPrices: [], combos: [], ...extra }, error: null }
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
  mocks.adminRpc.mockResolvedValue(pricedCatalogue([privateProduct]))
  mocks.adminClient.mockReturnValue({ rpc: mocks.adminRpc })
})

describe('Principal Revenue View server boundary', () => {
  const context = { staffId: productId, subDepartmentId: schemeId }
  it.each([
    { role: 'principal' as const },
    { role: 'revenue_member' as const, actualRole: 'principal' as const },
  ])('reads Insight and map through explicit authenticated Principal context for $role', async identity => {
    mocks.getUser.mockResolvedValue(user(identity))
    mocks.rpc.mockResolvedValueOnce({ data: { blocks: [] }, error: null })
    expect((await loadMemberInsight('2026-08', context)).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_principal_insight_snapshot', {
      p_staff: productId, p_sub_department: schemeId, p_period: '2026-08',
    })
    mocks.rpc.mockResolvedValueOnce({ data: { people: [] }, error: null })
    expect((await loadMemberOrgMap({ subDepartmentId: schemeId })).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_principal_org_map', { p_sub_department: schemeId })
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })

  it('rejects forged cross-member context and missing or invalid Principal selections before RPC', async () => {
    expect((await loadMemberInsight()).ok).toBe(false)
    expect((await loadMemberOrgMap({ subDepartmentId: 'bad' })).ok).toBe(false)
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal', 'member_insight'] }))
    expect((await loadMemberInsight('2026-09', context)).ok).toBe(false)
    expect((await loadMemberOrgMap(context)).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('preserves own-member Insight and map calls without staff IDs', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal', 'member_insight'] }))
    mocks.rpc.mockResolvedValueOnce({ data: { blocks: [] }, error: null })
    expect((await loadMemberInsight('2026-09')).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_insight_snapshot', { p_period: '2026-09' })
    mocks.rpc.mockResolvedValueOnce({ data: { people: [] }, error: null })
    expect((await loadMemberOrgMap()).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_org_map', undefined)
  })

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
    expect(JSON.stringify(result.data)).not.toContain('2000')
    expect(result.data.customerText).toContain('Queen Mattress')
    // The portal's own prices, read through the service role only after the
    // session was authorised — just the cart's SKUs and the gift pillows.
    expect(mocks.adminRpc).toHaveBeenCalledWith('member_catalogue', {
      p_brands: ['AKEMI'], p_ids: [productId], p_priced: true, p_suggest: 20,
    })
  })

  it('keeps a real member quotation on the member membership authorization path', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_quote'] }))
    mocks.rpc.mockResolvedValue({ data: { bands: [band] }, error: null })
    expect((await calculateMemberQuote(quote)).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('member_quote_context', { p_scheme: schemeId })
  })

  // Revenue Team cost = unit cost ÷ the scheme's divisor (Fair 0.7): the RM2,000
  // mattress is judged as RM2,857.14, so RM5,000 is a 42.86% margin, not 60%.
  it('judges the margin on the Revenue Team cost the context hands back', async () => {
    mocks.rpc.mockResolvedValue({ data: { bands: [band], costDivisor: '0.7000' }, error: null })
    const result = await calculateMemberQuote(quote)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.margin).toBeCloseTo(42.8572, 3)
    expect(result.data.label).toBe('Tier 1 threshold')
    expect(JSON.stringify(result.data)).not.toContain('2857')
  })

  it('lets a brand-less rider ride the mattress and costs it into the same margin', async () => {
    const riderId = '10000000-0000-4000-8000-000000000004'
    const rider = {
      ...privateProduct, id: riderId, code: 'KHJ50-(Q)', name: 'Fenrir bed frame', brand: null,
      category: 'Bed frame', kind: 'BEDFRAME', baseModel: 'KHJ50', price: 500,
    }
    mocks.adminRpc.mockResolvedValue(pricedCatalogue([privateProduct, rider]))
    mocks.rpc.mockResolvedValue({ data: { bands: [band], costDivisor: 1 }, error: null })
    const result = await calculateMemberQuote({ ...quote, lines: [...quote.lines, { productId: riderId, quantity: 1, gift: false }] })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    // (5,000 − 2,500) ÷ 5,000 — the rider's cost counts, Akemi's ladder judges it.
    expect(result.data.margin).toBe(50)
    expect(result.data.label).toBe('Tier 1 threshold')
    expect(result.data.customerText).toContain('Fenrir bed frame')
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

// The calculator sells from the Product List (user 2026-09-24): what Modular
// ticked, at the portal's own prices — options, specials and combos included.
describe('the catalogue behind the member calculator', () => {
  const sofaModel = '10000000-0000-4000-8000-000000000100'
  const frameModel = '10000000-0000-4000-8000-000000000200'
  const moduleA = '10000000-0000-4000-8000-000000000101'
  const moduleB = '10000000-0000-4000-8000-000000000102'
  const frame = '10000000-0000-4000-8000-000000000201'
  const zanotti: MemberBand = { brand: 'ZANOTTI', key: 'Tier 1', kind: 'incentive', threshold: 30, multiplier: 1, amount: 100 }
  const sofaModule = (id: string, module: string, price: number) => ({
    id, code: `8030-${module}`, name: '8030 SOFFIO', brand: 'ZANOTTI', category: 'Sofa', size: module, color: '',
    available: true, gift: false, modelId: sofaModel, kind: 'SOFA', baseModel: '8030', moduleCode: module,
    options: [{ height: '30', tier: 'PRICE_2' }], price: null,
    grid: [{ height: '30', tier: 'PRICE_2', price }], version: 'v1',
  })
  const bedFrame = {
    id: frame, code: 'Y04-(Q)', name: 'Y04', brand: null, category: 'Bed frame', size: 'Queen', color: '',
    available: true, gift: false, modelId: frameModel, kind: 'BEDFRAME', baseModel: 'Y04', moduleCode: null,
    price: 800, grid: null, version: 'v1',
  }
  const models = [
    { id: sofaModel, kind: 'SOFA', options: { leg_heights: ['Default', '4"'], specials: ['Nylon Fabric'] } },
    { id: frameModel, kind: 'BEDFRAME', options: { divan_heights: ['8"', '10"'], leg_heights: ['No Leg', '4"'], gaps: ['12"'] } },
  ]
  const optionPrices = [
    { pool: 'sofa_leg_heights', value: '4"', price: 30 },
    { pool: 'sofa_specials', value: 'Nylon Fabric', price: 50 },
    { pool: 'bedframe_divan_heights', value: '10"', price: 100 },
    { pool: 'bedframe_leg_heights', value: '4"', price: 20 },
  ]
  const sofaQuote = (build: QuoteInput['build'], price = '5000'): QuoteInput => ({
    schemeId, price, delivery: '0', build,
    lines: [{ productId: moduleA, quantity: 1, gift: false }, { productId: moduleB, quantity: 1, gift: false }],
  })

  beforeEach(() => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_quote'] }))
    mocks.rpc.mockResolvedValue({ data: { bands: [zanotti], costDivisor: 1 }, error: null })
    mocks.adminRpc.mockResolvedValue(pricedCatalogue(
      [sofaModule(moduleA, '1A(LHF)', 1000), sofaModule(moduleB, '2NA', 1500), bedFrame],
      { models, optionPrices },
    ))
  })

  it('adds the build options the model was ticked for, at the portal surcharges', async () => {
    const result = await calculateMemberQuote(sofaQuote({ height: '30', tier: 'PRICE_2', leg: '4"', specials: ['Nylon Fabric'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    // (1,000 + 30 + 50) + (1,500 + 30 + 50) = 2,660 → (5,000 − 2,660) ÷ 5,000
    expect(result.data.margin).toBeCloseTo(46.8, 10)
    expect(result.data.customerText).toContain('Sofa build: seat height 30 · Tier 2 fabric · leg 4" · Nylon Fabric')
  })

  it('refuses an option the model was not ticked for', async () => {
    const result = await calculateMemberQuote(sofaQuote({ height: '30', tier: 'PRICE_2', leg: '6"' }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.error).toContain('leg height')
  })

  it('costs a sofa that covers a priced combo at the combo, spread over its modules', async () => {
    mocks.adminRpc.mockResolvedValue(pricedCatalogue(
      [sofaModule(moduleA, '1A(LHF)', 1000), sofaModule(moduleB, '2NA', 1500)],
      {
        models, optionPrices,
        combos: [{ erpId: 'c1', baseModel: '8030', modules: [['1A(LHF)'], ['2NA']], tier: null, label: 'L-shape',
          effectiveFrom: '2026-01-01', createdAt: null, priceByHeight: { '30': 2000 } }],
      },
    ))
    const result = await calculateMemberQuote(sofaQuote({ height: '30', tier: 'PRICE_2' }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    // The set costs RM 2,000, not 1,000 + 1,500 → (5,000 − 2,000) ÷ 5,000
    expect(result.data.margin).toBeCloseTo(60, 10)
  })

  // 2026-10-05: a bed frame's divan, leg and gap are CHARGED to the customer
  // on top of the price — out of the margin, in the commission.
  it('charges a bed frame’s divan and leg on top of the price, out of the margin', async () => {
    const result = await calculateMemberQuote({
      schemeId, price: '2000', delivery: '0',
      lines: [{ productId: frame, quantity: 1, gift: false }],
      build: { bedframe: { divan: '10"', leg: '4"', gap: '12"' } },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    // The frame's 800 alone → (2,000 − 800) ÷ 2,000; the 100 + 20 ride on top.
    expect(result.data.margin).toBeCloseTo(60, 10)
    expect(result.data.optionCharge).toBe(120)
    expect(result.data.customerPays).toBe(2120)
    expect(result.data.customerText).toContain('Bed frame build: divan 10" · leg 4" · gap 12"')
    expect(result.data.customerText).toContain('Bed frame options: RM 120.00')
    expect(result.data.customerText).toContain('Total: RM 2120.00')
  })

  it('builds each bed frame on its own: FOC, or what Maintenance charges for it', async () => {
    const charged = models.map(m => m.id === frameModel
      ? { ...m, charges: { divan_heights: [{ value: '10"', charge: 100 }], leg_heights: [{ value: '4"', charge: 20 }] } }
      : m)
    mocks.adminRpc.mockResolvedValue(pricedCatalogue([bedFrame], { models: charged, optionPrices }))
    const result = await calculateMemberQuote({
      schemeId, price: '4000', delivery: '0',
      lines: [
        { productId: frame, quantity: 1, gift: false, bedframe: { leg: '4"' } },
        { productId: frame, quantity: 1, gift: false },
      ],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.margin).toBeCloseTo(((4000 - 1600) / 4000) * 100, 10)
    expect(result.data.optionCharge).toBe(20)
    expect(result.data.optionCharges).toEqual([{ label: 'Y04 · leg 4"', qty: 1, amount: 20 }])
    expect(result.data.customerText).toContain('Product · Y04 / Queen (leg 4") × 1')
    expect(result.data.customerText).toContain('Product · Y04 / Queen × 1')

    // An option it is not charged for is FOC — not a choice the server takes.
    const foc = await calculateMemberQuote({
      schemeId, price: '2000', delivery: '0',
      lines: [{ productId: frame, quantity: 1, gift: false, bedframe: { leg: 'No Leg' } }],
    })
    expect(foc.ok).toBe(false)
    if (foc.ok) throw new Error('expected a refusal')
    expect(foc.error).toMatch(/leg height is not offered for this bed frame/)
  })

  it('never lets a price or grid reach the snapshot, and keeps only well-formed dropdowns', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal', 'member_quote'] }))
    mocks.rpc.mockResolvedValue({
      data: {
        ...snapshot(),
        products: [{ ...sofaModule(moduleA, '1A(LHF)', 1000), cost: 999 }],
        catalogueModels: [...models, { id: 'x', kind: 'MATTRESS', options: {} }, { kind: 'SOFA' }],
      },
      error: null,
    })
    const data = await loadMemberData()
    expect(JSON.stringify(data.products)).not.toMatch(/"(price|grid|cost|costGrid)"/)
    expect(data.products[0]).toMatchObject({ modelId: sofaModel, kind: 'SOFA', moduleCode: '1A(LHF)' })
    expect(data.catalogueModels?.map(m => m.id)).toEqual([sofaModel, frameModel])
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })

  it('quotes a seat height however the Product List spells it (STD, 75cm, even ?)', async () => {
    const odd = (id: string, height: string) => ({
      ...sofaModule(id, '1A(LHF)', 1000), options: [{ height, tier: 'PRICE_2' }],
      grid: [{ height, tier: 'PRICE_2', price: 1000 }],
    })
    for (const height of ['STD', '75cm', '?']) {
      mocks.adminRpc.mockResolvedValue(pricedCatalogue([odd(moduleA, height)], { models, optionPrices }))
      const result = await calculateMemberQuote({
        schemeId, price: '5000', delivery: '0', build: { height, tier: 'PRICE_2' },
        lines: [{ productId: moduleA, quantity: 1, gift: false }],
      })
      expect(result.ok).toBe(true)
    }
  })

  it('refuses a malformed build before any cost lookup', async () => {
    const result = await calculateMemberQuote(sofaQuote({ height: '30', tier: 'PRICE_2', specials: ['<script>'] }))
    expect(result.ok).toBe(false)
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })
})
