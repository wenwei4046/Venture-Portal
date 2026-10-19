import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adIdsOf, forgetAdMisses, metaAdName, nameAdsFromMeta } from './crm-ad-names-meta'

// An ad's name from Ads Manager (2026-10-19, mig 20261019100000): a webhook delivery with an ad nobody named asks
// Graph for it and keeps it as source 'meta'; a named ad is never asked; an ad the token cannot see is not asked
// again for six hours.
const graph = (names: Record<string, string>) => vi.fn(async (url: string | URL | Request) => {
  const id = String(url).match(/\/(\d+)\?fields=name/)?.[1] ?? ''
  return names[id]
    ? new Response(JSON.stringify({ name: names[id], id }), { status: 200 })
    : new Response(JSON.stringify({ error: { code: 100, error_subcode: 33 } }), { status: 400 })
}) as unknown as typeof fetch

function db(named: string[] = []) {
  const kept: Array<{ p_ad: string; p_name: string }> = []
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'crm_ads_unnamed') return { data: (args.p_ids as string[]).filter(i => !named.includes(i)), error: null }
    if (fn === 'crm_meta_name_ad') { kept.push(args as { p_ad: string; p_name: string }); return { data: true, error: null } }
    return { data: null, error: { message: 'unknown' } }
  })
  return { client: { rpc } as unknown as SupabaseClient, rpc, kept }
}

beforeEach(() => forgetAdMisses())

describe('ad names from Ads Manager', () => {
  it('takes each well-formed ad id once', () => {
    expect(adIdsOf([
      { ad: { sourceId: '120254841448710368' } }, { ad: { sourceId: '120254841448710368' } },
      { ad: { sourceId: 'abc' } }, { ad: null }, {},
    ])).toEqual(['120254841448710368'])
  })

  it('asks Graph with the token in the header, never the address', async () => {
    const f = graph({ '120254841448710368': '[痛点型] - 乱报价的危险 (WA)' })
    expect(await metaAdName('120254841448710368', 'TOKEN', f)).toBe('[痛点型] - 乱报价的危险 (WA)')
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).not.toContain('TOKEN')
    expect((init as RequestInit).headers).toEqual({ Authorization: 'Bearer TOKEN' })
  })

  it('keeps the name of an ad nobody named, and leaves a named one alone', async () => {
    const d = db(['111111'])
    const n = await nameAdsFromMeta(d.client, ['111111', '222222'], 'T', graph({ '111111': 'Old', '222222': 'Video Ads-15/10' }))
    expect(n).toBe(1)
    expect(d.kept).toEqual([{ p_ad: '222222', p_name: 'Video Ads-15/10' }])
  })

  it('an ad the token cannot see keeps its headline and is not asked again soon', async () => {
    const d = db(), f = graph({})
    expect(await nameAdsFromMeta(d.client, ['333333'], 'T', f, 0)).toBe(0)
    expect(await nameAdsFromMeta(d.client, ['333333'], 'T', f, 60_000)).toBe(0)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
    await nameAdsFromMeta(d.client, ['333333'], 'T', f, 7 * 60 * 60_000)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })

  it('no token, no ads, or a failing database: nothing asked, nothing thrown', async () => {
    const d = db(), f = graph({ '444444': 'X' })
    expect(await nameAdsFromMeta(d.client, ['444444'], undefined, f)).toBe(0)
    expect(await nameAdsFromMeta(d.client, [], 'T', f)).toBe(0)
    const broken = { rpc: vi.fn(async () => { throw new Error('down') }) } as unknown as SupabaseClient
    expect(await nameAdsFromMeta(broken, ['444444'], 'T', f)).toBe(0)
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })
})
