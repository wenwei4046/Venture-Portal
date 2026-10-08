import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ prime: vi.fn(), now: 0 }))
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ client: true }) }))
vi.mock('@/lib/dept-registry', () => ({ primeDeptRegistryFromDb: mocks.prime }))

beforeEach(() => {
  vi.resetModules()
  mocks.prime.mockReset()
  mocks.now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => mocks.now)
})
afterEach(() => { vi.restoreAllMocks() })

/** Whether createClient() settles while the registry read is still out. */
async function settlesBeforePrime(createClient: () => Promise<unknown>): Promise<boolean> {
  let resolvePrime!: () => void
  mocks.prime.mockImplementation(() => new Promise<void>(r => { resolvePrime = r }))
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

  it('a later refresh, 30 s on, does not hold the request up', async () => {
    const { createClient } = await import('./server')
    mocks.prime.mockResolvedValue(undefined)
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
