import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({
  startUpload: vi.fn(),
  removeUploads: vi.fn(async (..._args: unknown[]) => ({ data: [{ name: 'u/c/x.png' }], error: null })),
}))
vi.mock('./actions', () => actions)

import { forgetFileBuckets } from './buckets'
import { fileRoute, withBrowserFileStorage, type BrowserFileBucket } from './browser'

const storageOf = (client: object, opts?: Parameters<typeof withBrowserFileStorage>[1]) =>
  (withBrowserFileStorage(client, opts) as unknown as { storage: { from: (bucket: string) => BrowserFileBucket } }).storage

/** The browser's client: the buckets it may read, and Supabase Storage's own calls (mocked). */
function fakeClient(backends: Record<string, 'supabase' | 'r2'> | 'unreadable' = {}) {
  const bucket = {
    upload: vi.fn(async (..._args: unknown[]) => ({ data: { path: 'supabase-path' }, error: null })),
    remove: vi.fn(async (..._args: unknown[]) => ({ data: [], error: null })),
    createSignedUrl: vi.fn(async (..._args: unknown[]) => ({ data: { signedUrl: 'https://supabase/signed' }, error: null })),
    createSignedUrls: vi.fn(async (..._args: unknown[]) => ({ data: [], error: null })),
    download: vi.fn(async (..._args: unknown[]) => ({ data: new Blob(['s']), error: null })),
    getPublicUrl: vi.fn((..._args: unknown[]) => ({ data: { publicUrl: 'https://supabase/public/x' } })),
  }
  const rows = backends === 'unreadable' ? null : Object.entries(backends).map(([id, backend]) => ({
    id, backend, public: id === 'crm-auto-reply', public_url: id === 'crm-auto-reply' ? 'https://cdn.houzsventure.com/crm-auto-reply' : null,
  }))
  const from = vi.fn((_table: string) => ({
    select: () => Promise.resolve(rows ? { data: rows, error: null } : { data: null, error: { code: '57014', message: 'timeout' } }),
  }))
  return { client: { from, storage: { from: vi.fn(() => bucket) }, rpc: vi.fn(() => 'rpc') }, bucket }
}

const png = () => new Blob(['12345'], { type: 'image/png' })
const r2Plan = (extra: Record<string, unknown> = {}) => ({ ok: true, backend: 'r2', id: 'row-1', url: 'https://r2/put', headers: { 'content-type': 'image/png', 'if-none-match': '*' }, publicUrl: null, ...extra })

beforeEach(() => {
  forgetFileBuckets()
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllGlobals())

describe('a bucket still in Supabase Storage, from the browser', () => {
  it('is asked exactly as before — no server round trip, nothing else', async () => {
    const fetchMock = vi.fn((..._args: unknown[]) => undefined)
    vi.stubGlobal('fetch', fetchMock)
    const { client, bucket } = fakeClient({ 'hr-documents': 'supabase' })
    const files = storageOf(client).from('hr-documents')
    expect(await files.upload('documents/a/x.pdf', png(), { contentType: 'application/pdf', upsert: false })).toEqual({ data: { path: 'supabase-path' }, error: null })
    expect(bucket.upload).toHaveBeenCalledWith('documents/a/x.pdf', expect.any(Blob), { contentType: 'application/pdf', upsert: false })
    expect((await files.createSignedUrl('documents/a/x.pdf', 300, { download: 'x.pdf' })).data).toEqual({ signedUrl: 'https://supabase/signed' })
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('documents/a/x.pdf', 300, { download: 'x.pdf' })
    await files.remove(['documents/a/x.pdf'])
    expect(bucket.remove).toHaveBeenCalledWith(['documents/a/x.pdf'])
    expect(actions.startUpload).not.toHaveBeenCalled()
    expect(actions.removeUploads).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('a bucket in R2, from the browser', () => {
  it('sends a file straight to R2 with the link the server made — nothing else carries it', async () => {
    actions.startUpload.mockResolvedValueOnce(r2Plan())
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { client, bucket } = fakeClient({ 'it-requests': 'r2' })
    const res = await storageOf(client).from('it-requests').upload('u/c/x.png', png(), { contentType: 'image/png', upsert: false })
    expect(res).toEqual({ data: { id: 'row-1', path: 'u/c/x.png', fullPath: 'it-requests/u/c/x.png' }, error: null })
    expect(actions.startUpload).toHaveBeenCalledWith({ bucket: 'it-requests', path: 'u/c/x.png', size: 5, contentType: 'image/png', stranger: false })
    expect(fetchMock).toHaveBeenCalledWith('https://r2/put', { method: 'PUT', body: expect.any(Blob), headers: { 'content-type': 'image/png', 'if-none-match': '*' } })
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('a refusal is the server’s words; a file R2 would not take goes with its row', async () => {
    const { client } = fakeClient({ 'it-requests': 'r2' })
    const files = storageOf(client).from('it-requests')
    actions.startUpload.mockResolvedValueOnce({ ok: false, message: 'new row violates row-level security policy' })
    expect((await files.upload('x/y.png', png())).error?.message).toBe('new row violates row-level security policy')
    actions.startUpload.mockResolvedValueOnce(r2Plan())
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })))
    expect((await files.upload('u/c/y.png', png())).error?.status).toBe(403)
    expect(actions.removeUploads).toHaveBeenCalledWith({ bucket: 'it-requests', paths: ['u/c/y.png'] })
  })

  it('removes on the server, as far as the bucket lets this person', async () => {
    const { client, bucket } = fakeClient({ 'it-requests': 'r2' })
    expect(await storageOf(client).from('it-requests').remove(['u/c/x.png'])).toEqual({ data: [{ name: 'u/c/x.png' }], error: null })
    expect(bucket.remove).not.toHaveBeenCalled()
  })

  it('a link is the portal’s own address, signed at the click — no round trip to make one', async () => {
    const { client } = fakeClient({ attendance: 'r2' })
    const files = storageOf(client).from('attendance')
    expect((await files.createSignedUrl('profile/u 1/me.jpg', 3600)).data?.signedUrl).toBe('/files/attendance/profile/u%201/me.jpg')
    expect((await files.createSignedUrls(['a/b.png'], 60)).data).toEqual([{ path: 'a/b.png', signedUrl: '/files/attendance/a/b.png', error: null }])
    expect(fileRoute('hr-documents', 'documents/a/x.pdf', 'Handbook 2026.pdf')).toBe('/files/hr-documents/documents/a/x.pdf?download=Handbook%202026.pdf')
    expect(fileRoute('hr-documents', 'documents/a/x.pdf', true)).toBe('/files/hr-documents/documents/a/x.pdf?download=1')
  })

  it('a public file’s address is its bucket’s own', async () => {
    actions.startUpload.mockResolvedValueOnce(r2Plan({ publicUrl: 'https://cdn.houzsventure.com/crm-auto-reply/u/1.png' }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    const { client } = fakeClient({ 'crm-auto-reply': 'r2' })
    const files = storageOf(client).from('crm-auto-reply')
    await files.upload('u/1.png', png())
    expect(files.getPublicUrl('u/1.png').data.publicUrl).toBe('https://cdn.houzsventure.com/crm-auto-reply/u/1.png')
    expect(files.getPublicUrl('u/2 b.png').data.publicUrl).toBe('https://cdn.houzsventure.com/crm-auto-reply/u/2%20b.png')
  })
})

describe('either way', () => {
  it('a list that cannot be read here leaves it to the server', async () => {
    actions.startUpload.mockResolvedValueOnce({ ok: true, backend: 'supabase' })
    const { client, bucket } = fakeClient('unreadable')
    await storageOf(client).from('hr-documents').upload('documents/a/x.pdf', png())
    expect(actions.startUpload).toHaveBeenCalled()
    expect(bucket.upload).toHaveBeenCalled()
  })

  it('while viewing as somebody nothing is sent, nobody is asked', async () => {
    const { client, bucket } = fakeClient({ 'it-requests': 'r2', 'hr-documents': 'supabase' })
    for (const b of ['it-requests', 'hr-documents']) {
      const files = storageOf(client, { readOnly: true }).from(b)
      expect((await files.upload('u/c/x.png', png())).error?.message).toMatch(/^Read-only/)
      expect((await files.remove(['u/c/x.png'])).error?.message).toMatch(/^Read-only/)
    }
    expect(actions.startUpload).not.toHaveBeenCalled()
    expect(actions.removeUploads).not.toHaveBeenCalled()
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('the guest page sends as the stranger it is, and takes nothing back when R2 refuses', async () => {
    actions.startUpload.mockResolvedValueOnce(r2Plan())
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    const { client } = fakeClient({ 'hiring-files': 'r2' })
    await storageOf(client, { stranger: true }).from('hiring-files').upload('guest/hv-ABCDEFGH/x.pdf', png())
    expect(actions.startUpload).toHaveBeenCalledWith(expect.objectContaining({ stranger: true }))
    expect(actions.removeUploads).not.toHaveBeenCalled()
  })

  it('leaves everything but .storage to the client', () => {
    const { client } = fakeClient()
    expect(withBrowserFileStorage(client).rpc()).toBe('rpc')
  })
})
