// The rows a recorded query lets through (recording-supabase.ts), for a test that keeps its tables in memory: every
// filter the action applied is read off the chain, so the test states the rows and not which filters the action uses.

import type { RecordedCall } from './recording-supabase'

export type Row = Record<string, unknown>

const like = (pattern: string, flags = '') =>
  new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`, flags)

export function filteredRows(rows: Row[], chain: RecordedCall['chain']): Row[] {
  return rows.filter((row) =>
    chain.every(([m, col, a, b]) => {
      const v = row[col as string]
      switch (m) {
        case 'eq': return v === a
        case 'neq': return v !== a
        case 'in': return (a as unknown[]).includes(v)
        case 'is': return v === a
        case 'like': return typeof v === 'string' && like(a as string).test(v)
        case 'ilike': return typeof v === 'string' && like(a as string, 'i').test(v)
        case 'not':
          if (a === 'like') return !(typeof v === 'string' && like(b as string).test(v))
          if (a === 'ilike') return !(typeof v === 'string' && like(b as string, 'i').test(v))
          if (a === 'is' || a === 'eq') return v !== b
          throw new Error(`not(${String(a)}) is not modelled`)
        default: return true // select / order / limit
      }
    }),
  )
}
