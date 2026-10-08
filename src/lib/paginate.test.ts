import { describe, it, expect } from 'vitest'
import { fetchAllRows, fetchAllRowsParallel, fetchByKeys } from './paginate'

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

describe('fetchAllRowsParallel', () => {
  /**
   * PostgREST as the GL reports meet it: a page is `.range(from, to)` capped at
   * 1000 rows, and the total comes back only on a request that asked to count.
   * `delay` lets a page answer late (or a later page answer first); `count`
   * overrides the total the counted page reports (a stale or missing count).
   */
  function countedSource(
    total: number,
    opts: { delay?: (from: number) => number; count?: number | null } = {},
  ) {
    const all = Array.from({ length: total }, (_, i) => ({ id: i }))
    const calls: Array<{ from: number; withCount: boolean }> = []
    let inFlight = 0
    let most = 0
    const fetch = async (from: number, to: number, withCount: boolean) => {
      calls.push({ from, withCount })
      inFlight++
      most = Math.max(most, inFlight)
      await new Promise(resolve => setTimeout(resolve, opts.delay?.(from) ?? 0))
      inFlight--
      return {
        data: all.slice(from, Math.min(to + 1, from + 1000)),
        error: null,
        count: withCount ? (opts.count === undefined ? total : opts.count) : null,
      }
    }
    return { fetch, calls, most: () => most }
  }

  it('reads the ledger’s five pages in two round trips, counting on the first only', async () => {
    // 2026-10-08: journal_lines = ~4,230 rows, read one page after another.
    const src = countedSource(4230)
    const rows = await fetchAllRowsParallel(src.fetch)
    expect(rows.length).toBe(4230)
    expect(src.calls).toEqual([
      { from: 0, withCount: true },
      { from: 1000, withCount: false },
      { from: 2000, withCount: false },
      { from: 3000, withCount: false },
      { from: 4000, withCount: false },
    ])
    expect(src.most()).toBe(4) // the four pages after the first all at once
  })

  it('answers in page order even when later pages arrive first', async () => {
    const src = countedSource(4230, { delay: from => 40 - from / 200 })
    const rows = await fetchAllRowsParallel(src.fetch)
    expect(rows.map(r => r.id)).toEqual(Array.from({ length: 4230 }, (_, i) => i))
  })

  it('keeps at most four pages in flight', async () => {
    const src = countedSource(9500, { delay: () => 5 })
    const rows = await fetchAllRowsParallel(src.fetch)
    expect(rows.length).toBe(9500)
    expect(src.most()).toBe(4)
    expect(src.calls.map(c => c.from)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000])
  })

  it('asks once for a set smaller than a page, and once for nothing at all', async () => {
    const small = countedSource(42)
    expect((await fetchAllRowsParallel(small.fetch)).length).toBe(42)
    expect(small.calls).toEqual([{ from: 0, withCount: true }])

    const empty = countedSource(0)
    expect(await fetchAllRowsParallel(empty.fetch)).toEqual([])
    expect(empty.calls).toEqual([{ from: 0, withCount: true }])
  })

  it('on exactly 1000 rows still looks past the full page, as fetchAllRows does', async () => {
    // The count only decides how much to ask for at once — a full last page is
    // never taken as the end.
    const src = countedSource(1000)
    const rows = await fetchAllRowsParallel(src.fetch)
    expect(rows.length).toBe(1000)
    expect(src.calls.map(c => c.from)).toEqual([0, 1000])
  })

  it('on exactly 2000 rows reads both pages, then confirms the end', async () => {
    const src = countedSource(2000)
    const rows = await fetchAllRowsParallel(src.fetch)
    expect(rows.map(r => r.id)).toEqual(Array.from({ length: 2000 }, (_, i) => i))
    expect(src.calls.map(c => c.from)).toEqual([0, 1000, 2000])
  })

  it('keeps reading when the table grew past what the count said', async () => {
    const src = countedSource(2500, { count: 1500 })
    const rows = await fetchAllRowsParallel(src.fetch)
    expect(rows.map(r => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i))
    expect(src.calls.map(c => c.from)).toEqual([0, 1000, 2000])
  })

  it('reads one page at a time, like fetchAllRows, when no count comes back', async () => {
    const src = countedSource(2500, { count: null, delay: () => 2 })
    const rows = await fetchAllRowsParallel(src.fetch)
    expect(rows.length).toBe(2500)
    expect(src.most()).toBe(1)
    expect(src.calls.map(c => c.from)).toEqual([0, 1000, 2000])
  })

  it('throws on an error on the first page', async () => {
    await expect(
      fetchAllRowsParallel(() => Promise.resolve({ data: null, error: { message: 'boom' }, count: null })),
    ).rejects.toThrow(/^fetchAllRowsParallel: boom$/)
  })

  it('fails when any later page fails, even with others still in flight — under the caller’s label', async () => {
    const all = Array.from({ length: 6000 }, (_, i) => ({ id: i }))
    await expect(
      fetchAllRowsParallel(async (from, to, withCount) => {
        await new Promise(resolve => setTimeout(resolve, 5))
        return from === 3000
          ? { data: null, error: { message: 'TypeError: fetch failed' }, count: null }
          : { data: all.slice(from, to + 1), error: null, count: withCount ? all.length : null }
      }, 'fetchAllJournalLines'),
    ).rejects.toThrow(/^fetchAllJournalLines: TypeError: fetch failed$/)
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
