import { describe, it, expect } from 'vitest'
import { fetchAllRows } from './paginate'

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
