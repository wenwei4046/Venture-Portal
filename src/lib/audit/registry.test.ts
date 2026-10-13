import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '@/lib/permissions'
import { AUDIT_AREAS } from './changes'
import { AUDIT_READ_KEYS, IN_APP_HISTORY_KEYS } from './read-keys'

// Every table of the app has a line in `audit_tables` (2026-10-08): recorded,
// recorded for people's changes only, or not recorded with a reason. A
// migration that creates a table registers it in the same file —
//
//   SELECT public.audit_register('my_table', 'My records', 'Payroll', '{hr_costing}');
//
// — or this fails, and so would the database: the app-wide audit migration
// refuses a schema with an unregistered table, and so must the next one.

const MIGRATIONS = resolve(process.cwd(), 'supabase/migrations')
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
const sqlOf = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8').replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '')

/** The tables the migrations leave standing, in order: created, renamed, dropped. */
function liveTables(): Set<string> {
  const live = new Set<string>()
  const re = /\b(create\s+temp(?:orary)?\s+table|create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?|drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_0-9]+)"?|alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z_0-9]+)"?\s+rename\s+to\s+"?([a-z_0-9]+)"?)/gi
  for (const f of files) {
    const sql = sqlOf(f)
    let m: RegExpExecArray | null
    while ((m = re.exec(sql))) {
      if (/^create\s+temp/i.test(m[1])) continue
      if (m[2]) live.add(m[2])
      else if (m[3]) live.delete(m[3])
      else if (m[4]) {
        live.delete(m[4])
        live.add(m[5])
      }
    }
  }
  return live
}

interface Registration {
  table: string
  area: string
  read: string[]
  mode: string
}

/** Every `audit_register('table', 'label', 'area', '{keys}'[, 'mode'])` in the migrations; the last one wins. */
function registrations(): Map<string, Registration> {
  const out = new Map<string, Registration>()
  const re = /audit_register\(\s*'([a-z_0-9]+)'\s*,\s*'(?:[^']|'')*'\s*,\s*'([^']+)'\s*,\s*'\{([^}]*)\}'(?:\s*,\s*'(all|people|none)')?/g
  for (const f of files) {
    const sql = sqlOf(f)
    let m: RegExpExecArray | null
    while ((m = re.exec(sql))) {
      out.set(m[1], { table: m[1], area: m[2], read: m[3] ? m[3].split(',') : [], mode: m[4] ?? 'all' })
    }
  }
  return out
}

describe('the audit register', () => {
  const live = liveTables()
  const registered = registrations()

  it('reads the migrations (the scan itself works)', () => {
    expect(live.has('hr_monthly_payroll')).toBe(true)
    expect(live.has('tier_config')).toBe(false) // created, then dropped
    expect(registered.get('sales_orders')?.mode).toBe('people')
    expect(registered.get('erp_products')?.mode).toBe('none')
    expect(registered.size).toBeGreaterThan(170)
  })

  it('has a line for every table the migrations create', () => {
    expect([...live].filter(t => !registered.has(t)).sort()).toEqual([])
  })

  it('files every table under an area the page knows', () => {
    const areas = new Set<string>(AUDIT_AREAS)
    expect([...registered.values()].filter(r => !areas.has(r.area)).map(r => r.table)).toEqual([])
  })

  it('opens every recorded table to somebody, with keys the portal has', () => {
    const keys = new Set<string>(PERMISSIONS)
    for (const r of registered.values()) {
      if (r.mode === 'none') {
        expect(r.read, `${r.table} is not recorded: nobody reads it`).toEqual([])
        continue
      }
      expect(r.read.length, `${r.table} says who reads it`).toBeGreaterThan(0)
      for (const key of r.read) expect(keys.has(key), `${r.table}: ${key} is a permission`).toBe(true)
    }
  })

  it('puts Audit Log › Changes in the sidebar of exactly the keys that open some history', () => {
    const used = new Set<string>(['audit_log'])
    for (const r of registered.values()) for (const key of r.read) used.add(key)
    for (const key of IN_APP_HISTORY_KEYS) used.delete(key)
    expect([...AUDIT_READ_KEYS].sort()).toEqual([...used].sort())
  })
})
