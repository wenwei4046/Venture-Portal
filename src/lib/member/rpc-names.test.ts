import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every database function the member app asks for must exist (2026-10-06).
//
// The claim form asked for `member_claim_rates` — HR's TABLE; the function is
// `member_claim_settings()`. PostgREST answered "could not find the function"
// every time, the form had no region and no rate, and no claim could ever be
// sent. Types, tests and the build cannot see a misspelt RPC; the migrations
// can, so every name an `rpc(...)` call carries is looked up among the
// functions they create.

// Vitest runs from the repository root.
const ROOT = process.cwd()
const SCANNED = ['src/lib/member', 'src/app/(member)', 'src/components/member', 'src/app/(portal)/member-admin']

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** The text between an `rpc` call's own brackets — `rpc<T>(…)` and `client.rpc(…)` alike. */
function rpcCalls(text: string): string[] {
  const calls: string[] = []
  for (const match of text.matchAll(/\brpc\b/g)) {
    let i = match.index + 3
    if (text[i] === '<') {
      for (let depth = 0; i < text.length; i++) {
        if (text[i] === '<') depth++
        else if (text[i] === '>' && --depth === 0) { i++; break }
      }
    }
    if (text[i] !== '(') continue
    const start = i
    for (let depth = 0; i < text.length; i++) {
      if (text[i] === '(') depth++
      else if (text[i] === ')' && --depth === 0) break
    }
    calls.push(text.slice(start + 1, i))
  }
  return calls
}

/**
 * snake_case string literals in a call that are not an argument's value (`p_window: 'monthly'`) —
 * a ternary's `… : 'member_insight_snapshot'` is a name: its colon follows a string, not a key.
 */
function functionNames(call: string): string[] {
  const names: string[] = []
  for (const m of call.matchAll(/(['"`])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\1/g)) {
    if (!/[A-Za-z_$][\w$]*\s*:\s*$/.test(call.slice(0, m.index))) names.push(m[2])
  }
  return names
}

const called = new Map<string, Set<string>>()
for (const dir of SCANNED) {
  for (const file of sources(resolve(ROOT, dir))) {
    for (const call of rpcCalls(readFileSync(file, 'utf8'))) {
      for (const name of functionNames(call)) {
        if (!called.has(name)) called.set(name, new Set())
        called.get(name)!.add(relative(ROOT, file).replace(/\\/g, '/'))
      }
    }
  }
}

const created = new Set<string>()
const migrations = resolve(ROOT, 'supabase/migrations')
for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql'))) {
  const sql = readFileSync(join(migrations, file), 'utf8')
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(/gi)) {
    created.add(m[1].toLowerCase())
  }
}

describe('the member app calls only functions that exist', () => {
  it('finds the calls (the scan itself works)', () => {
    // Both arms of a `principal ? … : …` count, and the claim form's own.
    for (const name of ['member_data_snapshot', 'member_principal_snapshot', 'member_insight_snapshot',
      'member_principal_insight_snapshot', 'member_prepare_request', 'member_submit_request', 'member_claim_settings']) {
      expect(called.has(name), name).toBe(true)
    }
    expect(created.size).toBeGreaterThan(100)
  })

  it('every name is a function a migration creates', () => {
    const missing = [...called.entries()]
      .filter(([name]) => !created.has(name))
      .map(([name, files]) => `${name} ← ${[...files].join(', ')}`)
    expect(missing).toEqual([])
  })
})
