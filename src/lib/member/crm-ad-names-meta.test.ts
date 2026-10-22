import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adIdsOf, forgetAdMisses, metaAdName, nameAdsFromMeta, refreshAdStatuses, listMetaAds, crmAdNumbers, metaAdInsights } from './crm-ad-names-meta'

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

// Whether each ad is still running (2026-10-22, mig 20261022120000): the hourly sweep asks Graph ad by ad and keeps
// each status; an ad the token cannot see is skipped.
describe('ad statuses from Ads Manager', () => {
  function statusDb(ids: string[]) {
    const kept: Array<{ p_ad: string; p_status: string }> = []
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'crm_ads_to_check') return { data: ids, error: null }
      if (fn === 'crm_meta_ad_status') { kept.push(args as { p_ad: string; p_status: string }); return { data: true, error: null } }
      return { data: null, error: { message: 'unknown' } }
    })
    return { client: { rpc } as unknown as SupabaseClient, kept }
  }

  it('asks each ad and keeps its status, skipping the ad Graph cannot see', async () => {
    const d = statusDb(['111111', '222222', '333333'])
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/111111?fields=name,effective_status')) return new Response(JSON.stringify({ name: 'A', effective_status: 'ACTIVE' }), { status: 200 })
      if (u.includes('/222222?')) return new Response(JSON.stringify({ name: 'B', effective_status: 'campaign_paused' }), { status: 200 })
      return new Response('{}', { status: 400 })
    }) as unknown as typeof fetch
    expect(await refreshAdStatuses(d.client, 'T', f)).toBe(2)
    expect(d.kept).toEqual([{ p_ad: '111111', p_name: 'A', p_status: 'ACTIVE' }, { p_ad: '222222', p_name: 'B', p_status: 'CAMPAIGN_PAUSED' }])
  })

  it('does nothing without a token', async () => {
    expect(await refreshAdStatuses(statusDb(['111111']).client, undefined)).toBe(0)
  })
})

describe('the ads Meta lists for "+"', () => {
  it('reads every account, leaves deleted ones to Meta’s filter, running first then newest', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('me/adaccounts')) return new Response(JSON.stringify({ data: [{ id: 'act_1', name: 'IR@The Conts' }, { id: 'bad' }] }), { status: 200 })
      if (u.includes('act_1/ads')) return new Response(JSON.stringify({ data: [
        { id: '111111', name: 'Old paused', effective_status: 'PAUSED', created_time: '2026-10-01T00:00:00+0800' },
        { id: '222222', name: 'New running', effective_status: 'ACTIVE', created_time: '2026-10-19T00:00:00+0800' },
        { id: 'x', name: 'bad id' },
      ] }), { status: 200 })
      return new Response('{}', { status: 400 })
    }) as unknown as typeof fetch
    const rows = await listMetaAds('T', f)
    expect(rows.map(r => [r.id, r.status, r.account])).toEqual([['222222', 'ACTIVE', 'IR@The Conts'], ['111111', 'PAUSED', 'IR@The Conts']])
    expect(String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0])).toContain('filtering=')
  })
  it('throws when Meta refuses the accounts', async () => {
    await expect(listMetaAds('T', vi.fn(async () => new Response('{}', { status: 400 })) as unknown as typeof fetch)).rejects.toThrow()
  })
})

describe("only the ads sent to the CRM's ad number", () => {
  it('keeps an ad whose ad set sends people to 018-358 0219, drops the rest', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('me/adaccounts')) return new Response(JSON.stringify({ data: [{ id: 'act_1', name: 'IR@The Conts' }] }), { status: 200 })
      if (u.includes('act_1/ads')) return new Response(JSON.stringify({ data: [
        { id: '111111', name: 'Ours', effective_status: 'ACTIVE', adset: { promoted_object: { page_id: '102351059576534', whatsapp_phone_number: '60183580219' } } },
        { id: '222222', name: 'Other number', effective_status: 'ACTIVE', adset: { promoted_object: { page_id: '478652958664343', whatsapp_phone_number: '601160716133' } } },
        { id: '333333', name: 'Messenger', effective_status: 'ACTIVE', adset: { promoted_object: { page_id: '478652958664343' } } },
      ] }), { status: 200 })
      if (u.includes('fields=name')) return new Response(JSON.stringify({ name: 'The Conts' }), { status: 200 })
      return new Response('{}', { status: 400 })
    }) as unknown as typeof fetch
    const rows = await listMetaAds('T', f, { numbers: crmAdNumbers(undefined) })
    expect(rows.map(r => r.id)).toEqual(['111111'])
    expect(rows[0].pageName).toBe('The Conts')
    expect((await listMetaAds('T', f)).length).toBe(3)
  })
  it('reads other numbers from the server when named', () => {
    expect(crmAdNumbers(undefined)).toEqual(['60183580219'])
    expect(crmAdNumbers('+60 18-358 0219, 60189079042')).toEqual(['60183580219', '60189079042'])
  })
})

describe("an ad's figures from Ads Manager", () => {
  it('reads spend, delivery and messaging conversations for the range', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      expect(decodeURIComponent(String(url))).toContain('"since":"2026-10-01","until":"2026-10-22"')
      return new Response(JSON.stringify({ data: [{ spend: '123.45', impressions: '9000', reach: '4000', inline_link_clicks: '80', clicks: '120', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '15' }] }] }), { status: 200 })
    }) as unknown as typeof fetch
    expect(await metaAdInsights('111111', 'T', '2026-10-01', '2026-10-22', f)).toEqual({ spend: 123.45, impr: 9000, reach: 4000, clicks: 80, allClicks: 120, msgconv: 15 })
  })
  it('answers zeros with no delivery, null for an ad the token cannot see', async () => {
    expect(await metaAdInsights('111111', 'T', '2026-10-01', '2026-10-22', vi.fn(async () => new Response('{"data":[]}', { status: 200 })) as unknown as typeof fetch)).toEqual({ spend: 0, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0 })
    expect(await metaAdInsights('111111', 'T', '2026-10-01', '2026-10-22', vi.fn(async () => new Response('{}', { status: 400 })) as unknown as typeof fetch)).toBeNull()
  })
})
