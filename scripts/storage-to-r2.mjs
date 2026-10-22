// Copies a bucket's files from Supabase Storage to Cloudflare R2 (2026-10-23, the move to R2).
//
//   node --env-file=.env.local scripts/storage-to-r2.mjs --bucket it-requests            # what it would copy
//   node --env-file=.env.local scripts/storage-to-r2.mjs --bucket it-requests --apply    # copy
//   node --env-file=.env.local scripts/storage-to-r2.mjs --all --apply                    # every bucket
//
// Bytes only, and only those R2 does not hold yet: every object Storage lists is read with the service role and put
// at `<bucket>/<name>` in R2 (the private or the public R2 bucket, by file_buckets.public), never over a file already
// there, then read back — its size and its MD5 (both sides' ETag of a one-part upload) must be Storage's. Run it as
// often as you like: a second run copies nothing it already copied. The ROWS (public.file_objects) are written by
// the bucket's move migration, in the same transaction that moves it, from storage.objects itself — so a file's
// owner, time and metadata are Storage's exactly. Run this once before that migration and once right after it (a
// file sent the old way in between is then copied too).
//
// Reads every secret from the environment — never pass one on the command line.
import { createClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const wanted = args.flatMap((a, i) => (a === '--bucket' && args[i + 1] ? [args[i + 1]] : []))
const all = args.includes('--all')
if (!all && wanted.length === 0) {
  console.error('Name a bucket (--bucket <id>, repeatable) or --all.')
  process.exit(2)
}

const need = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BUCKET']
const missing = need.filter(k => !process.env[k]?.trim())
if (missing.length) {
  console.error(`Missing in the environment: ${missing.join(', ')} (run with --env-file=.env.local).`)
  process.exit(2)
}
const env = Object.fromEntries(need.map(k => [k, process.env[k].trim()]))

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' })
const encodeKey = key => key.split('/').map(encodeURIComponent).join('/')
const r2Url = (r2Bucket, key) => `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${r2Bucket}/${encodeKey(key)}`
const md5Of = etag => (etag ?? '').replace(/"/g, '').toLowerCase()
/** A one-part upload's ETag is its MD5; a multipart one's (`<hash>-<parts>`) is not, and is not compared. */
const comparable = md5 => /^[0-9a-f]{32}$/.test(md5)

/** Every object of a bucket, walking its folders (Storage lists one level at a time, folders with no id). */
async function* objectsOf(bucket, prefix = '') {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const entry of data ?? []) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) yield* objectsOf(bucket, name)
      else yield { name, size: Number(entry.metadata?.size ?? 0), type: entry.metadata?.mimetype || 'application/octet-stream', md5: md5Of(entry.metadata?.eTag) }
    }
    if ((data ?? []).length < 1000) break
  }
}

async function head(url) {
  const res = await r2.fetch(url, { method: 'HEAD' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HEAD ${res.status}`)
  return { size: Number(res.headers.get('content-length') ?? -1), md5: md5Of(res.headers.get('etag')) }
}

const { data: bucketRows, error: bucketsError } = await supabase.from('file_buckets').select('id, public, backend')
if (bucketsError) throw new Error(`file_buckets: ${bucketsError.message}`)
const buckets = (bucketRows ?? []).filter(b => all || wanted.includes(b.id))
const unknown = wanted.filter(w => !buckets.some(b => b.id === w))
if (unknown.length) {
  console.error(`No such bucket in file_buckets: ${unknown.join(', ')}`)
  process.exit(2)
}

let failures = 0
for (const bucket of buckets) {
  const r2Bucket = bucket.public ? env.R2_PUBLIC_BUCKET : env.R2_BUCKET
  const tally = { listed: 0, already: 0, copied: 0, wouldCopy: 0, bytes: 0, failed: 0 }
  for await (const object of objectsOf(bucket.id)) {
    tally.listed++
    const url = r2Url(r2Bucket, `${bucket.id}/${object.name}`)
    try {
      const there = await head(url)
      if (there) {
        if (there.size !== object.size || (comparable(object.md5) && comparable(there.md5) && there.md5 !== object.md5)) {
          throw new Error(`R2 already holds a different file (${there.size} B, md5 ${there.md5}; Storage ${object.size} B, md5 ${object.md5})`)
        }
        tally.already++
        continue
      }
      if (!apply) {
        tally.wouldCopy++
        tally.bytes += object.size
        continue
      }
      const { data: blob, error } = await supabase.storage.from(bucket.id).download(object.name)
      if (error || !blob) throw new Error(`download: ${error?.message ?? 'no data'}`)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (bytes.byteLength !== object.size) throw new Error(`downloaded ${bytes.byteLength} B, Storage lists ${object.size} B`)
      const put = await r2.fetch(url, { method: 'PUT', body: bytes, headers: { 'content-type': object.type, 'if-none-match': '*' } })
      if (!put.ok && put.status !== 412) throw new Error(`PUT ${put.status}: ${(await put.text()).slice(0, 200)}`)
      const back = await head(url)
      if (!back || back.size !== object.size || (comparable(object.md5) && back.md5 !== object.md5)) {
        throw new Error(`read back ${back ? `${back.size} B, md5 ${back.md5}` : 'nothing'} — Storage ${object.size} B, md5 ${object.md5}`)
      }
      tally.copied++
      tally.bytes += object.size
    } catch (error) {
      tally.failed++
      failures++
      console.error(`  ✗ ${bucket.id}/${object.name}: ${error.message}`)
    }
  }
  const mb = (tally.bytes / 1048576).toFixed(1)
  console.log(`${bucket.id} (${bucket.backend}, → ${r2Bucket}): ${tally.listed} in Storage · ${tally.already} already in R2 · ${apply ? `${tally.copied} copied` : `${tally.wouldCopy} to copy`} (${mb} MB)${tally.failed ? ` · ${tally.failed} FAILED` : ''}`)
}
if (!apply) console.log('Dry run — nothing copied. Add --apply to copy.')
process.exit(failures ? 1 : 0)
