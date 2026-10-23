import 'server-only'
import { AwsClient, AwsV4Signer } from 'aws4fetch'

/**
 * Cloudflare R2 — where the portal's files live (2026-10-23, the owner: every file moves from Supabase Storage to R2,
 * the CRM's included). This module holds the R2 key and is the only one that talks to R2: it signs a link, puts,
 * reads, copies, lists and deletes an object, and nothing else. It never decides WHO may — the database does, through
 * `public.file_objects`' policies, before anything here is called (lib/storage/server.ts).
 *
 * Two R2 buckets: every private bucket's objects sit in `R2_BUCKET`, every public one's in `R2_PUBLIC_BUCKET`, each
 * under its own bucket's name (`hr-documents/documents/…`), so a key is `<bucket>/<name>` and the database keeps
 * `bucket_id` + `name` exactly as storage.objects did. A presigned link is only ever made on R2's own S3 address —
 * R2 refuses one on a custom domain — and a public object is read on its bucket's own address (`file_buckets.public_url`,
 * cdn.houzsventure.com), which needs no signing.
 */

export interface R2Settings {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  privateBucket: string
  publicBucket: string
}

/** Where one object lives in R2. */
export interface R2Location {
  r2Bucket: string
  key: string
}

/** The R2 settings from the environment, or null while any is missing (the portal then refuses R2 buckets' files). */
export function r2Settings(env: Readonly<Record<string, string | undefined>> = process.env): R2Settings | null {
  const accountId = env.R2_ACCOUNT_ID?.trim()
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim()
  const privateBucket = env.R2_BUCKET?.trim()
  const publicBucket = env.R2_PUBLIC_BUCKET?.trim()
  if (!accountId || !accessKeyId || !secretAccessKey || !privateBucket || !publicBucket) return null
  return { accountId, accessKeyId, secretAccessKey, privateBucket, publicBucket }
}

function settings(): R2Settings {
  const s = r2Settings()
  if (!s) throw new Error('File storage (R2) is not configured on this server.')
  return s
}

let client: { key: string; aws: AwsClient } | null = null

function aws(s: R2Settings): AwsClient {
  const key = `${s.accessKeyId}:${s.secretAccessKey}`
  // Three tries on an R2 hiccup (5xx / 429), not aws4fetch's ten — somebody is waiting for the answer.
  if (client?.key !== key) client = { key, aws: new AwsClient({ accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey, service: 's3', region: 'auto', retries: 3 }) }
  return client.aws
}

/** The R2 bucket and key an object of a portal bucket lives at. */
export function r2Location(bucket: string, name: string, isPublic: boolean, s: R2Settings = settings()): R2Location {
  return { r2Bucket: isPublic ? s.publicBucket : s.privateBucket, key: `${bucket}/${name}` }
}

/** A key written into a URL path: each segment encoded, the slashes kept. */
export function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function objectUrl(s: R2Settings, loc: R2Location): string {
  return `https://${s.accountId}.r2.cloudflarestorage.com/${loc.r2Bucket}/${encodeKey(loc.key)}`
}

/** `attachment` with the file's own name — plain for old browsers, UTF-8 (RFC 5987) for the rest. */
export function attachmentDisposition(fileName: string): string {
  const name = fileName.replace(/[\r\n"\\]/g, '_').trim() || 'file'
  const ascii = name.replace(/[^\x20-\x7e]/g, '_')
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}

/** Longest a presigned link may live (R2 and S3: seven days). */
const MAX_EXPIRES = 604800

const clampExpires = (seconds: number) => Math.max(1, Math.min(MAX_EXPIRES, Math.floor(Number.isFinite(seconds) ? seconds : 60)))

/**
 * A link to read one object for `expiresIn` seconds. `download` names the file it saves as (and makes it a download
 * rather than shown in place). R2 answers a Range on it with 206, so a video seeks without being fetched whole.
 */
export async function presignGet(loc: R2Location, expiresIn: number, opts: { download?: string } = {}): Promise<string> {
  const s = settings()
  const url = new URL(objectUrl(s, loc))
  url.searchParams.set('X-Amz-Expires', String(clampExpires(expiresIn)))
  if (opts.download) url.searchParams.set('response-content-disposition', attachmentDisposition(opts.download))
  const signed = await new AwsV4Signer({
    method: 'GET', url: url.toString(), accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey,
    service: 's3', region: 'auto', signQuery: true,
  }).sign()
  return signed.url.toString()
}

/**
 * A link the browser PUTs one file to, good for `expiresIn` seconds. Its type, its exact size and "only if nothing is
 * there yet" are part of the signature: a different file, a bigger one or a second PUT over it is refused by R2 itself
 * (403 / 412), so the size and type the database was told at the upload's start are what the bucket holds.
 * The browser sends `headers` as they are; it sends Content-Length by itself.
 */
export async function presignPut(loc: R2Location, file: { size: number; contentType: string }, expiresIn: number): Promise<{ url: string; headers: Record<string, string> }> {
  const s = settings()
  const url = new URL(objectUrl(s, loc))
  url.searchParams.set('X-Amz-Expires', String(clampExpires(expiresIn)))
  const headers = { 'content-type': file.contentType, 'if-none-match': '*' }
  const signed = await new AwsV4Signer({
    method: 'PUT', url: url.toString(), headers: { ...headers, 'content-length': String(file.size) },
    accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey, service: 's3', region: 'auto', signQuery: true, allHeaders: true,
  }).sign()
  return { url: signed.url.toString(), headers }
}

export type R2Answer = { ok: true } | { ok: false; status: number; message: string }

async function answer(res: Response): Promise<R2Answer> {
  if (res.ok) return { ok: true }
  const body = await res.text().catch(() => '')
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1]
  return { ok: false, status: res.status, message: code ? `${code} (${res.status})` : `R2 answered ${res.status}` }
}

/** The tries a put gets on an R2 hiccup (5xx / 429), as the client's own `retries` gives every other call. */
const PUT_TRIES = 4

/**
 * Puts one object from the server; never over one already there. Signed first (the body is UNSIGNED-PAYLOAD, so it is
 * no part of the signature), then sent with the bytes themselves (2026-10-23): handed to `fetch` inside a Request, as
 * aws4fetch's own `fetch` does, the body became a stream that Next's server sends chunked, without a length — and R2
 * refuses every such PUT, `411 MissingContentLength` (Finance's voucher attachments, the morning after the move).
 */
export async function r2Put(loc: R2Location, body: Blob | ArrayBuffer | Uint8Array, contentType: string): Promise<R2Answer> {
  const s = settings()
  let res: Response | null = null
  for (let i = 0; i < PUT_TRIES; i++) {
    if (i > 0) await new Promise(resolve => setTimeout(resolve, Math.random() * 50 * 2 ** i))
    const signed = await aws(s).sign(objectUrl(s, loc), { method: 'PUT', headers: { 'content-type': contentType, 'if-none-match': '*' } })
    res = await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: body as BodyInit, cache: 'no-store' })
    if (res.status < 500 && res.status !== 429) break
  }
  return answer(res as Response)
}

/** Reads one object (a Range passed on). The caller reads the body. */
export async function r2Get(loc: R2Location, range?: string | null): Promise<Response> {
  const s = settings()
  return aws(s).fetch(objectUrl(s, loc), { method: 'GET', headers: range ? { range } : {} })
}

/** What R2 holds at a key, or null when nothing is there. */
export async function r2Head(loc: R2Location): Promise<{ size: number; contentType: string | null; etag: string | null } | null> {
  const s = settings()
  const res = await aws(s).fetch(objectUrl(s, loc), { method: 'HEAD' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`R2 answered ${res.status}`)
  return {
    size: Number(res.headers.get('content-length') ?? 0),
    contentType: res.headers.get('content-type'),
    etag: res.headers.get('etag'),
  }
}

/** Deletes one object; true when it is gone (it was not there counts as gone). */
export async function r2Delete(loc: R2Location): Promise<boolean> {
  const s = settings()
  const res = await aws(s).fetch(objectUrl(s, loc), { method: 'DELETE' })
  return res.ok || res.status === 404
}

/** Deletes many objects, a few at a time; answers the keys that did not go. */
export async function r2DeleteMany(locs: readonly R2Location[]): Promise<R2Location[]> {
  const left: R2Location[] = []
  for (let i = 0; i < locs.length; i += 8) {
    const batch = locs.slice(i, i + 8)
    const gone = await Promise.all(batch.map(loc => r2Delete(loc).catch(() => false)))
    batch.forEach((loc, j) => { if (!gone[j]) left.push(loc) })
  }
  return left
}

/** Copies an object to a new key in R2 itself — nothing passes through the server. */
export async function r2Copy(from: R2Location, to: R2Location): Promise<R2Answer> {
  const s = settings()
  const res = await aws(s).fetch(objectUrl(s, to), {
    method: 'PUT',
    headers: { 'x-amz-copy-source': `/${from.r2Bucket}/${encodeKey(from.key)}`, 'if-none-match': '*' },
  })
  return answer(res)
}

export interface R2Listed {
  key: string
  size: number
  lastModified: string
}

/** One page (up to 1,000) of the keys under a prefix, and the token for the next page. */
export async function r2List(r2Bucket: string, prefix: string, token?: string | null): Promise<{ objects: R2Listed[]; next: string | null }> {
  const s = settings()
  const url = new URL(`https://${s.accountId}.r2.cloudflarestorage.com/${r2Bucket}`)
  url.searchParams.set('list-type', '2')
  url.searchParams.set('prefix', prefix)
  if (token) url.searchParams.set('continuation-token', token)
  const res = await aws(s).fetch(url.toString(), { method: 'GET' })
  if (!res.ok) throw new Error(`R2 answered ${res.status} listing ${prefix}`)
  return parseList(await res.text())
}

const unescapeXml = (v: string) =>
  v.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** ListObjectsV2's XML, read for the three fields the sweep needs. */
export function parseList(xml: string): { objects: R2Listed[]; next: string | null } {
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(m => ({
    key: unescapeXml(/<Key>([\s\S]*?)<\/Key>/.exec(m[1])?.[1] ?? ''),
    size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0),
    lastModified: /<LastModified>([^<]+)<\/LastModified>/.exec(m[1])?.[1] ?? '',
  })).filter(o => o.key)
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
  const next = truncated ? unescapeXml(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '') || null : null
  return { objects, next }
}
