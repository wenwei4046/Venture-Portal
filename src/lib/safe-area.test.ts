import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SAFE_BOTTOM_BOOT, SAFE_BOTTOM_FLOOR_VAR, SAFE_BOTTOM_KEY, readSafeBottom, safeBottomFloor, type SafeBottomMemory } from './safe-area'

// After a reload the installed app on an Android phone (three-button
// navigation) was still drawn under the phone's own buttons while the inset
// that lifts the bottom bar came back as 0: Today · Insight · Quote · Arena ·
// Profile sat under them, a few pixels of its top edge showing (user's
// screenshot, 2026-10-10). The tab now remembers the inset it was given.

const phone: SafeBottomMemory = { width: 412, height: 915, inset: 48 }

describe('readSafeBottom', () => {
  it('reads what the tab remembered', () => {
    expect(readSafeBottom(JSON.stringify(phone))).toEqual(phone)
  })

  it('reads nothing from nothing, from garbage, or from an inset of 0', () => {
    expect(readSafeBottom(null)).toBeNull()
    expect(readSafeBottom('')).toBeNull()
    expect(readSafeBottom('{oops')).toBeNull()
    expect(readSafeBottom('null')).toBeNull()
    expect(readSafeBottom(JSON.stringify({ width: 412, height: 915 }))).toBeNull()
    expect(readSafeBottom(JSON.stringify({ ...phone, inset: 0 }))).toBeNull()
    expect(readSafeBottom(JSON.stringify({ ...phone, width: '412' }))).toBeNull()
  })
})

describe('safeBottomFloor', () => {
  const at = { width: 412, height: 915 }

  it('holds the bar up on the remembered inset when a reload hears 0 in the same window', () => {
    expect(safeBottomFloor({ ...at, inset: 0, heard: false, memory: phone })).toBe(48)
  })

  it('believes the browser the moment it gives this page an inset — a later 0 too', () => {
    expect(safeBottomFloor({ ...at, inset: 48, heard: true, memory: phone })).toBe(0)
    expect(safeBottomFloor({ ...at, inset: 24, heard: true, memory: phone })).toBe(0)
    // The keyboard is up, or the phone moved to gesture navigation: real.
    expect(safeBottomFloor({ ...at, inset: 0, heard: true, memory: phone })).toBe(0)
  })

  it('has nothing to hold with nothing remembered — a fresh launch, a desktop, a phone with no bar', () => {
    expect(safeBottomFloor({ ...at, inset: 0, heard: false, memory: null })).toBe(0)
  })

  it('leaves another window to the browser alone (turned sideways, resized, shrunk by a keyboard)', () => {
    expect(safeBottomFloor({ width: 915, height: 412, inset: 0, heard: false, memory: phone })).toBe(0)
    expect(safeBottomFloor({ width: 412, height: 867, inset: 0, heard: false, memory: phone })).toBe(0)
    expect(safeBottomFloor({ width: 390, height: 915, inset: 0, heard: false, memory: phone })).toBe(0)
  })
})

describe('the head script (SAFE_BOTTOM_BOOT) is safeBottomFloor before the browser says anything', () => {
  function boot(stored: string | null, width: number, height: number): number {
    const root = document.createElement('html')
    const storage = { getItem: (key: string) => (key === SAFE_BOTTOM_KEY ? stored : null) }
    // Its globals, handed in by name: the tab's storage, the window, the page.
    new Function('sessionStorage', 'innerWidth', 'innerHeight', 'document', SAFE_BOTTOM_BOOT)(storage, width, height, { documentElement: root })
    const floor = root.style.getPropertyValue(SAFE_BOTTOM_FLOOR_VAR)
    return floor ? parseFloat(floor) : 0
  }

  const cases: [string, string | null, number, number][] = [
    ['same window', JSON.stringify(phone), 412, 915],
    ['fractional inset', JSON.stringify({ ...phone, inset: 47.619 }), 412, 915],
    ['another height', JSON.stringify(phone), 412, 867],
    ['another width', JSON.stringify(phone), 915, 412],
    ['nothing stored', null, 412, 915],
    ['garbage', '{oops', 412, 915],
    ['inset 0', JSON.stringify({ ...phone, inset: 0 }), 412, 915],
    ['strings', JSON.stringify({ width: '412', height: '915', inset: 48 }), 412, 915],
  ]

  it.each(cases)('%s', (_label, stored, width, height) => {
    expect(boot(stored, width, height)).toBe(safeBottomFloor({ inset: 0, heard: false, width, height, memory: readSafeBottom(stored) }))
  })

  it('never throws, whatever the storage does', () => {
    const throwing = { getItem: () => { throw new Error('blocked') } }
    expect(() => new Function('sessionStorage', 'innerWidth', 'innerHeight', 'document', SAFE_BOTTOM_BOOT)(throwing, 412, 915, { documentElement: document.createElement('html') })).not.toThrow()
  })
})

// Every bar the live app stands at the bottom of the screen reads --safe-bottom,
// never the bare env(): the bare inset is the one a reload loses.
const ROOT = process.cwd()
const where = (path: string) => relative(ROOT, path).replace(/\\/g, '/')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : []
  })
}

/** The code without its comments — a comment may name the inset; only a style may use it. */
const uncommented = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

/** May still use the bare inset, and why. */
const BARE_ALLOWED: Record<string, string> = {
  'src/app/globals.css': '--safe-bottom itself, and the probe that reads the browser',
  'src/components/member/app/shell.module.css': "var(--safe-bottom)'s own fallback",
  'src/components/member/member.module.css': 'MemberWorkspace — /member/preview only',
  'src/components/member/MemberLiveWorkspace.module.css': 'MemberWorkspace — /member/preview only',
  'src/components/member/MemberCrm.module.css': 'the CRM before the redesign — mounted by nothing',
}
const PREVIEWS = 'src/components/member/design-preview/'

describe('bottom bars stand on --safe-bottom', () => {
  const using = sources(resolve(ROOT, 'src'))
    .map(where)
    .filter(path => uncommented(readFileSync(resolve(ROOT, path), 'utf8')).includes('env(safe-area-inset-bottom'))
  const bare = using.filter(path => !path.startsWith(PREVIEWS) && !(path in BARE_ALLOWED))

  it('finds the bare inset where it is allowed (the scan itself works)', () => {
    expect(using).toEqual(expect.arrayContaining(['src/app/globals.css', 'src/components/member/member.module.css']))
  })

  it('finds no bare env(safe-area-inset-bottom) outside the allowed files', () => {
    expect(bare).toEqual([])
  })

  it('the Revenue app bar and the portal tab bar read it', () => {
    expect(readFileSync(resolve(ROOT, 'src/components/member/app/shell.module.css'), 'utf8')).toMatch(/\.navLive \{ padding-bottom: var\(--safe-bottom/)
    expect(readFileSync(resolve(ROOT, 'src/components/layout/BottomTabBar.tsx'), 'utf8')).toContain('pb-[var(--safe-bottom)]')
  })
})
