import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import type { MemberBand, MemberData, QuoteInput } from './types'
import { acknowledgeMemberMemo, calculateMemberQuote, cancelMemberRequest, loadMemberCatalogue, loadMemberClaimRates, loadMemberData, loadMemberInsight, loadMemberOrgMap, loadMemberReplacementForm, loadMemberReplacementFormLink, loadMemberWaitingForm, loadMemberWaitingFormLink, loadMemberWaitingQueue, submitMemberRequest } from './server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), createClient: vi.fn(), adminClient: vi.fn(), rpc: vi.fn(), adminRpc: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ requirePage: async () => undefined, getMemberUser: mocks.getUser }))
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
// The service role's two answers to a quote: the priced catalogue, and the
// scheme's cost rules (`member_quote_cost_rules`, 2026-10-05).
const RULES = { costDivisor: 1, costRatios: {} }
function adminAnswers(catalogue: unknown, rules: unknown = RULES) {
  return (fn: string) => Promise.resolve(fn === 'member_quote_cost_rules' ? { data: rules, error: null } : catalogue)
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
  mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue([privateProduct])))
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

  // 2026-10-08: every open of the Revenue app waited for the Quote's catalogue (551 ms of the Principal's 610 ms
  // snapshot, 340 KB of its 480 KB). The first screen asks without it; the Quote reads it on its own.
  it('asks for the first screen without the Quote catalogue, for the Principal and a member alike', async () => {
    await loadMemberData({ lite: true })
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_principal_snapshot', { p_full: false })
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal'] }))
    await loadMemberData({ lite: true })
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_data_snapshot', { p_full: false })
  })

  it('reads the catalogue from the full snapshot through the same projection — never a cost', async () => {
    const result = await loadMemberCatalogue()
    expect(mocks.rpc).toHaveBeenLastCalledWith('member_principal_snapshot', undefined)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.products[0]).toMatchObject({ id: productId, code: 'AK-QUEEN' })
    expect(result.data.products[0]).not.toHaveProperty('cost')
    expect(result.data.catalogueModels).toEqual([])
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
    expect(mocks.adminRpc).toHaveBeenCalledWith('member_quote_cost_rules', { p_scheme: schemeId })
  })

  it('keeps a real member quotation on the member membership authorization path', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_quote'] }))
    mocks.rpc.mockResolvedValue({ data: { bands: [band] }, error: null })
    expect((await calculateMemberQuote(quote)).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('member_quote_context', { p_scheme: schemeId })
  })

  // Revenue Team cost = unit cost ÷ the scheme's divisor (Fair 0.7): the RM2,000
  // mattress is judged as RM2,857.14, so RM5,000 is a 42.86% margin, not 60%.
  // 2026-10-05 (user): the ratio comes from the service role only — a member's
  // own login can call the quote context, so whatever it says is not read —
  // and it judges the margin here and stays here.
  it('judges the margin on the Revenue Team cost the service-role rules give, and keeps the ratio', async () => {
    mocks.rpc.mockResolvedValue({ data: { bands: [band], costDivisor: 1 }, error: null })
    mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue([privateProduct]), { costDivisor: '0.7000', costRatios: {} }))
    const result = await calculateMemberQuote(quote)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.margin).toBeCloseTo(42.8572, 3)
    expect(result.data.label).toBe('Tier 1 threshold')
    expect(JSON.stringify(result.data)).not.toContain('2857')
    expect(result.data).not.toHaveProperty('costDivisor')
    expect(JSON.stringify(result.data)).not.toMatch(/divisor|ratio/i)
  })

  it('refuses rather than quote at the cost as keyed when the cost rules are missing', async () => {
    mocks.rpc.mockResolvedValue({ data: { bands: [band] }, error: null })
    for (const rules of [null, {}, { costDivisor: 0 }, { costDivisor: 'x' }]) {
      mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue([privateProduct]), rules))
      expect(await calculateMemberQuote(quote)).toEqual({ ok: false, error: 'The margin rules for this department are not configured.' })
    }
    // A refused read says the same — never the database's own words about it.
    mocks.adminRpc.mockImplementation((fn: string) => Promise.resolve(fn === 'member_quote_cost_rules'
      ? { data: null, error: { message: 'permission denied for function member_quote_cost_rules' } }
      : pricedCatalogue([privateProduct])))
    expect(await calculateMemberQuote(quote)).toEqual({ ok: false, error: 'The margin rules for this department are not configured.' })
  })

  it('judges a SKU with a ratio of its own at that ratio', async () => {
    mocks.rpc.mockResolvedValue({ data: { bands: [band] }, error: null })
    mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue([privateProduct]), { costDivisor: 0.7, costRatios: { 'AK-QUEEN': 0.5 } }))
    const result = await calculateMemberQuote(quote)
    if (!result.ok) throw new Error(result.error)
    // 2,000 ÷ 0.5 = 4,000 → (5,000 − 4,000) ÷ 5,000
    expect(result.data.margin).toBeCloseTo(20, 10)
  })

  it('lets a brand-less rider ride the mattress and costs it into the same margin', async () => {
    const riderId = '10000000-0000-4000-8000-000000000004'
    const rider = {
      ...privateProduct, id: riderId, code: 'KHJ50-(Q)', name: 'Fenrir bed frame', brand: null,
      category: 'Bed frame', kind: 'BEDFRAME', baseModel: 'KHJ50', price: 500,
    }
    mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue([privateProduct, rider])))
    mocks.rpc.mockResolvedValue({ data: { bands: [band] }, error: null })
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

// `member_claim_rates` is HR's table: asked for as a function it failed every
// time, the claim form had no region and no rate, and nothing could be sent (2026-10-06).
describe('the claim form reads HR’s rates', () => {
  const rates = { base: 'Klang Valley', perSpot: 50, perPaxNight: 65, regions: [{ id: productId, name: 'Penang', spots: 4 }] }

  it.each([
    { who: 'a member', identity: { role: 'revenue_member' as const, permissions: ['member_portal', 'member_requests'] } },
    { who: 'the Principal in View as', identity: { role: 'principal' as const } },
  ])('through member_claim_settings, for $who', async ({ identity }) => {
    mocks.getUser.mockResolvedValue(user(identity))
    mocks.rpc.mockResolvedValueOnce({ data: rates, error: null })
    expect(await loadMemberClaimRates()).toEqual({ ok: true, data: rates })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('member_claim_settings', undefined)
  })

  it('asks nothing for an account without member access', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'finance', permissions: ['treasury'] }))
    expect((await loadMemberClaimRates()).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

// What the Revenue app's three forms send (RequestForm's `submit`), as a member
// sends it: prepared, then submitted, with nothing typed taken as money.
describe('a member sends a request', () => {
  const fair = '10000000-0000-4000-8000-000000000010'
  const ir = '10000000-0000-4000-8000-000000000011'
  const region = '10000000-0000-4000-8000-000000000020'
  const yuny = '10000000-0000-4000-8000-000000000030'
  const requestId = '10000000-0000-4000-8000-000000000040'
  const key = '10000000-0000-4000-8000-000000000050'
  const form = (fields: Record<string, string>) => {
    const data = new FormData()
    for (const [name, value] of Object.entries(fields)) data.set(name, value)
    return data
  }
  const sent = { id: requestId, kind: 'claim', title: 'Outstation claim · MITC Melaka', status: 'submitted', createdAt: '', requestNo: 'RQ-2610-001', detail: {} }

  beforeEach(() => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal', 'member_requests'] }))
    mocks.rpc
      .mockResolvedValueOnce({ data: { id: requestId, userId, status: 'draft' }, error: null })
      .mockResolvedValueOnce({ data: sent, error: null })
  })

  // 2026-10-06: the fair, its venue and its region are the database's — a region, place or brand the
  // phone sends is not even passed on.
  it('an outstation claim: only the weekend — no region, no place, no amount, no invoice', async () => {
    const result = await submitMemberRequest(form({
      kind: 'claim', subDepartmentId: fair, idempotencyKey: key, claimType: 'outstation', week: '2026-10-02',
      brand: 'AKEMI', location: 'Sabah', notes: '', region,
    }))
    expect(result).toEqual({ ok: true, data: sent })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'member_prepare_request', {
      p_kind: 'claim', p_sub_department: fair, p_idempotency: key, p_revision: null,
      p_detail: { claimType: 'outstation', week: '2026-10-02', notes: '' },
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'member_submit_request', { p_request: requestId })
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })

  // 2026-10-13: a food claim is a month — its weekends and the days of each ticked ("submit by total month");
  // the rate, the fairs and the amount are the database's.
  it('a food claim: the month and its weekends, each once and in order — no week, no amount, no invoice', async () => {
    const weeks = JSON.stringify([
      { week: '2026-09-18', days: ['2026-09-20', '2026-09-18', '2026-09-18'] },
      { week: '2026-09-11', days: ['2026-09-11'] },
    ])
    const result = await submitMemberRequest(form({
      kind: 'claim', subDepartmentId: fair, idempotencyKey: key, claimType: 'food', month: '2026-09', weeks,
      notes: 'Saturday off', amount: '999', rate: '50', week: '2026-09-18',
    }))
    expect(result).toEqual({ ok: true, data: sent })
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'member_prepare_request', {
      p_kind: 'claim', p_sub_department: fair, p_idempotency: key, p_revision: null,
      p_detail: { claimType: 'food', month: '2026-09', notes: 'Saturday off', weeks: [
        { week: '2026-09-11', days: ['2026-09-11'] }, { week: '2026-09-18', days: ['2026-09-18', '2026-09-20'] },
      ] },
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'member_submit_request', { p_request: requestId })
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })

  it('refuses a food claim with no month, no weekend, or one it cannot read', async () => {
    const food = (more: Record<string, string>) => submitMemberRequest(form({ kind: 'claim', subDepartmentId: fair, idempotencyKey: key, claimType: 'food', notes: '', ...more }))
    expect(await food({ weeks: '[]' })).toEqual({ ok: false, error: 'Choose the month the food claim is for.' })
    expect(await food({ month: '2026-13', weeks: '[]' })).toEqual({ ok: false, error: 'Choose the month the food claim is for.' })
    for (const weeks of ['', '[]', 'not json', JSON.stringify([{ week: '2026-10-02', days: ['2026-10-02'] }]), JSON.stringify([{ week: '2026-09-11', days: ['2026-09-31'] }]),
      JSON.stringify([{ week: '2026-09-11', days: [] }]), JSON.stringify([{ week: '2026-09-11', days: ['2026-09-11'] }, { week: '2026-09-11', days: ['2026-09-12'] }])]) {
      expect(await food({ month: '2026-09', weeks })).toEqual({ ok: false, error: 'Tick the days you worked at the fairs.' })
    }
    expect(await submitMemberRequest(form({ kind: 'claim', subDepartmentId: fair, idempotencyKey: key, claimType: 'lunch', week: '2026-10-09', notes: '' })))
      .toEqual({ ok: false, error: 'Choose Outstation, Airbnb or a food claim.' })
    mocks.rpc.mockReset()
  })

  it('a plane ticket: its price and its invoice, attested before it is sent', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
    const upload = vi.fn(async () => ({ error: null }))
    const insert = vi.fn(async () => ({ error: null }))
    const attachments = { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: () => attachments, storage: { from: () => ({ upload, remove: vi.fn() }) } })
    mocks.adminClient.mockReturnValue({ from: () => ({ insert }) })
    const data = form({ kind: 'claim', subDepartmentId: fair, idempotencyKey: key, claimType: 'outstation', week: '2026-10-02', notes: '', amount: '456.70' })
    data.set('invoice', new File([pdf], 'flight.pdf', { type: 'application/pdf' }))
    expect((await submitMemberRequest(data)).ok).toBe(true)
    const prepared = mocks.rpc.mock.calls[0][1] as { p_detail: Record<string, unknown> }
    expect(prepared.p_detail).toMatchObject({ claimType: 'outstation', week: '2026-10-02', amount: 456.7, invoiceName: 'flight.pdf' })
    expect(prepared.p_detail.invoiceHash).toMatch(/^[0-9a-f]{64}$/)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ request_id: requestId, mime_type: 'application/pdf', content_sha256: prepared.p_detail.invoiceHash }))
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'member_submit_request', { p_request: requestId })
  })

  it('refuses a plane ticket without a price it can read', async () => {
    expect(await submitMemberRequest(form({ kind: 'claim', subDepartmentId: fair, idempotencyKey: key, claimType: 'outstation', week: '2026-10-02', notes: '', amount: '45.678' })))
      .toEqual({ ok: false, error: 'Enter the plane ticket\'s price, as its invoice shows.' })
    mocks.rpc.mockReset()
  })

  // User 2026-10-06: a small Airbnb group keys the invoice's total; the database caps it and says what is paid.
  describe('an Airbnb stay', () => {
    const airbnb = (fields: Record<string, string>) => {
      const data = form({ kind: 'claim', subDepartmentId: fair, idempotencyKey: key, claimType: 'airbnb', week: '2026-10-02', notes: '',
        start: '2026-10-02', end: '2026-10-04', male: '1', female: '1', ...fields })
      data.set('invoice', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])], 'stay.pdf', { type: 'application/pdf' }))
      return data
    }
    beforeEach(() => {
      const attachments = { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }
      mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: () => attachments, storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })), remove: vi.fn() }) } })
      mocks.adminClient.mockReturnValue({ from: () => ({ insert: vi.fn(async () => ({ error: null })) }) })
    })

    it('passes the invoice total on as a figure for the database to cap', async () => {
      expect((await submitMemberRequest(airbnb({ amount: '500' }))).ok).toBe(true)
      const prepared = mocks.rpc.mock.calls[0][1] as { p_detail: Record<string, unknown> }
      expect(prepared.p_detail).toMatchObject({ claimType: 'airbnb', start: '2026-10-02', end: '2026-10-04', male: 1, female: 1, invoiceAmount: 500, invoiceName: 'stay.pdf' })
      expect(prepared.p_detail).not.toHaveProperty('amount')
    })

    // User 2026-10-12: the rate a person a night is a limit too, so a bigger group types its total as well.
    it('a bigger group passes its total on too', async () => {
      expect((await submitMemberRequest(airbnb({ male: '2', female: '2', amount: '480' }))).ok).toBe(true)
      expect((mocks.rpc.mock.calls[0][1] as { p_detail: Record<string, unknown> }).p_detail).toMatchObject({ male: 2, female: 2, invoiceAmount: 480 })
    })

    it('makes up no total that was not typed — the database asks for it', async () => {
      expect((await submitMemberRequest(airbnb({ male: '2', female: '2' }))).ok).toBe(true)
      expect((mocks.rpc.mock.calls[0][1] as { p_detail: Record<string, unknown> }).p_detail).not.toHaveProperty('invoiceAmount')
    })

    it('refuses a total it cannot read', async () => {
      expect(await submitMemberRequest(airbnb({ amount: '1,200' }))).toEqual({ ok: false, error: 'Enter the stay\'s total from its invoice.' })
      mocks.rpc.mockReset()
    })
  })

  it('a replacement: leaving the sub-department is the database’s member_exit', async () => {
    expect((await submitMemberRequest(form({
      kind: 'replacement', subDepartmentId: fair, idempotencyKey: key, originalStaffId: yuny, destination: 'department_exit',
      replacementSource: 'new', newPerson: 'Amelia Tan', effective: '2026-11-01', reason: 'Moving to Penang',
    }))).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'member_prepare_request', expect.objectContaining({
      p_kind: 'replacement', p_sub_department: fair,
      p_detail: { newPerson: 'Amelia Tan', replacementSource: 'new', originalStaffId: yuny, destination: 'member_exit', effective: '2026-11-01', reason: 'Moving to Penang' },
    }))
  })

  it('a waiting list goes to the sub-department it prefers, signed and consented', async () => {
    expect((await submitMemberRequest(form({
      kind: 'waiting', subDepartmentId: fair, idempotencyKey: key, newPerson: 'Amelia Tan', contact: '012-345 6789',
      targetDepartmentId: ir, start: '2026-11-01', consent: 'true', signature: 'Jia En',
    }))).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'member_prepare_request', expect.objectContaining({
      p_kind: 'waiting', p_sub_department: ir,
      p_detail: { newPerson: 'Amelia Tan', contact: '012-345 6789', start: '2026-11-01', signature: 'Jia En', consent: true },
    }))
  })

  // HR revamp 7a (2026-10-10): the form Sales Groups › Form settings versions.
  describe('a waiting list on HR’s form', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
    const waitingForm = (fields: Record<string, string> = {}) => form({
      kind: 'waiting', subDepartmentId: fair, idempotencyKey: key, newPerson: 'Amelia Tan', contact: '012-345 6789',
      targetDepartmentId: fair, start: '2026-11-01', consent: 'true', signature: 'Jia En', ...fields,
    })
    const upload = vi.fn(async () => ({ error: null }))
    const insert = vi.fn(async () => ({ error: null }))
    beforeEach(() => {
      upload.mockClear()
      insert.mockClear()
      const tables = (name: string) => name === 'member_requests'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { idempotency_key: key }, error: null }) }) }) }
        : { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }
      mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: tables, storage: { from: () => ({ upload, remove: vi.fn() }) } })
      mocks.adminClient.mockReturnValue({ from: () => ({ insert }) })
    })

    it('sends HR’s answers with the form’s version, and attests the signed form before it is sent', async () => {
      const data = waitingForm({ formVersion: '3', answers: JSON.stringify([{ id: 'ic', label: 'IC number', value: ' 900101 ' }, { id: 'bad id', label: 'x', value: 'y' }]) })
      data.set('signedForm', new File([pdf], 'amelia-form.pdf', { type: 'application/pdf' }))
      expect((await submitMemberRequest(data)).ok).toBe(true)
      const prepared = mocks.rpc.mock.calls[0][1] as { p_detail: Record<string, unknown> }
      expect(prepared.p_detail).toMatchObject({ formVersion: 3, signedFormName: 'amelia-form.pdf', answers: [{ id: 'ic', label: 'IC number', value: '900101' }] })
      expect(prepared.p_detail.signedFormHash).toMatch(/^[0-9a-f]{64}$/)
      expect(upload).toHaveBeenCalledTimes(1)
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ request_id: requestId, mime_type: 'application/pdf', content_sha256: prepared.p_detail.signedFormHash }))
      expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'member_submit_request', { p_request: requestId })
    })

    it('refuses a signed form that is not a JPG, PNG or PDF', async () => {
      const data = waitingForm()
      data.set('signedForm', new File(['GIF89a'], 'form.gif', { type: 'image/gif' }))
      expect(await submitMemberRequest(data)).toEqual({ ok: false, error: 'The signed application form must be a valid JPG, PNG or PDF file.' })
      mocks.rpc.mockReset()
    })

    it('a new request cannot claim a signed form it did not upload', async () => {
      expect((await submitMemberRequest(waitingForm({ signedFormName: 'old.pdf', signedFormHash: 'c'.repeat(64) }))).ok).toBe(true)
      const prepared = mocks.rpc.mock.calls[0][1] as { p_detail: Record<string, unknown> }
      expect(prepared.p_detail).not.toHaveProperty('signedFormName')
      expect(prepared.p_detail).not.toHaveProperty('answers')
    })

    it('an update keeps the signed form it was sent with', async () => {
      const hash = 'c'.repeat(64)
      expect((await submitMemberRequest(waitingForm({ requestId, signedFormName: 'old.pdf', signedFormHash: hash }))).ok).toBe(true)
      expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'member_prepare_request', expect.objectContaining({
        p_revision: requestId, p_detail: expect.objectContaining({ signedFormName: 'old.pdf', signedFormHash: hash }),
      }))
      expect(upload).not.toHaveBeenCalled()
    })
  })

  // Round 2's README 18.5 (2026-10-11): a replacement is sent on the Replacement list's own form.
  describe('a replacement on HR’s form', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
    const replacementForm = (fields: Record<string, string> = {}) => form({
      kind: 'replacement', subDepartmentId: fair, idempotencyKey: key, originalStaffId: yuny, destination: 'department_exit',
      replacementSource: 'new', newPerson: 'Amelia Tan', effective: '2026-11-01', reason: 'Moving to Penang', ...fields,
    })
    const upload = vi.fn(async () => ({ error: null }))
    const insert = vi.fn(async () => ({ error: null }))
    beforeEach(() => {
      upload.mockClear()
      insert.mockClear()
      const tables = (name: string) => name === 'member_requests'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { idempotency_key: key }, error: null }) }) }) }
        : { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }
      mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: tables, storage: { from: () => ({ upload, remove: vi.fn() }) } })
      mocks.adminClient.mockReturnValue({ from: () => ({ insert }) })
    })

    it('sends HR’s answers with the form’s version, and attests the signed form before it is sent', async () => {
      const data = replacementForm({ formVersion: '2', answers: JSON.stringify([{ id: 'q_handover', label: 'Handover done?', value: ' Yes ' }]) })
      data.set('signedForm', new File([pdf], 'handover.pdf', { type: 'application/pdf' }))
      expect((await submitMemberRequest(data)).ok).toBe(true)
      const prepared = mocks.rpc.mock.calls[0][1] as { p_kind: string; p_detail: Record<string, unknown> }
      expect(prepared.p_kind).toBe('replacement')
      expect(prepared.p_detail).toMatchObject({
        destination: 'member_exit', reason: 'Moving to Penang', formVersion: 2, signedFormName: 'handover.pdf',
        answers: [{ id: 'q_handover', label: 'Handover done?', value: 'Yes' }],
      })
      expect(prepared.p_detail.signedFormHash).toMatch(/^[0-9a-f]{64}$/)
      expect(upload).toHaveBeenCalledTimes(1)
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ request_id: requestId, mime_type: 'application/pdf', content_sha256: prepared.p_detail.signedFormHash }))
      expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'member_submit_request', { p_request: requestId })
    })

    it('refuses a signed form that is not a JPG, PNG or PDF, in the replacement’s words', async () => {
      const data = replacementForm()
      data.set('signedForm', new File(['GIF89a'], 'form.gif', { type: 'image/gif' }))
      expect(await submitMemberRequest(data)).toEqual({ ok: false, error: 'The signed replacement form must be a valid JPG, PNG or PDF file.' })
      mocks.rpc.mockReset()
    })

    it('an update keeps the signed form it was sent with', async () => {
      const hash = 'd'.repeat(64)
      expect((await submitMemberRequest(replacementForm({ requestId, signedFormName: 'old.pdf', signedFormHash: hash }))).ok).toBe(true)
      expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'member_prepare_request', expect.objectContaining({
        p_revision: requestId, p_detail: expect.objectContaining({ signedFormName: 'old.pdf', signedFormHash: hash }),
      }))
      expect(upload).not.toHaveBeenCalled()
    })
  })
})

describe('the replacement form the Revenue app draws (2026-10-11)', () => {
  const row = { version: 2, requireUpload: false, templatePath: 'templates/abc/Replacement.pdf', templateName: 'Replacement.pdf', createdAt: null,
    fields: [{ id: 'reason', label: 'Reason', type: 'text', required: true, builtin: true }, { id: 'q_handover', label: 'Handover done?', type: 'yesno', required: false }] }
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://files.example/Replacement.pdf?token=1' }, error: null }))
  beforeEach(() => {
    createSignedUrl.mockClear()
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal', 'member_requests'] }))
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, storage: { from: () => ({ createSignedUrl }) } })
  })

  it('is read from member_replacement_form(), with no link in it', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: row, error: null })
    expect(await loadMemberReplacementForm()).toEqual({ ok: true, data: { form: expect.objectContaining({ version: 2, templateName: 'Replacement.pdf' }) } })
    expect(mocks.rpc).toHaveBeenCalledWith('member_replacement_form', undefined)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('Download form asks for a fresh link to HR’s own replacement form, or null for the built one', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: row, error: null })
    expect(await loadMemberReplacementFormLink()).toEqual({ ok: true, data: { url: 'https://files.example/Replacement.pdf?token=1', name: 'Replacement.pdf' } })
    expect(createSignedUrl).toHaveBeenCalledWith('templates/abc/Replacement.pdf', 600, { download: 'Replacement.pdf' })
    mocks.rpc.mockResolvedValueOnce({ data: { ...row, templatePath: null }, error: null })
    expect(await loadMemberReplacementFormLink()).toEqual({ ok: true, data: null })
  })
})

// HR revamp 7b (2026-10-10): Waiting list & replacements reads the member's waiting lists.
describe('the waiting list a member sees', () => {
  const staff = '10000000-0000-4000-8000-000000000030'
  const queue = [{ subDepartmentId: 'fair', name: 'Fair', rows: [{ position: 1, name: 'Daniel L.', mine: false, requestId: 'leak' }] }]

  it('is the member’s own, through member_waiting_queue — nobody else’s request id comes back', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal', 'member_requests'] }))
    mocks.rpc.mockResolvedValueOnce({ data: queue, error: null })
    expect(await loadMemberWaitingQueue()).toEqual({ ok: true, data: [{ subDepartmentId: 'fair', name: 'Fair', rows: [{ position: 1, name: 'Daniel L.', mine: false, requestId: null }] }] })
    expect(mocks.rpc).toHaveBeenCalledWith('member_waiting_queue', undefined)
  })

  it('the Principal reads a viewed member’s, and must name them', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await loadMemberWaitingQueue({ staffId: staff })).toEqual({ ok: true, data: [] })
    expect(mocks.rpc).toHaveBeenCalledWith('member_waiting_queue', { p_staff: staff })
    expect((await loadMemberWaitingQueue()).ok).toBe(false)
  })

  it('a member cannot ask for somebody else’s, and an account without requests asks nothing', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal', 'member_requests'] }))
    expect(await loadMemberWaitingQueue({ staffId: staff })).toEqual({ ok: false, error: 'Only Principal can select another member to view.' })
    mocks.getUser.mockResolvedValue(user({ role: 'finance', permissions: ['treasury'] }))
    expect((await loadMemberWaitingQueue()).ok).toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('the waiting-list form the Revenue app draws', () => {
  const row = { version: 2, requireUpload: true, templatePath: 'templates/abc/HR form.pdf', templateName: 'HR form.pdf', createdAt: null,
    fields: [{ id: 'newPerson', label: 'New member name', type: 'text', required: true, builtin: true }] }
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: 'https://files.example/HR%20form.pdf?token=1' }, error: null }))
  beforeEach(() => {
    createSignedUrl.mockClear()
    mocks.getUser.mockResolvedValue(user({ role: 'revenue_member', permissions: ['member_portal', 'member_requests'] }))
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, storage: { from: () => ({ createSignedUrl }) } })
  })

  it('is read with no link in it — the phone keeps it', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: row, error: null })
    const result = await loadMemberWaitingForm()
    expect(result).toEqual({ ok: true, data: { form: expect.objectContaining({ version: 2, requireUpload: true, templateName: 'HR form.pdf' }) } })
    expect(mocks.rpc).toHaveBeenCalledWith('member_waiting_form', undefined)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('Download form asks for a fresh ten-minute link to HR’s own form', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: row, error: null })
    expect(await loadMemberWaitingFormLink()).toEqual({ ok: true, data: { url: 'https://files.example/HR%20form.pdf?token=1', name: 'HR form.pdf' } })
    expect(createSignedUrl).toHaveBeenCalledWith('templates/abc/HR form.pdf', 600, { download: 'HR form.pdf' })
  })

  it('and is told to build the form when HR uploaded none', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...row, templatePath: null }, error: null })
    expect(await loadMemberWaitingFormLink()).toEqual({ ok: true, data: null })
    expect(createSignedUrl).not.toHaveBeenCalled()
  })

  it('asks nothing for an account without the requests', async () => {
    mocks.getUser.mockResolvedValue(user({ role: 'finance', permissions: ['treasury'] }))
    expect((await loadMemberWaitingForm()).ok).toBe(false)
    expect((await loadMemberWaitingFormLink()).ok).toBe(false)
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
    mocks.rpc.mockResolvedValue({ data: { bands: [zanotti] }, error: null })
    mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue(
      [sofaModule(moduleA, '1A(LHF)', 1000), sofaModule(moduleB, '2NA', 1500), bedFrame],
      { models, optionPrices },
    )))
  })

  // 2026-10-06: an option priced on Maintenance is the customer's — once for the sofa, on top, out of the margin.
  it('charges the options the model was ticked for once for the sofa, on top of the price', async () => {
    const result = await calculateMemberQuote(sofaQuote({ height: '30', tier: 'PRICE_2', leg: '4"', specials: ['Nylon Fabric'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    // 1,000 + 1,500 = 2,500 → (5,000 − 2,500) ÷ 5,000; the leg (30) and Nylon (50) once, on top.
    expect(result.data.margin).toBeCloseTo(50, 10)
    expect(result.data.optionCharge).toBe(80)
    expect(result.data.customerPays).toBe(5080)
    expect(result.data.customerText).toContain('Sofa build: seat height 30 · Tier 2 fabric · leg 4" · Nylon Fabric')
    expect(result.data.customerText).toContain('Option charges: RM 80.00')
  })

  it('refuses an option the model was not ticked for', async () => {
    const result = await calculateMemberQuote(sofaQuote({ height: '30', tier: 'PRICE_2', leg: '6"' }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected a refusal')
    expect(result.error).toContain('leg height')
  })

  it('costs a sofa that covers a priced combo at the combo, spread over its modules', async () => {
    mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue(
      [sofaModule(moduleA, '1A(LHF)', 1000), sofaModule(moduleB, '2NA', 1500)],
      {
        models, optionPrices,
        combos: [{ erpId: 'c1', baseModel: '8030', modules: [['1A(LHF)'], ['2NA']], tier: null, label: 'L-shape',
          effectiveFrom: '2026-01-01', createdAt: null, priceByHeight: { '30': 2000 } }],
      },
    )))
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
    expect(result.data.customerText).toContain('Option charges: RM 120.00')
    expect(result.data.customerText).toContain('Total: RM 2120.00')
  })

  it('builds each bed frame on its own: FOC, or what Maintenance charges for it', async () => {
    const charged = models.map(m => m.id === frameModel
      ? { ...m, charges: { divan_heights: [{ value: '10"', charge: 100 }], leg_heights: [{ value: '4"', charge: 20 }] } }
      : m)
    mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue([bedFrame], { models: charged, optionPrices })))
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

  // 2026-10-06 (user): a special Maintenance leaves unpriced is not shown — nor taken.
  it('takes a bed frame special only when Maintenance charges it', async () => {
    const charged = models.map(m => m.id === frameModel
      ? { ...m, options: { ...m.options, specials: ['Hydraulic', 'HB Straight'] }, charges: { specials: [{ value: 'Hydraulic', charge: 300 }] } }
      : m)
    mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue([bedFrame], {
      models: charged, optionPrices: [...optionPrices, { pool: 'bedframe_specials', value: 'Hydraulic', price: 300 }],
    })))
    const priced = await calculateMemberQuote({
      schemeId, price: '2000', delivery: '0',
      lines: [{ productId: frame, quantity: 1, gift: false, bedframe: { specials: ['Hydraulic'] } }],
    })
    expect(priced.ok).toBe(true)
    if (!priced.ok) throw new Error(priced.error)
    expect(priced.data.optionCharge).toBe(300)

    // Turned ON on Modular, no price on Maintenance: not a choice the server takes.
    const unpriced = await calculateMemberQuote({
      schemeId, price: '2000', delivery: '0',
      lines: [{ productId: frame, quantity: 1, gift: false, bedframe: { specials: ['HB Straight'] } }],
    })
    expect(unpriced.ok).toBe(false)
    if (unpriced.ok) throw new Error('expected a refusal')
    expect(unpriced.error).toMatch(/special is not offered for this bed frame/)
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
      mocks.adminRpc.mockImplementation(adminAnswers(pricedCatalogue([odd(moduleA, height)], { models, optionPrices })))
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

// The Revenue app's sends follow their page's Create box (2026-10-11): the button is not drawn,
// and a stale page or a hand-made request is refused before anything is asked.
describe('a send whose page’s Create was unticked', () => {
  const requestId = '10000000-0000-4000-8000-000000000041'
  const member = (closed: string[]) => user({ role: 'revenue_member', permissions: ['member_portal', 'member_quote', 'member_requests'], closed })
  const kindForm = (kind: string) => { const data = new FormData(); data.set('kind', kind); return data }
  const stored = (kind: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { kind }, error: null }) }) }) })

  it('prices no quote once the Quote’s Create is closed', async () => {
    mocks.getUser.mockResolvedValue(member(['rev.quote.create']))
    expect(await calculateMemberQuote(quote)).toEqual({ ok: false, error: 'Pricing a quote is not open to your account.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.adminClient).not.toHaveBeenCalled()
  })

  it('sends no claim once Requests’ Create is closed — a waiting list is not that box’s', async () => {
    mocks.getUser.mockResolvedValue(member(['rev.requests.create']))
    expect(await submitMemberRequest(kindForm('claim'))).toEqual({ ok: false, error: 'Sending a claim is not open to your account.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    const waiting = await submitMemberRequest(kindForm('waiting'))
    expect(waiting.ok ? '' : waiting.error).not.toMatch(/not open to your account/)
  })

  it('sends and withdraws no waiting list or replacement once their page’s Create is closed', async () => {
    mocks.getUser.mockResolvedValue(member(['rev.track.create']))
    const refused = { ok: false, error: 'Sending a waiting list or a replacement is not open to your account.' }
    expect(await submitMemberRequest(kindForm('replacement'))).toEqual(refused)
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: () => stored('waiting') })
    expect(await cancelMemberRequest(requestId)).toEqual(refused)
    expect(mocks.rpc).not.toHaveBeenCalled()
    // A claim of theirs still withdraws.
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: () => stored('claim') })
    mocks.rpc.mockResolvedValue({ data: { id: requestId, kind: 'claim', title: 'Outstation claim', status: 'withdrawn', createdAt: '', detail: {} }, error: null })
    expect((await cancelMemberRequest(requestId)).ok).toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('member_cancel_request', { p_request: requestId })
  })

  it('nothing is refused for an account nobody unticked a box for', async () => {
    mocks.getUser.mockResolvedValue(member([]))
    mocks.rpc.mockResolvedValue({ data: { bands: [band] }, error: null })
    expect((await calculateMemberQuote(quote)).ok).toBe(true)
  })
})
