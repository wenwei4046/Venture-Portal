import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { LEFTOVERS_PER_RUN, sweepHiringLeftovers } from './leftovers'

// The hourly sweep's Hiring job (mig 20261011210000): the leftovers the database lists, deleted through the
// Storage API, counted — never named.
function client(list: { data: unknown; error: unknown }, removed: { data: unknown; error: unknown } | 'throws') {
  const remove = vi.fn(async () => {
    if (removed === 'throws') throw new Error('network')
    return removed
  })
  const from = vi.fn(() => ({ remove }))
  const rpc = vi.fn(async () => list)
  return { db: { rpc, storage: { from } } as unknown as SupabaseClient, rpc, from, remove }
}

describe('sweepHiringLeftovers', () => {
  it('lists a bounded batch and deletes it from hiring-files', async () => {
    const c = client({ data: ['guest/hv-ABCDEFGH/a.pdf', 'files/u/b.pdf'], error: null }, { data: [{ name: 'a' }, { name: 'b' }], error: null })
    expect(await sweepHiringLeftovers(c.db)).toEqual({ listed: 2, deleted: 2 })
    expect(c.rpc).toHaveBeenCalledWith('hiring_leftovers', { p_limit: LEFTOVERS_PER_RUN })
    expect(c.from).toHaveBeenCalledWith('hiring-files')
    expect(c.remove).toHaveBeenCalledWith(['guest/hv-ABCDEFGH/a.pdf', 'files/u/b.pdf'])
  })

  it('nothing left over: nothing to delete', async () => {
    const c = client({ data: [], error: null }, { data: [], error: null })
    expect(await sweepHiringLeftovers(c.db)).toEqual({ listed: 0, deleted: 0 })
    expect(c.remove).not.toHaveBeenCalled()
  })

  it('counts only what the bucket really deleted', async () => {
    const partly = client({ data: ['a', 'b', 'c'], error: null }, { data: [{ name: 'a' }], error: null })
    expect(await sweepHiringLeftovers(partly.db)).toEqual({ listed: 3, deleted: 1 })
    const refused = client({ data: ['a'], error: null }, { data: null, error: { message: 'no' } })
    expect(await sweepHiringLeftovers(refused.db)).toEqual({ listed: 1, deleted: 0 })
    const down = client({ data: ['a'], error: null }, 'throws')
    expect(await sweepHiringLeftovers(down.db)).toEqual({ listed: 1, deleted: 0 })
  })

  it('a list it cannot read is a failed sweep, said as null', async () => {
    expect(await sweepHiringLeftovers(client({ data: null, error: { code: '42501' } }, { data: [], error: null }).db)).toBeNull()
    expect(await sweepHiringLeftovers(client({ data: 'x', error: null }, { data: [], error: null }).db)).toBeNull()
  })
})
