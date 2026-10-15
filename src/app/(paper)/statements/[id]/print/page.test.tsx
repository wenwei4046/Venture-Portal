import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 2026-10-16 — the printed statement drew a second <html> / <head> / <body>
// inside the root layout's: React's hydration failed on it (#418) and the
// tab's title was empty, so Save as PDF had no name to give its file. The
// root layout draws the document; the title is generateMetadata's.

const mocks = vi.hoisted(() => ({ tabs: undefined as string[] | undefined, row: null as unknown }))
vi.mock('@/lib/auth', () => ({
  requirePage: async () => undefined,
  requirePermission: async () => ({ id: 'u1', role: 'finance', permissions: ['treasury'], tabs: mocks.tabs }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {}
    for (const m of ['from', 'select', 'eq']) q[m] = () => q
    q.maybeSingle = async () => ({ data: mocks.row, error: null })
    return q
  },
}))

import { generateMetadata } from './page'

const params = Promise.resolve({ id: 'st1' })

beforeEach(() => {
  mocks.tabs = undefined
  mocks.row = { period_month: '2026-09-01', companies: { name: 'The Cont', short_code: 'CONTS' } }
})

describe('the printed statement’s document', () => {
  it('is titled by its company and month — what Save as PDF names the file', async () => {
    expect(await generateMetadata({ params })).toEqual({ title: 'Statement — CONTS — September 2026' })
  })

  it('names the company when it has no code, and gives no title for a statement it cannot read', async () => {
    mocks.row = { period_month: '2026-10-01', companies: { name: 'Carres', short_code: null } }
    expect(await generateMetadata({ params })).toEqual({ title: 'Statement — Carres — October 2026' })
    mocks.row = null
    expect(await generateMetadata({ params })).toEqual({})
  })

  it('gives no title to an account whose tabs do not open the page', async () => {
    mocks.tabs = ['hr.view']
    expect(await generateMetadata({ params })).toEqual({})
  })

  it('on a phone, Print / Save PDF stands over the letterhead, not on it (the app’s Print statement opens this page)', () => {
    const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    const phone = src.slice(src.indexOf('@media screen and (max-width: 640px)'))
    expect(phone).toMatch(/^@media screen and \(max-width: 640px\) \{\s*body \{ padding: max\(16px, env\(safe-area-inset-top, 0px\)\) 16px 24px; \}\s*\.print-btn \{ position: static;/)
  })

  it('leaves the document to the root layout: no <html>, <head> or <body> of its own', () => {
    const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    expect(src).not.toMatch(/<(html|head|body|title)\b/)
  })
})
