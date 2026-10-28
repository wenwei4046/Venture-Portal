import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))
const { keepMedia, keptPath, metaCdnUrl } = await import('./media-keep')

const C = '11111111-2222-3333-4444-555555555555'

describe('every photo, video and file kept in lead-media (mig 20261028110000)', () => {
  it('names a kept file by its message, keeping a file’s own name', () => {
    expect(keptPath(C, 42, 'image/jpeg', '[Photo]')).toBe(`chat/${C}/meta-42-file.jpg`)
    expect(keptPath(C, 43, 'application/pdf', '[File] price/list.pdf')).toBe(`chat/${C}/meta-43-price_list.pdf`)
    expect(metaCdnUrl('https://scontent.xx.fbcdn.net/v/a.jpg')).toBeTruthy()
    expect(metaCdnUrl('https://example.com/a.jpg')).toBeNull()
  })

  it('copies what Meta still serves and tells the database; skips the rest', async () => {
    const upload = vi.fn(async () => ({ data: {}, error: null }))
    const rpc = vi.fn(async (fn: string) => fn === 'lead_media_to_keep'
      ? { data: [
        { id: 1, contactId: C, url: 'https://scontent.xx.fbcdn.net/v/a.jpg', body: '[Photo]' },
        { id: 2, contactId: C, url: 'https://scontent.xx.fbcdn.net/v/gone.jpg', body: '[Photo]' },
        { id: 3, contactId: C, url: 'https://evil.example.com/x.jpg', body: '[Photo]' },
      ], error: null }
      : { data: 1, error: null })
    const client = { rpc, storage: { from: () => ({ upload }) } } as unknown as SupabaseClient
    const fetchImpl = vi.fn(async (url: string) => url.includes('gone')
      ? new Response('', { status: 403 })
      : new Response(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch
    expect(await keepMedia(client, fetchImpl)).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(upload).toHaveBeenCalledWith(`chat/${C}/meta-1-file.jpg`, expect.any(Blob), { contentType: 'image/jpeg', upsert: true })
    expect(rpc).toHaveBeenLastCalledWith('lead_media_kept', { p_rows: [{ id: 1, path: `chat/${C}/meta-1-file.jpg`, mime: 'image/jpeg' }] })
  })
})
