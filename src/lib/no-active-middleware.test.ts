import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The portal runs NO middleware: every page gates itself (`requireAuth` in the layouts). The session middleware is kept,
// dormant, as session-middleware.ts at the repo root (CLAUDE.md › Architecture). Next 15 never loaded a root
// middleware.ts while the app lives in src/; Next 16's Turbopack build does (2026-10-21: "ƒ Proxy (Middleware)" in the
// build, and on the Vercel preview /g/<code> — the guest link — and /welcome — an invitation — answered 307 → /login
// with nobody signed in). So the file was renamed out of the convention, and a file at any place Next looks for one
// switches the middleware on for every request: that is its own decision, never a side effect.
const ROOT = resolve(__dirname, '../..')
const NAMES = ['middleware', 'proxy']
const EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']
const PLACES = ['', 'src/']

describe('no middleware runs', () => {
  it('has no middleware or proxy file where Next looks for one', () => {
    const found = PLACES.flatMap(place => NAMES.flatMap(name => EXTENSIONS.map(ext => `${place}${name}.${ext}`)))
      .filter(path => existsSync(resolve(ROOT, path)))
    expect(found).toEqual([])
  })

  it('keeps the dormant session middleware under its own name', () => {
    expect(existsSync(resolve(ROOT, 'session-middleware.ts'))).toBe(true)
  })
})
