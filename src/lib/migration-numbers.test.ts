import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// One number, one migration (2026-10-16).
//
// Several sessions ship at once, and two of them took 20261015200000 the same
// evening (Attendance's answers, the CRM's notify_more_for_salespeople). The files
// still ran — they are applied in name order — but the database's history is
// keyed by the number, so the second one is recorded under another (the CRM's went
// in as 20261015154851, the name it now carries). A new migration takes a number
// nobody has: check origin/main and production's schema_migrations first.

// Vitest runs from the repository root.
const MIGRATIONS = join(process.cwd(), 'supabase/migrations')

/** Numbers shared before this test existed — left as they are, never added to. */
const SHARED_BEFORE = new Set([
  '20260703010000', '20260703020000', '20260703030000', '20260806000000',
  '20260903010000', '20260903020000', '20260903030000', '20260905010000',
  '20260911010000', '20260914010000', '20260915010000', '20260915020000',
  '20260915030000', '20260915040000', '20260915050000', '20260918010000',
  '20260918020000', '20260921010000', '20261002010000', '20261006050000',
  '20261011120000', '20261011130000', '20261012190000', '20261012220000',
])

describe('migration numbers', () => {
  it('no two migrations share a number', () => {
    const seen = new Map<string, string[]>()
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
      const number = file.split('_')[0]
      seen.set(number, [...(seen.get(number) ?? []), file])
    }
    const clashes = [...seen].filter(([n, files]) => files.length > 1 && !SHARED_BEFORE.has(n))
    expect(clashes).toEqual([])
  })
})
