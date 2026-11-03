import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
const outbox = vi.hoisted(() => vi.fn(async () => 1))
vi.mock('./messenger-outbox', () => ({ sendLeadOutbox: outbox }))

const { forgetInstagramPages, instagramName, instagramPages, parseInstagramDelivery, takeInstagram } = await import('./instagram')
const { forgetAdAccounts } = await import('./ad-account')

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const IG = '17841400000000001'
const delivery = (events: unknown[], object = 'instagram') => ({ object, entry: [{ id: IG, time: 1, messaging: events }] })

beforeEach(() => { forgetInstagramPages(); forgetAdAccounts(); outbox.mockClear() })

describe('Lead View › Instagram Direct in', () => {
  it('reads Instagram’s messages as Messenger’s, the account as the entry; nothing from a Page delivery; no echoes', () => {
    const msgs = parseInstagramDelivery(delivery([
      { sender: { id: '8800001' }, recipient: { id: IG }, timestamp: 1761620000000, message: { mid: 'ig.m1', text: 'hi' } },
      { sender: { id: IG }, recipient: { id: '8800001' }, timestamp: 1761620001000, message: { mid: 'ig.m2', text: 'ours', is_echo: true } },
      { sender: { id: '8800002' }, recipient: { id: IG }, timestamp: 1761620002000, message: { mid: 'ig.m3', attachments: [{ type: 'image', payload: { url: 'https://lookaside.fbsbx.com/x' } }] } },
    ]))
    expect(msgs.map(m => [m.externalId, m.pageId, m.psid, m.kind])).toEqual([['ig.m1', IG, '8800001', 'text'], ['ig.m3', IG, '8800002', 'image']])
    expect(parseInstagramDelivery(delivery([{ sender: { id: '1' }, message: { mid: 'x', text: 'y' } }], 'page'))).toEqual([])
  })

  it('finds each account’s Page once in ten minutes', async () => {
    const f = vi.fn(async () => json(200, { data: [{ id: '946946021838962', instagram_business_account: { id: IG } }, { id: '504171022789980' }] })) as unknown as typeof fetch
    expect((await instagramPages('SYS', f, 0)).get(IG)).toBe('946946021838962')
    await instagramPages('SYS', f, 60_000)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('names the customer by name, else username; null when Meta will not say', async () => {
    expect(await instagramName('8800001', 'PAGE', vi.fn(async () => json(200, { name: 'Nur Iman', username: 'nur.iman' })) as unknown as typeof fetch)).toBe('Nur Iman')
    expect(await instagramName('8800001', 'PAGE', vi.fn(async () => json(200, { username: 'nur.iman' })) as unknown as typeof fetch)).toBe('nur.iman')
    expect(await instagramName('8800001', 'PAGE', vi.fn(async () => json(400, {})) as unknown as typeof fetch)).toBeNull()
  })

  it('hands the messages to lead_ingest_instagram and sends the templates afterwards', async () => {
    const rpc = vi.fn(async () => ({ data: { messages: 1, contacts: ['c1'] }, error: null }))
    const jobs: Array<() => Promise<unknown>> = []
    const msgs = parseInstagramDelivery(delivery([{ sender: { id: '8800001' }, recipient: { id: IG }, timestamp: 1, message: { mid: 'ig.m1', text: 'hi' } }]))
    const r = await takeInstagram({ rpc } as unknown as SupabaseClient, msgs, undefined, job => { jobs.push(job) })
    expect(r).toEqual({ ok: true, data: { messages: 1, contacts: ['c1'] } })
    expect(rpc).toHaveBeenCalledWith('lead_ingest_instagram', { p_messages: [expect.objectContaining({ externalId: 'ig.m1', pageId: IG, psid: '8800001', name: null })] })
    await jobs[0]()
    expect(outbox).toHaveBeenCalledWith(expect.anything(), ['c1'], undefined)
  })

  it('says the ingest’s error, and asks nothing for no messages', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'boom' } }))
    expect(await takeInstagram({ rpc } as unknown as SupabaseClient, [], 'SYS', () => {})).toEqual({ ok: true, data: { messages: 0 } })
    expect(rpc).not.toHaveBeenCalled()
    const msgs = parseInstagramDelivery(delivery([{ sender: { id: '8800001' }, recipient: { id: IG }, timestamp: 1, message: { mid: 'ig.m1', text: 'hi' } }]))
    expect(await takeInstagram({ rpc } as unknown as SupabaseClient, msgs, undefined, () => {})).toEqual({ ok: false, error: 'boom' })
  })
})
