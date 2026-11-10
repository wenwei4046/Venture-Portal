import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
const { cleanMime, keepCustomerMedia, keepOne, keptInPath } = await import('./crm-media-keep')

// A customer's file kept on arrival (the owner, 2026-11-10: "Yes, copy on arrival"; mig 20261110140000).
const C = '11111111-2222-3333-4444-555555555555'
const M = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const META_URL = 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'

function fakeClient(opts: { listed?: unknown[]; upload?: { error: { message: string; status?: number } | null }; keep?: { data: unknown; error: { code?: string } | null } } = {}) {
  const upload = vi.fn(async () => opts.upload ?? { data: {}, error: null })
  const rpc = vi.fn(async (fn: string) => fn === 'crm_media_to_keep'
    ? { data: opts.listed ?? [], error: null }
    : opts.keep ?? { data: true, error: null })
  const from = vi.fn(() => ({ upload }))
  return { client: { rpc, storage: { from } } as unknown as SupabaseClient, rpc, upload, from }
}

afterEach(() => vi.restoreAllMocks())

describe('names and types', () => {
  it('keeps a file at <customer>/in-<message>.<ext>, the only path crm_keep_in_media takes', () => {
    expect(keptInPath(C, M, 'image/jpeg')).toBe(`${C}/in-${M}.jpg`)
    expect(keptInPath(C, M, 'audio/ogg')).toBe(`${C}/in-${M}.ogg`)
    expect(keptInPath(C, M, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(`${C}/in-${M}.docx`)
    expect(keptInPath(C, M, 'application/x-something-very-long')).toMatch(new RegExp(`^${C}/in-${M}\\.[a-z0-9]{1,10}$`))
    expect(keptInPath(C, M, 'application/octet-stream')).toBe(`${C}/in-${M}.octetstrea`)
  })

  it("says a type as the database takes it: lower case, no parameters", () => {
    expect(cleanMime('audio/ogg; codecs=opus')).toBe('audio/ogg')
    expect(cleanMime('IMAGE/JPEG')).toBe('image/jpeg')
    expect(cleanMime('')).toBe('application/octet-stream')
    expect(cleanMime('not a type')).toBe('application/octet-stream')
  })
})

describe('keeping one customer file', () => {
  it('WhatsApp: asks Graph with the token, downloads from Meta, uploads to crm-media, records it', async () => {
    const { client, rpc, upload, from } = fakeClient()
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json(200, { url: META_URL, mime_type: 'audio/ogg; codecs=opus' }))
      .mockResolvedValueOnce(new Response('OGG-BYTES', { status: 200, headers: { 'content-length': '9' } }))
    const ok = await keepOne(client, { id: M, contactId: C, mediaId: '123456789', mime: 'audio/ogg; codecs=opus' }, { token: 'TOKEN', fetchImpl })
    expect(ok).toBe(true)
    for (const call of fetchImpl.mock.calls) expect(call[1].headers.Authorization).toBe('Bearer TOKEN')
    expect(from).toHaveBeenCalledWith('crm-media')
    expect(upload).toHaveBeenCalledWith(`${C}/in-${M}.ogg`, expect.any(Blob), { contentType: 'audio/ogg' })
    expect(rpc).toHaveBeenCalledWith('crm_keep_in_media', { p_message: M, p_path: `${C}/in-${M}.ogg`, p_mime: 'audio/ogg' })
  })

  it("Messenger: fetches Meta's signed address only, no token sent", async () => {
    const { client, upload } = fakeClient()
    const fetchImpl = vi.fn(async () => new Response('JPEG', { status: 200, headers: { 'content-type': 'image/jpeg' } }))
    expect(await keepOne(client, { id: M, contactId: C, mediaUrl: 'https://scontent.xx.fbcdn.net/v/a.jpg?oe=FFFFFFFF' }, { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(true)
    expect((fetchImpl.mock.calls[0] as unknown[])[1]).not.toHaveProperty('headers.Authorization')
    expect(upload).toHaveBeenCalledWith(`${C}/in-${M}.jpg`, expect.any(Blob), { contentType: 'image/jpeg' })
  })

  it('never fetches an address off Meta', async () => {
    const { client, upload } = fakeClient()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchImpl = vi.fn()
    expect(await keepOne(client, { id: M, contactId: C, mediaUrl: 'https://evil.example/a.jpg' }, { fetchImpl })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[crm-media keep]', M, 'not a Meta address')
  })

  it('leaves a file over the size cap at Meta — by its length, or as it streams', async () => {
    const { client, upload } = fakeClient()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const big = vi.fn(async () => new Response('x', { status: 200, headers: { 'content-length': String(30 * 1024 * 1024) } }))
    expect(await keepOne(client, { id: M, contactId: C, mediaUrl: 'https://cdn.fbsbx.com/v/a.pdf' }, { fetchImpl: big as unknown as typeof fetch })).toBe(false)
    const streamed = vi.fn(async () => new Response('0123456789ABCDEF', { status: 200 }))
    expect(await keepOne(client, { id: M, contactId: C, mediaUrl: 'https://cdn.fbsbx.com/v/a.pdf' }, { fetchImpl: streamed as unknown as typeof fetch, limit: 8 })).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('a file already uploaded (the webhook and the sweep both reached it) is recorded all the same', async () => {
    const { client, rpc } = fakeClient({ upload: { error: { message: 'The resource already exists', status: 409 } } })
    const fetchImpl = vi.fn(async () => new Response('JPEG', { status: 200, headers: { 'content-type': 'image/jpeg' } }))
    expect(await keepOne(client, { id: M, contactId: C, mediaUrl: 'https://scontent.xx.fbcdn.net/v/a.jpg' }, { fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(true)
    expect(rpc).toHaveBeenCalledWith('crm_keep_in_media', expect.anything())
  })

  it('never throws and logs no address or token: Meta gone, a refused upload, a refused record, a timeout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const gone = vi.fn().mockResolvedValueOnce(json(404, {}))
    expect(await keepOne(fakeClient().client, { id: M, contactId: C, mediaId: '123456789' }, { token: 'SECRET', fetchImpl: gone })).toBe(false)
    const ok = () => vi.fn(async () => new Response('JPEG', { status: 200, headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch
    expect(await keepOne(fakeClient({ upload: { error: { message: 'no', status: 502 } } }).client, { id: M, contactId: C, mediaUrl: 'https://cdn.fbsbx.com/a' }, { fetchImpl: ok() })).toBe(false)
    expect(await keepOne(fakeClient({ keep: { data: null, error: { code: '22023' } } }).client, { id: M, contactId: C, mediaUrl: 'https://cdn.fbsbx.com/a' }, { fetchImpl: ok() })).toBe(false)
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))))
    expect(await keepOne(fakeClient().client, { id: M, contactId: C, mediaUrl: 'https://cdn.fbsbx.com/a' }, { fetchImpl: hang as unknown as typeof fetch, timeoutMs: 20 })).toBe(false)
    const said = JSON.stringify(warn.mock.calls)
    expect(said).toContain('whatsapp 410')
    expect(said).toContain('timed out')
    expect(said).not.toMatch(/SECRET|https?:/)
  })
})

describe('keeping what a delivery brought, and the sweep', () => {
  it("asks for the delivery's own messages and keeps each", async () => {
    const { client, rpc } = fakeClient({ listed: [{ id: M, contactId: C, channel: 'messenger', mediaUrl: 'https://cdn.fbsbx.com/a' }] })
    const fetchImpl = vi.fn(async () => new Response('PDF', { status: 200, headers: { 'content-type': 'application/pdf' } }))
    expect(await keepCustomerMedia(client, { externalIds: ['mid.1'], fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ listed: 1, kept: 1 })
    expect(rpc).toHaveBeenCalledWith('crm_media_to_keep', { p_external_ids: ['mid.1'], p_limit: 20 })
  })

  it('a delivery with no media asks nothing; the sweep lists anything still at Meta', async () => {
    const { client, rpc } = fakeClient()
    expect(await keepCustomerMedia(client, { externalIds: [] })).toEqual({ listed: 0, kept: 0 })
    expect(rpc).not.toHaveBeenCalled()
    await keepCustomerMedia(client, { limit: 20 })
    expect(rpc).toHaveBeenCalledWith('crm_media_to_keep', { p_external_ids: null, p_limit: 20 })
  })

  it('starts no new file past its time budget', async () => {
    const rows = [1, 2, 3].map(n => ({ id: `${M.slice(0, -1)}${n}`, contactId: C, mediaUrl: 'https://cdn.fbsbx.com/a' }))
    const { client } = fakeClient({ listed: rows })
    const fetchImpl = vi.fn(async () => { await new Promise(r => setTimeout(r, 30)); return new Response('A', { status: 200 }) })
    const out = await keepCustomerMedia(client, { fetchImpl: fetchImpl as unknown as typeof fetch, budgetMs: 10 })
    expect(out).toEqual({ listed: 3, kept: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('a listing that fails is logged and nothing is fetched', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const client = { rpc: vi.fn(async () => ({ data: null, error: { code: '42501' } })) } as unknown as SupabaseClient
    expect(await keepCustomerMedia(client, {})).toEqual({ listed: 0, kept: 0 })
    expect(error).toHaveBeenCalledWith('[crm-media keep] listing failed', '42501')
  })
})
