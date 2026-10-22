import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const ENV = {
  R2_ACCOUNT_ID: 'acc0123456789',
  R2_ACCESS_KEY_ID: 'AKIDEXAMPLE',
  R2_SECRET_ACCESS_KEY: 'secret-example',
  R2_BUCKET: 'houzs-venture-files',
  R2_PUBLIC_BUCKET: 'houzs-venture-public',
}

describe('R2 (lib/storage/r2.ts)', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('is not configured while any of its settings is missing', async () => {
    const { r2Settings } = await import('./r2')
    expect(r2Settings({ ...ENV, R2_SECRET_ACCESS_KEY: '' })).toBeNull()
    expect(r2Settings({ ...ENV, R2_BUCKET: ' ' })).toBeNull()
    expect(r2Settings(ENV)).toEqual({ accountId: 'acc0123456789', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret-example', privateBucket: 'houzs-venture-files', publicBucket: 'houzs-venture-public' })
  })

  it('keeps a private bucket’s files in the private R2 bucket and a public one’s in the public, each under its bucket’s name', async () => {
    const { r2Location } = await import('./r2')
    expect(r2Location('hr-documents', 'documents/a/x.pdf', false)).toEqual({ r2Bucket: 'houzs-venture-files', key: 'hr-documents/documents/a/x.pdf' })
    expect(r2Location('crm-auto-reply', 'u/1.png', true)).toEqual({ r2Bucket: 'houzs-venture-public', key: 'crm-auto-reply/u/1.png' })
  })

  it('signs a read link on R2’s own address, for as long as asked, saving under a name when asked', async () => {
    const { presignGet } = await import('./r2')
    const url = new URL(await presignGet({ r2Bucket: 'houzs-venture-files', key: 'hr-documents/documents/a/x.pdf' }, 300, { download: 'Handbook 2026.pdf' }))
    expect(url.origin).toBe('https://acc0123456789.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/houzs-venture-files/hr-documents/documents/a/x.pdf')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(/^AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request$/)
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(url.searchParams.get('response-content-disposition')).toBe(`attachment; filename="Handbook 2026.pdf"; filename*=UTF-8''Handbook%202026.pdf`)
    const plain = new URL(await presignGet({ r2Bucket: 'houzs-venture-files', key: 'it-requests/u/c.png' }, 10_000_000))
    expect(plain.searchParams.get('X-Amz-Expires')).toBe('604800')
    expect(plain.searchParams.has('response-content-disposition')).toBe(false)
  })

  it('signs an upload link for that one file: its type, its exact size, and never over a file already there', async () => {
    const { presignPut } = await import('./r2')
    const { url, headers } = await presignPut({ r2Bucket: 'houzs-venture-files', key: 'it-requests/u/c/shot.png' }, { size: 1234, contentType: 'image/png' }, 900)
    const signed = new URL(url)
    expect(signed.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host;if-none-match')
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('900')
    // What the browser sends itself: the type and "only if nothing is there" (Content-Length it sets on its own).
    expect(headers).toEqual({ 'content-type': 'image/png', 'if-none-match': '*' })
  })

  it('names a download in plain letters for old browsers and in UTF-8 for the rest', async () => {
    const { attachmentDisposition } = await import('./r2')
    expect(attachmentDisposition('员工手册.pdf')).toBe(`attachment; filename="____.pdf"; filename*=UTF-8''%E5%91%98%E5%B7%A5%E6%89%8B%E5%86%8C.pdf`)
    expect(attachmentDisposition('a"b\\c\nd.pdf')).toBe(`attachment; filename="a_b_c_d.pdf"; filename*=UTF-8''a_b_c_d.pdf`)
    expect(attachmentDisposition('')).toBe(`attachment; filename="file"; filename*=UTF-8''file`)
  })

  it('reads a page of ListObjectsV2', async () => {
    const { parseList } = await import('./r2')
    const xml = `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated>
      <Contents><Key>hr-documents/a&amp;b.pdf</Key><LastModified>2026-10-22T01:02:03.000Z</LastModified><Size>12</Size></Contents>
      <Contents><Key>hr-documents/c.pdf</Key><LastModified>2026-10-23T01:02:03.000Z</LastModified><Size>0</Size></Contents>
      <NextContinuationToken>tok/en=</NextContinuationToken></ListBucketResult>`
    expect(parseList(xml)).toEqual({
      objects: [
        { key: 'hr-documents/a&b.pdf', size: 12, lastModified: '2026-10-22T01:02:03.000Z' },
        { key: 'hr-documents/c.pdf', size: 0, lastModified: '2026-10-23T01:02:03.000Z' },
      ],
      next: 'tok/en=',
    })
    expect(parseList('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>')).toEqual({ objects: [], next: null })
  })

  it('puts from the server with the key, never over a file already there', async () => {
    const fetchMock = vi.fn(async (_req: Request) => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { r2Put } = await import('./r2')
    expect(await r2Put({ r2Bucket: 'houzs-venture-files', key: 'payment-attachments/v/slip.pdf' }, new Uint8Array([1, 2, 3]), 'application/pdf')).toEqual({ ok: true })
    const req = fetchMock.mock.calls[0][0]
    expect(req.method).toBe('PUT')
    expect(req.url).toBe('https://acc0123456789.r2.cloudflarestorage.com/houzs-venture-files/payment-attachments/v/slip.pdf')
    expect(req.headers.get('if-none-match')).toBe('*')
    expect(req.headers.get('content-type')).toBe('application/pdf')
    expect(req.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\//)
  })

  it('says why R2 refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<Error><Code>PreconditionFailed</Code></Error>', { status: 412 })))
    const { r2Put } = await import('./r2')
    expect(await r2Put({ r2Bucket: 'b', key: 'k' }, new Uint8Array([1]), 'image/png')).toEqual({ ok: false, status: 412, message: 'PreconditionFailed (412)' })
  })
})
