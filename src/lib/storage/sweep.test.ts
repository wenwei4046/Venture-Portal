import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const r2 = vi.hoisted(() => ({
  r2Settings: vi.fn(() => ({ privateBucket: 'priv', publicBucket: 'pub' }) as unknown),
  r2List: vi.fn(),
  r2DeleteMany: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
}))
vi.mock('./r2', () => r2)

import { forgetFileBuckets } from './buckets'
import { sweepFileObjects } from './sweep'

const NOW = Date.parse('2026-10-23T12:00:00Z')
const DAY_AGO = '2026-10-22T11:00:00Z' // a day and an hour
const HOUR_AGO = '2026-10-23T11:00:00Z'

function fakeDb(rows: Array<{ bucket_id: string; name: string; created_at: string }>, backends: Record<string, 'r2' | 'supabase'>) {
  const deleted: string[] = []
  const from = (table: string) => {
    let op = 'select'
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const run = () => {
      if (table === 'file_buckets') return { data: Object.entries(backends).map(([id, backend]) => ({ id, backend, public: id === 'crm-auto-reply' })), error: null }
      const hits = rows.filter(r => filters.every(f => f(r)))
      if (op === 'delete') {
        deleted.push(...hits.map(h => `${h.bucket_id}/${h.name}`))
        return { data: hits, error: null }
      }
      return { data: hits, error: null }
    }
    const b = {
      select: () => b, order: () => b, range: () => b,
      delete: () => { op = 'delete'; return b },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
      in: (c: string, vs: unknown[]) => { filters.push(r => vs.includes(r[c])); return b },
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    }
    return b
  }
  return { db: { from } as unknown as SupabaseClient, deleted }
}

beforeEach(() => {
  forgetFileBuckets()
  vi.clearAllMocks()
})

describe('the hourly sweep of the buckets in R2', () => {
  it('drops a day-old row whose file never came, and a day-old file no row names — nothing younger', async () => {
    r2.r2List.mockImplementation(async (bucket: string, prefix: string) => ({
      objects: prefix === 'it-requests/'
        ? [
            { key: 'it-requests/u/kept.png', size: 1, lastModified: DAY_AGO },
            { key: 'it-requests/u/stray.png', size: 1, lastModified: DAY_AGO },
            { key: 'it-requests/u/arriving.png', size: 1, lastModified: HOUR_AGO },
          ]
        : [],
      next: null,
    }))
    const { db, deleted } = fakeDb([
      { bucket_id: 'it-requests', name: 'u/kept.png', created_at: DAY_AGO },
      { bucket_id: 'it-requests', name: 'u/never-came.png', created_at: DAY_AGO },
      { bucket_id: 'it-requests', name: 'u/on-its-way.png', created_at: HOUR_AGO },
    ], { 'it-requests': 'r2', 'hr-documents': 'supabase' })
    expect(await sweepFileObjects(db, NOW)).toEqual({ rowsWithoutFile: 1, filesWithoutRow: 1 })
    expect(deleted).toEqual(['it-requests/u/never-came.png'])
    expect(r2.r2DeleteMany).toHaveBeenCalledWith([{ r2Bucket: 'priv', key: 'it-requests/u/stray.png' }])
    // A bucket still in Storage is not looked at.
    expect(r2.r2List).toHaveBeenCalledTimes(1)
  })

  it('does nothing while R2 is not set up', async () => {
    r2.r2Settings.mockReturnValueOnce(null)
    const { db } = fakeDb([], { 'it-requests': 'r2' })
    expect(await sweepFileObjects(db, NOW)).toBeNull()
    expect(r2.r2List).not.toHaveBeenCalled()
  })
})
