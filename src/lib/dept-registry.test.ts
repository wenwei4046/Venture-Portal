import { describe, expect, it } from 'vitest'
import { primeDeptRegistryFromDb, primedRegistryRows, primedSegmentToPool } from './dept-registry'

const IT = { id: 'd-it', name: 'IT', segment_key: 'it', pool_gl_code: '3150', billing_mode_key: 'it_attribution', is_internal: false }

/** A client whose departments read answers `rows` (RLS answers a request with no session with none). */
function db(rows: unknown[] | null, error: { message: string } | null = null) {
  return {
    from: () => ({ select: () => ({ order: async () => ({ data: rows, error }) }) }),
  }
}

// 2026-10-08: a sign-in landing on a due refresh read the departments with no session — zero rows — and the
// empty registry it primed hid IT and Revenue Department from every request on the server for 30 s.
describe('primeDeptRegistryFromDb never replaces a registry with an empty read', () => {
  it('primes what it read', async () => {
    await primeDeptRegistryFromDb(db([IT]))
    expect(primedRegistryRows().map((d) => d.name)).toEqual(['IT'])
    expect(primedSegmentToPool()).toEqual({ it: 'dept_pool_it' })
  })

  it('keeps the registry it has when the read lands no rows, or fails', async () => {
    await primeDeptRegistryFromDb(db([IT]))
    expect(await primeDeptRegistryFromDb(db([]))).toEqual([])
    expect(await primeDeptRegistryFromDb(db(null, { message: 'permission denied' }))).toEqual([])
    expect(primedRegistryRows().map((d) => d.name)).toEqual(['IT'])
    expect(primedSegmentToPool()).toEqual({ it: 'dept_pool_it' })
  })
})
