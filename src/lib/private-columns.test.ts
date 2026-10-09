import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { DIRECTOR_ROW_COLUMNS, PRIVATE_COLUMNS, STAFF_ROW_COLUMNS, type PrivateTable } from './private-columns'

// The guard for PR4 (2026-10-09, mig 20261009050000): NRIC, account numbers
// and a submission's per-person copies are not `authenticated`'s to SELECT.
// A query that names one — or asks for `*` on one of these tables — would be
// refused by the database at run time; this refuses it at test time, before a
// page breaks in front of somebody. Read them through lib/private-fields.ts.

const SRC = path.resolve(__dirname, '..')
const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations')
const TABLES = Object.keys(PRIVATE_COLUMNS) as PrivateTable[]

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && !/database\.types/.test(e.name) ? [p] : []
  })
}

const hits = (table: PrivateTable, columns: string) =>
  PRIVATE_COLUMNS[table].filter(c => new RegExp(`\\b${c}\\b`).test(columns))
const star = (columns: string) => /(^|[\s,(])\*/.test(columns)

// A select's argument as columns: a literal as written, the shared column
// lists by name (also inside a template literal), anything else unreadable —
// and an unreadable one is reported, since nothing here can vouch for it.
const KNOWN: Record<string, string> = { STAFF_ROW_COLUMNS, DIRECTOR_ROW_COLUMNS }
function columnsOf(arg: string | undefined): string {
  if (!arg) return '*'
  if (/^[A-Za-z_]/.test(arg)) return KNOWN[arg] ?? `<cannot read ${arg}>`
  return arg.slice(1, -1).replace(/\$\{\s*(\w+)\s*\}/g, (_, name: string) => KNOWN[name] ?? `<cannot read ${name}>`)
}
const unreadable = (columns: string) => /<cannot read /.test(columns)

describe('nobody reads a private column straight off its table', () => {
  const offenders: string[] = []
  for (const file of sourceFiles(SRC)) {
    const src = fs.readFileSync(file, 'utf8')
    const rel = path.relative(SRC, file)
    // .from('table') … .select('…')
    const direct = new RegExp(`\\.from\\(\\s*'(${TABLES.join('|')})'\\s*\\)`, 'g')
    let m: RegExpExecArray | null
    while ((m = direct.exec(src))) {
      const table = m[1] as PrivateTable
      const tail = src.slice(m.index, m.index + 1500)
      const op = /\.(select|insert|update|upsert|delete)\(\s*(`[^`]*`|'[^']*'|"[^"]*"|[A-Za-z_][A-Za-z0-9_]*)?/.exec(tail)
      if (!op) continue
      const line = src.slice(0, m.index).split('\n').length
      if (op[1] === 'select') {
        const cols = columnsOf(op[2])
        if (unreadable(cols)) offenders.push(`${rel}:${line} ${table} selects ${cols}`)
        else if (hits(table, cols).length || star(cols)) offenders.push(`${rel}:${line} ${table} selects ${star(cols) ? '*' : hits(table, cols).join(', ')}`)
      } else {
        // a write handing its rows back (.select() after it) reads them too
        const back = /\)\s*\.select\(\s*(`[^`]*`|'[^']*'|"[^"]*")?\s*\)/.exec(tail.slice(op.index, op.index + 800))
        if (back) {
          const cols = back[1] ? back[1].slice(1, -1) : '*'
          if (hits(table, cols).length || star(cols)) offenders.push(`${rel}:${line} ${table} ${op[1]} returns ${cols}`)
        }
      }
    }
    // other.select('…, table(…)') — an embedded read
    const embedded = new RegExp(`\\b(${TABLES.join('|')})(![a-z_]+)?\\s*\\(([^()]*)\\)`, 'g')
    while ((m = embedded.exec(src))) {
      if (src.slice(Math.max(0, m.index - 7), m.index) === ".from('") continue
      const table = m[1] as PrivateTable
      const cols = m[3]
      if (hits(table, cols).length || star(cols)) {
        offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length} embeds ${table}(${star(cols) ? '*' : hits(table, cols).join(', ')})`)
      }
    }
  }

  it('no select names nric / an account number / a submission copy, or asks for * on those tables', () => {
    expect(offenders).toEqual([])
  })
})

describe('a later migration keeps those tables readable the PR4 way', () => {
  const later = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql') && f > '20261009050000_sensitive_fields_need_their_tick.sql')

  it('a column added to one of those tables is granted to authenticated in the same migration (or listed as private)', () => {
    const missing: string[] = []
    for (const f of later) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')
      const add = new RegExp(`alter table (?:if exists )?(?:public\\.)?(${TABLES.join('|')})\\s+add column (?:if not exists )?([a-z_0-9]+)`, 'gi')
      let m: RegExpExecArray | null
      while ((m = add.exec(sql))) {
        const table = m[1].toLowerCase() as PrivateTable
        const column = m[2].toLowerCase()
        const isPrivate = (PRIVATE_COLUMNS[table] as readonly string[]).includes(column)
        const granted = new RegExp(`grant select \\([^)]*\\b${column}\\b[^)]*\\) on (?:table )?(?:public\\.)?${table}\\b[^;]*\\bauthenticated`, 'i').test(sql)
        if (!isPrivate && !granted) missing.push(`${f}: ${table}.${column}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('a SELECT policy changed on one of those tables changes its reader in the same migration', () => {
    const readerOf: Record<string, string> = {
      hr_staff_costs: 'staff_private_fields',
      directors: 'director_private_fields',
      payroll_voucher_lines: 'payroll_line_accounts',
    }
    const drift: string[] = []
    for (const f of later) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')
      for (const [table, reader] of Object.entries(readerOf)) {
        const touches = new RegExp(`(create|alter) policy [^;]*\\bon (?:public\\.)?${table}\\b[^;]*`, 'gi')
        const selects = (sql.match(touches) ?? []).some(p => !/\bfor (insert|update|delete)\b/i.test(p))
        if (selects && !sql.includes(reader)) drift.push(`${f}: ${table} (${reader})`)
      }
    }
    expect(drift).toEqual([])
  })
})
