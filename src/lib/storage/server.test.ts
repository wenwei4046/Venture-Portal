import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const r2 = vi.hoisted(() => ({
  r2Location: vi.fn((bucket: string, name: string, isPublic: boolean) => ({ r2Bucket: isPublic ? 'pub' : 'priv', key: `${bucket}/${name}` })),
  r2Put: vi.fn(async (..._args: unknown[]) => ({ ok: true as const })),
  r2Get: vi.fn(async (..._args: unknown[]) => new Response(new Blob(['PDF'], { type: 'application/pdf' }))),
  r2Copy: vi.fn(async (..._args: unknown[]) => ({ ok: true as const })),
  r2DeleteMany: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
  presignGet: vi.fn(async (loc: { key: string }, expires: number, opts: { download?: string } = {}) => `https://r2/${loc.key}?e=${expires}${opts.download ? `&d=${opts.download}` : ''}`),
  presignPut: vi.fn(async (loc: { key: string }, file: { size: number; contentType: string }) => ({ url: `https://r2/${loc.key}?put=${file.size}`, headers: { 'content-type': file.contentType, 'if-none-match': '*' } })),
}))
vi.mock('./r2', () => r2)

import { forgetFileBuckets } from './buckets'
import { fileStorage, prepareUpload, withFileStorage } from './server'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { code?: string; message?: string } | null }

/**
 * A database as far as the storage layer asks it: the buckets, and file_objects behind a policy the test sets — the
 * way row level security answers (a refused insert errs, a refused read or delete just finds nothing).
 */
function fakeDb(opts: {
  backends?: Record<string, 'supabase' | 'r2'>
  bucketsError?: { code?: string; message?: string }
  files?: Row[]
  mayInsert?: (row: Row) => Result['error']
  mayRead?: (row: Row) => boolean
  mayDelete?: (row: Row) => boolean
}) {
  const files: Row[] = [...(opts.files ?? [])]
  const log: string[] = []
  const buckets = Object.entries(opts.backends ?? {}).map(([id, backend]) => ({
    id, backend, public: id === 'crm-auto-reply', file_size_limit: null, allowed_mime_types: null,
    public_url: id === 'crm-auto-reply' ? 'https://cdn.houzsventure.com/crm-auto-reply' : null,
  }))
  const from = (table: string) => {
    let op: 'select' | 'insert' | 'delete' = 'select'
    let payload: Row | null = null
    const filters: Array<(r: Row) => boolean> = []
    const run = (): Result => {
      if (table === 'file_buckets') return opts.bucketsError ? { data: null, error: opts.bucketsError } : { data: buckets, error: null }
      if (op === 'insert') {
        const refused = opts.mayInsert?.(payload!) ?? null
        log.push(`insert ${String(payload!.bucket_id)}/${String(payload!.name)}${refused ? ' refused' : ''}`)
        if (!refused) files.push({ owner: null, owner_id: null, created_at: '2026-10-23T00:00:00Z', ...payload! })
        return { data: null, error: refused }
      }
      const hits = files.filter(r => filters.every(f => f(r)))
      if (op === 'delete') {
        const gone = hits.filter(r => opts.mayDelete?.(r) ?? true)
        for (const g of gone) files.splice(files.indexOf(g), 1)
        log.push(`delete ${gone.map(g => String(g.name)).join(',')}`)
        return { data: gone, error: null }
      }
      return { data: hits.filter(r => opts.mayRead?.(r) ?? true), error: null }
    }
    const builder = {
      select: () => builder,
      insert: (row: Row) => { op = 'insert'; payload = row; return builder },
      delete: () => { op = 'delete'; return builder },
      eq: (col: string, v: unknown) => { filters.push(r => r[col] === v); return builder },
      in: (col: string, vs: unknown[]) => { filters.push(r => vs.includes(r[col])); return builder },
      order: () => builder,
      range: () => builder,
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    }
    return builder
  }
  const supabaseBucket = {
    upload: vi.fn(async () => ({ data: { path: 'from-supabase' }, error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://supabase/signed' }, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://supabase/public' } })),
  }
  const storage = { from: vi.fn(() => supabaseBucket) }
  const db = { from, storage } as unknown as SupabaseClient
  return { db, files, log, storage, supabaseBucket }
}

const pdf = (text = 'PDF') => new Blob([text], { type: 'application/pdf' })

beforeEach(() => {
  forgetFileBuckets()
  vi.clearAllMocks()
})

describe('a bucket still in Supabase Storage', () => {
  it('is handed to Supabase as before — every call, the same arguments', async () => {
    const { db, supabaseBucket, storage } = fakeDb({ backends: { 'hr-documents': 'supabase' } })
    const files = withFileStorage(db).storage.from('hr-documents')
    expect(await files.upload('documents/a/x.pdf', pdf(), { contentType: 'application/pdf', upsert: false })).toEqual({ data: { path: 'from-supabase' }, error: null })
    expect(supabaseBucket.upload).toHaveBeenCalledWith('documents/a/x.pdf', expect.any(Blob), { contentType: 'application/pdf', upsert: false })
    expect((await files.createSignedUrl('documents/a/x.pdf', 300)).data).toEqual({ signedUrl: 'https://supabase/signed' })
    expect(supabaseBucket.createSignedUrl).toHaveBeenCalledWith('documents/a/x.pdf', 300)
    expect(storage.from).toHaveBeenCalledWith('hr-documents')
    expect(r2.r2Put).not.toHaveBeenCalled()
  })

  it('…and so is a bucket the portal does not list, and every bucket of a database without the table yet', async () => {
    const unlisted = fakeDb({ backends: { 'hr-documents': 'r2' } })
    await withFileStorage(unlisted.db).storage.from('somewhere').createSignedUrl('a.pdf', 60)
    expect(unlisted.supabaseBucket.createSignedUrl).toHaveBeenCalled()
    forgetFileBuckets()
    const early = fakeDb({ bucketsError: { code: 'PGRST205', message: 'Could not find the table' } })
    await withFileStorage(early.db).storage.from('hr-documents').createSignedUrl('a.pdf', 60)
    expect(early.supabaseBucket.createSignedUrl).toHaveBeenCalled()
  })

  it('a list that cannot be read is not guessed: nothing is sent anywhere', async () => {
    const { db, supabaseBucket } = fakeDb({ bucketsError: { code: '57014', message: 'timeout' } })
    const res = await withFileStorage(db).storage.from('hr-documents').upload('documents/a/x.pdf', pdf())
    expect(res.error?.status).toBe(503)
    expect(supabaseBucket.upload).not.toHaveBeenCalled()
    expect(r2.r2Put).not.toHaveBeenCalled()
  })
})

describe('a bucket in R2', () => {
  it('uploads: its row first (the bucket’s policy decides), then the file into R2', async () => {
    const { db, files, log } = fakeDb({ backends: { 'hr-documents': 'r2' } })
    const res = await withFileStorage(db).storage.from('hr-documents').upload('documents/a/x.pdf', pdf('12345'), { contentType: 'Application/PDF; x=y' })
    expect(res.error).toBeNull()
    expect(res.data).toMatchObject({ path: 'documents/a/x.pdf', fullPath: 'hr-documents/documents/a/x.pdf' })
    expect(log).toEqual(['insert hr-documents/documents/a/x.pdf'])
    expect(files[0]).toMatchObject({ bucket_id: 'hr-documents', name: 'documents/a/x.pdf', metadata: { size: 5, mimetype: 'application/pdf' } })
    expect(r2.r2Put).toHaveBeenCalledWith({ r2Bucket: 'priv', key: 'hr-documents/documents/a/x.pdf' }, expect.any(Blob), 'application/pdf')
  })

  it('a refused row never reaches R2, and says it in Storage’s words', async () => {
    const { db } = fakeDb({ backends: { 'hr-documents': 'r2' }, mayInsert: () => ({ code: '42501', message: 'new row violates row-level security policy for table "file_objects"' }) })
    const res = await withFileStorage(db).storage.from('hr-documents').upload('documents/a/x.pdf', pdf())
    expect(res.error).toMatchObject({ status: 403, message: 'new row violates row-level security policy for table "file_objects"' })
    expect(r2.r2Put).not.toHaveBeenCalled()
  })

  it('the bucket’s size and type rules answer in Storage’s words too; a name taken is "already exists"', async () => {
    const big = fakeDb({ backends: { 'hr-documents': 'r2' }, mayInsert: () => ({ code: '22023', message: 'The object exceeded the maximum allowed size' }) })
    expect((await withFileStorage(big.db).storage.from('hr-documents').upload('documents/a/x.pdf', pdf())).error?.message).toBe('The object exceeded the maximum allowed size')
    forgetFileBuckets()
    const taken = fakeDb({ backends: { 'hr-documents': 'r2' }, mayInsert: () => ({ code: '23505', message: 'duplicate key' }) })
    expect((await withFileStorage(taken.db).storage.from('hr-documents').upload('documents/a/x.pdf', pdf())).error).toMatchObject({ status: 409, message: 'The resource already exists' })
  })

  it('while viewing as somebody the row is refused by the read-only client, in its words', async () => {
    const { db } = fakeDb({ backends: { 'it-requests': 'r2' }, mayInsert: () => ({ code: 'VIEW_AS', message: 'Read-only while viewing as somebody — nothing is saved.' }) })
    const res = await withFileStorage(db).storage.from('it-requests').upload('u/c/x.png', new Blob(['x'], { type: 'image/png' }))
    expect(res.error?.message).toMatch(/^Read-only/)
    expect(r2.r2Put).not.toHaveBeenCalled()
  })

  it('a file R2 would not take takes its row back with it', async () => {
    r2.r2Put.mockResolvedValueOnce({ ok: false, status: 500, message: 'x' } as never)
    const { db, files, log } = fakeDb({ backends: { 'hr-documents': 'r2' } })
    const res = await withFileStorage(db).storage.from('hr-documents').upload('documents/a/x.pdf', pdf())
    expect(res.error?.status).toBe(502)
    expect(log).toEqual(['insert hr-documents/documents/a/x.pdf', 'delete documents/a/x.pdf'])
    expect(files).toEqual([])
  })

  it('never replaces a file, and never takes a name that is no path', async () => {
    const { db, log } = fakeDb({ backends: { 'hr-documents': 'r2' } })
    const files = withFileStorage(db).storage.from('hr-documents')
    expect((await files.upload('documents/a/x.pdf', pdf(), { upsert: true })).error?.status).toBe(400)
    expect((await files.upload('../x.pdf', pdf())).error?.status).toBe(400)
    expect(log).toEqual([])
  })

  it('signs a link only for a file the caller may read; a browser-runnable file only ever downloads', async () => {
    const { db } = fakeDb({
      backends: { 'member-forms': 'r2' },
      files: [
        { id: '1', bucket_id: 'member-forms', name: 'templates/form.pdf', metadata: { size: 1, mimetype: 'application/pdf' } },
        { id: '2', bucket_id: 'member-forms', name: 'templates/form.html', metadata: { size: 1, mimetype: 'text/html' } },
        { id: '3', bucket_id: 'member-forms', name: 'templates/secret.pdf', metadata: { size: 1, mimetype: 'application/pdf' } },
      ],
      mayRead: r => r.name !== 'templates/secret.pdf',
    })
    const files = withFileStorage(db).storage.from('member-forms')
    expect(await files.createSignedUrl('templates/form.pdf', 300)).toEqual({ data: { signedUrl: 'https://r2/member-forms/templates/form.pdf?e=300' }, error: null })
    expect((await files.createSignedUrl('templates/form.pdf', 60, { download: 'Form A.pdf' })).data?.signedUrl).toBe('https://r2/member-forms/templates/form.pdf?e=60&d=Form A.pdf')
    expect((await files.createSignedUrl('templates/form.pdf', 60, { download: true })).data?.signedUrl).toContain('&d=form.pdf')
    expect((await files.createSignedUrl('templates/form.html', 60)).data?.signedUrl).toContain('&d=form.html')
    expect(await files.createSignedUrl('templates/secret.pdf', 60)).toMatchObject({ data: null, error: { status: 404, message: 'Object not found' } })
    const many = await files.createSignedUrls(['templates/form.pdf', 'templates/secret.pdf'], 600)
    expect(many.data).toEqual([
      { path: 'templates/form.pdf', signedUrl: 'https://r2/member-forms/templates/form.pdf?e=600', error: null },
      { path: 'templates/secret.pdf', signedUrl: '', error: 'Object not found' },
    ])
  })

  it('reads a file the caller may read, from R2', async () => {
    const { db } = fakeDb({ backends: { 'crm-showrooms': 'r2' }, files: [{ id: '1', bucket_id: 'crm-showrooms', name: 'r1/1.jpg', metadata: {} }] })
    const got = await withFileStorage(db).storage.from('crm-showrooms').download('r1/1.jpg')
    expect(got.error).toBeNull()
    expect(await got.data?.text()).toBe('PDF')
    expect((await withFileStorage(db).storage.from('crm-showrooms').download('r1/none.jpg')).error?.status).toBe(404)
  })

  it('removes: the rows the caller’s policy lets go, then their files — "refused" is "nothing deleted"', async () => {
    const { db, files } = fakeDb({
      backends: { 'hiring-files': 'r2' },
      files: [
        { id: '1', bucket_id: 'hiring-files', name: 'files/a/x.pdf', metadata: {} },
        { id: '2', bucket_id: 'hiring-files', name: 'files/b/kept.pdf', metadata: {} },
      ],
      mayDelete: r => r.name !== 'files/b/kept.pdf',
    })
    const res = await withFileStorage(db).storage.from('hiring-files').remove(['files/a/x.pdf', 'files/b/kept.pdf', 'files/a/x.pdf'])
    expect(res.data?.map(r => r.name)).toEqual(['files/a/x.pdf'])
    expect(r2.r2DeleteMany).toHaveBeenCalledWith([{ r2Bucket: 'priv', key: 'hiring-files/files/a/x.pdf' }])
    expect(files.map(f => f.name)).toEqual(['files/b/kept.pdf'])
  })

  it('copies inside R2: the source read, the copy’s row under the caller’s policy, its size and type kept', async () => {
    const { db, files } = fakeDb({ backends: { 'hr-documents': 'r2' }, files: [{ id: '1', bucket_id: 'hr-documents', name: 'drive/a/x.pdf', metadata: { size: 9, mimetype: 'application/pdf' } }] })
    const res = await withFileStorage(db).storage.from('hr-documents').copy('drive/a/x.pdf', 'drive/b/x.pdf')
    expect(res).toEqual({ data: { path: 'drive/b/x.pdf' }, error: null })
    expect(files.find(f => f.name === 'drive/b/x.pdf')).toMatchObject({ metadata: { size: 9, mimetype: 'application/pdf' } })
    expect(r2.r2Copy).toHaveBeenCalledWith({ r2Bucket: 'priv', key: 'hr-documents/drive/a/x.pdf' }, { r2Bucket: 'priv', key: 'hr-documents/drive/b/x.pdf' })
  })

  it('a public bucket’s address is its own (file_buckets.public_url) once its bucket is known here', async () => {
    const { db } = fakeDb({ backends: { 'crm-auto-reply': 'r2' } })
    const files = withFileStorage(db).storage.from('crm-auto-reply')
    await files.createSignedUrl('u/none.png', 1) // reads the list
    expect(files.getPublicUrl('u/1 hi.png').data.publicUrl).toBe('https://cdn.houzsventure.com/crm-auto-reply/u/1%20hi.png')
  })
})

describe('a browser’s upload, prepared on the server', () => {
  it('writes the file’s row and hands back a link for that one file', async () => {
    const { db, files } = fakeDb({ backends: { 'it-requests': 'r2' } })
    const plan = await prepareUpload(db, 'it-requests', { path: 'u/c/shot.png', size: 42, contentType: 'image/png' })
    expect(plan).toMatchObject({ ok: true, backend: 'r2', url: 'https://r2/it-requests/u/c/shot.png?put=42', headers: { 'content-type': 'image/png', 'if-none-match': '*' }, publicUrl: null })
    expect(files[0]).toMatchObject({ name: 'u/c/shot.png', metadata: { size: 42, mimetype: 'image/png' } })
  })

  it('a bucket still in Storage: the browser sends it there itself', async () => {
    const { db, log } = fakeDb({ backends: { 'it-requests': 'supabase' } })
    expect(await prepareUpload(db, 'it-requests', { path: 'u/c/shot.png', size: 42, contentType: 'image/png' })).toEqual({ ok: true, backend: 'supabase' })
    expect(log).toEqual([])
  })

  it('a refused row is the answer, and no link is made', async () => {
    const { db } = fakeDb({ backends: { 'it-requests': 'r2' }, mayInsert: () => ({ code: '42501', message: 'new row violates row-level security policy' }) })
    expect(await prepareUpload(db, 'it-requests', { path: 'other/c/shot.png', size: 1, contentType: 'image/png' })).toEqual({ ok: false, message: 'new row violates row-level security policy' })
    expect(r2.presignPut).not.toHaveBeenCalled()
  })

  it('no link to be made (R2 unset): the row goes again', async () => {
    r2.presignPut.mockRejectedValueOnce(new Error('File storage (R2) is not configured on this server.'))
    const { db, files } = fakeDb({ backends: { 'it-requests': 'r2' } })
    expect((await prepareUpload(db, 'it-requests', { path: 'u/c/shot.png', size: 1, contentType: 'image/png' })).ok).toBe(false)
    expect(files).toEqual([])
  })

  it('a public bucket’s file says where it will be seen', async () => {
    const { db } = fakeDb({ backends: { 'crm-auto-reply': 'r2' } })
    expect(await prepareUpload(db, 'crm-auto-reply', { path: 'u/1.png', size: 1, contentType: 'image/png' })).toMatchObject({ publicUrl: 'https://cdn.houzsventure.com/crm-auto-reply/u/1.png' })
  })
})

describe('the client wrapper', () => {
  it('answers .storage here and leaves everything else to the client', async () => {
    const { db } = fakeDb({ backends: {} })
    const client = Object.assign(db, { rpc: vi.fn(async () => ({ data: 7, error: null })) })
    const wrapped = withFileStorage(client)
    expect(await wrapped.rpc('x')).toEqual({ data: 7, error: null })
    expect(typeof wrapped.storage.from('a').createSignedUrl).toBe('function')
    expect(fileStorage(db, null).from('x')).toHaveProperty('upload')
  })
})
