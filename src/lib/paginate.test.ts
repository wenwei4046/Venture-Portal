import { describe, it, expect } from 'vitest'
import { fetchAllRows, fetchByKeys } from './paginate'

// Simulate PostgREST: a page is at most 1000 rows; .range(from, to) returns the slice.
function pagedSource(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }))
  let calls = 0
  const fetch = (from: number, to: number) => {
    calls++
    return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + 1000)), error: null })
  }
  return { fetch, calls: () => calls }
}

describe('fetchAllRows', () => {
  it('returns every row when the set exceeds the 1000-row cap', async () => {
    const src = pagedSource(2500)
    const rows = await fetchAllRows(src.fetch)
    expect(rows.length).toBe(2500)
    expect(rows[0]).toEqual({ id: 0 })
    expect(rows[2499]).toEqual({ id: 2499 })
    expect(src.calls()).toBe(3) // 1000 + 1000 + 500
  })

  it('stops after one page when the set is smaller than a page', async () => {
    const src = pagedSource(42)
    const rows = await fetchAllRows(src.fetch)
    expect(rows.length).toBe(42)
    expect(src.calls()).toBe(1)
  })

  it('makes a second call when the first page is exactly full, then stops', async () => {
    const src = pagedSource(1000)
    const rows = await fetchAllRows(src.fetch)
    expect(rows.length).toBe(1000)
    expect(src.calls()).toBe(2) // full page → probe once more → empty → stop
  })

  it('returns [] for an empty set', async () => {
    const rows = await fetchAllRows(() => Promise.resolve({ data: [], error: null }))
    expect(rows).toEqual([])
  })

  it('throws on a query error', async () => {
    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: { message: 'boom' } })),
    ).rejects.toThrow(/boom/)
  })
})

describe('fetchByKeys', () => {
  /** A source that refuses a chunk larger than the gateway would accept. */
  function keyedSource(limit = 100) {
    const calls: number[] = []
    const fetch = (chunk: string[]) => {
      calls.push(chunk.length)
      if (chunk.length > limit) {
        return Promise.resolve({ data: null, error: { message: 'TypeError: fetch failed' } })
      }
      return Promise.resolve({ data: chunk.map(k => ({ key: k })), error: null })
    }
    return { fetch, calls }
  }

  it('splits a key set the gateway would refuse whole', async () => {
    const src = keyedSource()
    const keys = Array.from({ length: 507 }, (_, i) => `k${i}`)
    const rows = await fetchByKeys(keys, src.fetch)
    expect(rows.length).toBe(507)
    expect(src.calls).toEqual([100, 100, 100, 100, 100, 7])
  })

  it('asks once for a small set', async () => {
    const src = keyedSource()
    const rows = await fetchByKeys(['a', 'b'], src.fetch)
    expect(rows).toEqual([{ key: 'a' }, { key: 'b' }])
    expect(src.calls).toEqual([2])
  })

  it('asks nothing at all for no keys', async () => {
    const src = keyedSource()
    expect(await fetchByKeys([], src.fetch)).toEqual([])
    expect(src.calls).toEqual([])
  })

  it('throws rather than returning a short answer', async () => {
    await expect(
      fetchByKeys(['a'], () => Promise.resolve({ data: null, error: { message: 'fetch failed' } })),
    ).rejects.toThrow(/fetch failed/)
  })

  it('keeps four chunks in flight and still answers in key order', async () => {
    // 2026-09-26: one chunk after another cost a round trip each — 15 in a row
    // on the month page. Chunks now overlap; the answer must not reorder.
    let inFlight = 0
    let most = 0
    const keys = Array.from({ length: 950 }, (_, i) => i)
    const rows = await fetchByKeys(keys, async chunk => {
      inFlight++
      most = Math.max(most, inFlight)
      // Later chunks answer FIRST, the way a busy server can.
      await new Promise(resolve => setTimeout(resolve, 30 - chunk[0] / 50))
      inFlight--
      return { data: chunk.map(k => ({ k })), error: null }
    })
    expect(most).toBe(4)
    expect(rows.map(r => r.k)).toEqual(keys)
  })

  it('fails when any chunk fails, even with others still in flight', async () => {
    const keys = Array.from({ length: 450 }, (_, i) => i)
    await expect(
      fetchByKeys(keys, async chunk => {
        await new Promise(resolve => setTimeout(resolve, 5))
        return chunk[0] === 200
          ? { data: null, error: { message: 'TypeError: fetch failed' } }
          : { data: chunk.map(k => ({ k })), error: null }
      }),
    ).rejects.toThrow(/fetch failed/)
  })
})
