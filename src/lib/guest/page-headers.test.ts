import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config'

// /g/<code> carries the guest link's code in its address (2026-10-11, the
// security review's N4): the page must not hand it on as a Referer, be framed
// by another site, or be kept by a cache.

describe('the guest page’s headers', () => {
  it('sends no Referer, cannot be framed and is never cached', async () => {
    const rules = await nextConfig.headers!()
    const guest = rules.find(r => r.source === '/g/:path*')
    expect(guest?.headers).toEqual([
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      { key: 'Cache-Control', value: 'no-store' },
    ])
  })

  it('keeps the service worker’s and the manifest’s', async () => {
    const rules = await nextConfig.headers!()
    expect(rules.map(r => r.source)).toEqual(['/sw.js', '/manifest.webmanifest', '/g/:path*'])
    expect(rules[0].headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' })
    expect(rules[1].headers).toEqual([{ key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' }])
  })
})
