import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Sign out ends THIS device's session, never the account's (2026-10-08).
//
// supabase-js signs out with scope 'global' when it is handed no options, and
// the auth server then deletes EVERY session of the account: the phone, the
// other PC, every open tab land on /login next time ("Refresh Token Not
// Found"). The shared accounts (principal@, finance@, hr@) are switched on the
// office PC several times a day — Sign out, sign in as the other — and each
// switch did exactly that: ten global sign-outs of principal@ in three days,
// and the Principal's phone asked to sign in again after them ("everytime when
// i open from mobile or desktop, it will keep asking log in again").
// So every call names its scope, and the scope is this device.

// Vitest runs from the repository root.
const ROOT = process.cwd()

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
  })
}

const where = (path: string) => relative(ROOT, path).replace(/\\/g, '/')

// Every `auth.signOut(…)` in the app, with what it is handed. The root
// middleware.ts is not compiled today (the app lives in src/), but it is the
// file that would run the moment it is moved, so it is held to the same rule.
const calls = [...sources(resolve(ROOT, 'src')), resolve(ROOT, 'middleware.ts')].flatMap(path => {
  const text = readFileSync(path, 'utf8')
  return [...text.matchAll(/\bauth\s*\.\s*signOut\s*\(([^)]*)\)/g)].map(match => ({
    at: `${where(path)}:${text.slice(0, match.index).split('\n').length}`,
    args: match[1].replace(/\s+/g, ' ').trim(),
  }))
})

describe('sign out ends this device only', () => {
  it('finds the sign-out calls (the scan itself works)', () => {
    expect(calls.map(call => call.at.replace(/:\d+$/, ''))).toEqual(expect.arrayContaining([
      'src/components/layout/TopBar.tsx',
      'src/components/layout/MoreSheet.tsx',
      'src/app/(member)/member/signout/route.ts',
      'src/app/(auth)/login/page.tsx',
      'middleware.ts',
    ]))
  })

  it("hands { scope: 'local' } to every one", () => {
    const global = calls
      .filter(call => !/^\{ ?scope: ?['"]local['"],? ?\}$/.test(call.args))
      .map(call => `${call.at} signOut(${call.args})`)
    expect(global).toEqual([])
  })
})
