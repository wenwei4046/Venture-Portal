import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withMetaUnread } from './inbox'
import type { LeadContact } from './types'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/messenger/send', () => ({ pageToken: async (pageId: string) => (pageId === '404' ? null : 'PAGE-TOKEN') }))

const { fillHistory, historyOf, markSeen, metaCdn, metaUnread } = await import('./meta-sync')

const PAGE = '946946021838962'
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response

describe('Lead View › the same as Messenger (mig 20261028100000)', () => {
  it('reads a conversation from the Graph as lead_ingest_history takes it, oldest first', () => {
    const out = historyOf([
      { id: 'm.2', from: { id: PAGE }, created_time: '2026-10-27T03:00:00+0000', message: '', attachments: { data: [{ mime_type: 'image/jpeg', image_data: { url: 'https://scontent.xx.fbcdn.net/v/a.jpg' } }] } },
      { id: 'm.1', from: { id: '7700' }, created_time: '2026-10-27T02:00:00+0000', message: ' sofa price? ' },
      { id: 'm.3', from: { id: '7700' }, created_time: '2026-10-27T04:00:00+0000', attachments: { data: [{ mime_type: 'application/pdf', name: 'plan.pdf', file_url: 'https://evil.example.com/x' }] } },
      { id: 'm.x', from: { id: '7700' } },
    ], PAGE)
    expect(out).toEqual([
      { mid: 'm.1', in: true, at: '2026-10-27T02:00:00+0000', body: 'sofa price?', mediaUrl: null },
      { mid: 'm.2', in: false, at: '2026-10-27T03:00:00+0000', body: '[Photo]', mediaUrl: 'https://scontent.xx.fbcdn.net/v/a.jpg' },
      { mid: 'm.3', in: true, at: '2026-10-27T04:00:00+0000', body: '[File] plan.pdf', mediaUrl: null },
    ])
    expect(metaCdn('https://cdn.fbsbx.com/v/x')).toBe('https://cdn.fbsbx.com/v/x')
    expect(metaCdn('http://scontent.xx.fbcdn.net/v/a.jpg')).toBeNull()
  })

  it('fills only the conversations the database still wants, and never throws when Meta is silent', async () => {
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'lead_history_wanted') return { data: [{ id: 'c1', pageId: PAGE, psid: '7700' }, { id: 'c2', pageId: PAGE, psid: '9900' }], error: null }
      return { data: (args.p_messages as unknown[]).length, error: null }
    })
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('user_id=7700')) return json({ data: [{ id: 't_1' }] })
      if (url.includes('user_id=9900')) throw new Error('down')
      return json({ data: [{ id: 'm.1', from: { id: '7700' }, created_time: '2026-10-27T02:00:00+0000', message: 'hi' }] })
    }) as unknown as typeof fetch
    const added = await fillHistory({ rpc } as unknown as SupabaseClient, ['c1', 'c2'], 'SYS', fetchImpl)
    expect(added).toBe(1)
    expect(rpc.mock.calls.map(c => c[0])).toEqual(['lead_history_wanted', 'lead_ingest_history'])
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_contact: 'c1' })
    expect(await fillHistory({ rpc } as unknown as SupabaseClient, ['c1'], undefined, fetchImpl)).toBe(0)
  })

  it('reads Messenger’s own unread counts per Page, kept a few seconds, and leaves out a Page Meta did not answer for', async () => {
    const fetchImpl = vi.fn(async () => json({ data: [
      { participants: { data: [{ id: '7700' }, { id: PAGE }] }, unread_count: 1 },
      { participants: { data: [{ id: PAGE }, { id: '8800' }] }, unread_count: 0 },
    ] })) as unknown as typeof fetch
    const counts = await metaUnread([PAGE, PAGE, '404'], 'SYS', fetchImpl, 1_000_000)
    expect([...counts]).toEqual([[`${PAGE}:7700`, 1], [`${PAGE}:8800`, 0]])
    await metaUnread([PAGE], 'SYS', fetchImpl, 1_005_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((await metaUnread([PAGE], undefined, fetchImpl)).size).toBe(0)
  })

  it('takes Messenger’s count on a real Messenger conversation only', () => {
    const base = { channel: 'messenger', isTest: false, pageId: PAGE, psid: '7700', unread: 0, lastDir: 'out' } as LeadContact
    const counts = new Map([[`${PAGE}:7700`, 1]])
    expect(withMetaUnread([base], counts)[0].unread).toBe(1)
    expect(withMetaUnread([{ ...base, isTest: true }], counts)[0].unread).toBe(0)
    expect(withMetaUnread([{ ...base, channel: 'instagram' }], counts)[0].unread).toBe(0)
    expect(withMetaUnread([{ ...base, psid: '1' }], counts)[0].unread).toBe(0)
  })

  it('marks a chat seen in Messenger with the Page’s token', async () => {
    const fetchImpl = vi.fn(async () => json({}))
    expect(await markSeen({ pageId: PAGE, psid: '7700' }, 'SYS', fetchImpl as unknown as typeof fetch)).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain(`/${PAGE}/messages`)
    expect(JSON.parse(init.body as string)).toEqual({ recipient: { id: '7700' }, sender_action: 'mark_seen' })
    expect(await markSeen({ pageId: null, psid: '7700' }, 'SYS', fetchImpl as unknown as typeof fetch)).toBe(false)
    expect(await markSeen({ pageId: PAGE, psid: '7700' }, 'SYS', (async () => json({}, false)) as unknown as typeof fetch)).toBe(false)
  })
})
