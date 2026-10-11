import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPhone, opensHrApp, opensHrAppOnPhone } from './one-app'

// ONE app for everybody (2026-10-11 — the user: "他们都是一个 app … 我要的就是 portal app").

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  whatsappAndroid: 'Mozilla/5.0 (Linux; Android 13; RMX3630 Build/TP1A.220905.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ipadMobileMode: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
}

describe('a phone', () => {
  it('is an iPhone, or an Android that says Mobile — in any browser, the in-app ones too', () => {
    for (const ua of [UA.iphone, UA.androidChrome, UA.samsung, UA.firefoxAndroid, UA.whatsappAndroid]) expect(isPhone(ua)).toBe(true)
  })
  it('is not a tablet, nor a computer, nor a request that says nothing', () => {
    for (const ua of [UA.androidTablet, UA.ipadDesktopMode, UA.ipadMobileMode, UA.windowsChrome, '', null, undefined]) expect(isPhone(ua)).toBe(false)
  })
})

describe('which face of the app opens on a phone', () => {
  const hr = { role: 'hr', permissions: ['hiring', 'documentation', 'member_requests_manage'] }
  it('HR’s view: the HR app', () => {
    expect(opensHrAppOnPhone(hr)).toBe(true)
  })
  it('an account on its title’s template with one of HR’s own areas: the HR app', () => {
    expect(opensHrAppOnPhone({ role: 'staff', permissions: ['documentation'] })).toBe(true)
    expect(opensHrAppOnPhone({ role: 'staff', permissions: ['treasury'] })).toBe(false)
  })
  it('HR’s view with none of them: the portal stays (the HR app would send them back — no loop)', () => {
    expect(opensHrApp({ permissions: ['team'] })).toBe(false)
    expect(opensHrAppOnPhone({ role: 'hr', permissions: ['team'] })).toBe(false)
  })
  it('the Principal’s and Finance’s views: the portal, until their phone faces are made', () => {
    expect(opensHrAppOnPhone({ role: 'principal', permissions: ['hiring', 'documentation'] })).toBe(false)
    expect(opensHrAppOnPhone({ role: 'finance', permissions: ['treasury'] })).toBe(false)
  })
  it('nobody signed in: nothing', () => {
    expect(opensHrAppOnPhone(null)).toBe(false)
  })
})

describe('one install', () => {
  const ROOT = process.cwd()
  it('is the only web app manifest, and nothing swaps in another', () => {
    expect(readdirSync(resolve(ROOT, 'public')).filter(f => f.endsWith('.webmanifest'))).toEqual(['manifest.webmanifest'])
    const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return walk(path)
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : []
    })
    // Any manifest named in code, but the one app's own.
    const swaps = walk(resolve(ROOT, 'src')).filter(f =>
      [...readFileSync(f, 'utf8').matchAll(/['"`]([^'"`\s]*\.webmanifest)['"`]/g)].some(m => m[1] !== '/manifest.webmanifest'))
    expect(swaps).toEqual([])
  })
  it('opens the right face from its start: `/` and every portal page send HR’s view on a phone to the HR app', () => {
    const home = readFileSync(resolve(ROOT, 'src/app/page.tsx'), 'utf8')
    const portal = readFileSync(resolve(ROOT, 'src/app/(portal)/layout.tsx'), 'utf8')
    for (const src of [home, portal]) expect(src).toMatch(/opensHrAppOnPhone\(user\) && isPhone\(\(await headers\(\)\)\.get\('user-agent'\)\)\) redirect\('\/hr-app'\)/)
  })
})
