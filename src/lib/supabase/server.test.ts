import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SIGNED_IN = [{ name: 'sb-gixpptmfuryskbwkmiwz-auth-token', value: 'x' }]
const ROWS = [{ id: 'd1', name: 'IT' }]

const mocks = vi.hoisted(() => ({ prime: vi.fn(), now: 0, cookies: [] as Array<{ name: string; value: string }> }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => mocks.cookies, set: () => {} }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ client: true }) }))
vi.mock('@/lib/dept-registry', () => ({ primeDeptRegistryFromDb: mocks.prime }))

beforeEach(() => {
  vi.resetModules()
  mocks.prime.mockReset()
  mocks.cookies = SIGNED_IN
  mocks.now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => mocks.now)
})
afterEach(() => { vi.restoreAllMocks() })

/** Whether createClient() settles while the registry read is still out. */
async function settlesBeforePrime(createClient: () => Promise<unknown>, rows: unknown[] = ROWS): Promise<boolean> {
  let resolvePrime!: () => void
  mocks.prime.mockImplementation(() => new Promise(r => { resolvePrime = () => r(rows) }))
  let settled = false
  const pending = createClient().then(() => { settled = true })
  await new Promise(r => setTimeout(r, 0))
  const before = settled
  resolvePrime()
  await pending
  return before
}

// 2026-10-08: the department registry was re-read IN FRONT of a request every 30 s per instance — 40–60 ms on
// about a third of prod requests. Only an instance's first read waits now; later ones run beside the request.
describe('the department registry is refreshed beside the request, not in front of it', () => {
  it("waits for an instance's first read (its registry is empty until then)", async () => {
    const { createClient } = await import('./server')
    expect(await settlesBeforePrime(createClient)).toBe(false)
  })

  it('a request that arrives while that first read is out waits for it too', async () => {
    const { createClient } = await import('./server')
    let resolvePrime!: () => void
    mocks.prime.mockImplementation(() => new Promise(r => { resolvePrime = () => r(ROWS) }))
    const settled = [false, false]
    const pending = [0, 1].map(i => createClient().then(() => { settled[i] = true }))
    await new Promise(r => setTimeout(r, 0))
    expect(settled).toEqual([false, false])
    resolvePrime()
    await Promise.all(pending)
    expect(mocks.prime).toHaveBeenCalledTimes(1)
  })

  it('a later refresh, 30 s on, does not hold the request up', async () => {
    const { createClient } = await import('./server')
    mocks.prime.mockResolvedValue(ROWS)
    await createClient()
    mocks.now += 31_000
    expect(await settlesBeforePrime(createClient)).toBe(true)
    expect(mocks.prime).toHaveBeenCalledTimes(2)
  })

  it('within the 30 s nothing is read; a failed first read is retried next time and still waited for', async () => {
    const { createClient } = await import('./server')
    mocks.prime.mockRejectedValueOnce(new Error('offline'))
    await createClient()
    await createClient()
    expect(mocks.prime).toHaveBeenCalledTimes(1)
    mocks.now += 31_000
    expect(await settlesBeforePrime(createClient)).toBe(false)
  })
})

// 2026-10-08: RLS shows departments to a session alone, and the sign-in action builds its client BEFORE the
// session exists — landing on a due refresh, it primed an EMPTY registry for every request on the instance for
// 30 s (Dept Pool's bank breakdown lost IT and Revenue Department: RM 254,269.80 for 507,330.16).
describe('only a signed-in request reads the department registry', () => {
  it('a request without a session cookie never reads it', async () => {
    const { createClient } = await import('./server')
    mocks.cookies = [{ name: 'sb-gixpptmfuryskbwkmiwz-auth-token-code-verifier', value: 'x' }]
    mocks.prime.mockResolvedValue(ROWS)
    await createClient()
    expect(mocks.prime).not.toHaveBeenCalled()
    mocks.cookies = SIGNED_IN
    await createClient()
    expect(mocks.prime).toHaveBeenCalledTimes(1)
  })

  it('a read that lands no departments counts as not primed: the next signed-in request reads again, and waits', async () => {
    const { createClient } = await import('./server')
    mocks.prime.mockResolvedValueOnce([])
    await createClient()
    expect(await settlesBeforePrime(createClient)).toBe(false)
    expect(mocks.prime).toHaveBeenCalledTimes(2)
  })

  it('knows the session cookie, chunked or whole, from the PKCE verifier', async () => {
    const { hasSessionCookie } = await import('./server')
    expect(hasSessionCookie(['sb-gixpptmfuryskbwkmiwz-auth-token'])).toBe(true)
    expect(hasSessionCookie(['vp-view', 'sb-gixpptmfuryskbwkmiwz-auth-token.0', 'sb-gixpptmfuryskbwkmiwz-auth-token.1'])).toBe(true)
    expect(hasSessionCookie(['sb-gixpptmfuryskbwkmiwz-auth-token-code-verifier'])).toBe(false)
    expect(hasSessionCookie([])).toBe(false)
  })
})
