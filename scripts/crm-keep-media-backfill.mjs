// One-off backfill (2026-11-10, the owner: "Yes, copy on arrival"; mig 20261110140000_crm_keep_in_media must be applied first).
// Copies every customer Messenger attachment still at Meta's signed address (its `oe=` not passed) into the private bucket
// crm-media and records it — THE SAME CODE the webhooks and the hourly sweep run (src/lib/member/crm-media-keep.ts ›
// keepOne, over the same storage wrapper, src/lib/storage/server.ts). WhatsApp files of the last 7 days are added with
// --whatsapp (the hourly sweep takes those anyway); older WhatsApp ids are gone at Meta and cannot be copied.
//
//   node --env-file=.env.local scripts/crm-keep-media-backfill.mjs            # dry run: counts only
//   node --env-file=.env.local scripts/crm-keep-media-backfill.mjs --apply    # copy them
//   node --env-file=.env.local scripts/crm-keep-media-backfill.mjs --apply --whatsapp
//   node scripts/crm-keep-media-backfill.mjs --check-import                   # only proves the TypeScript loads
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, the R2_* keys and (for --whatsapp) META_SYSTEM_USER_TOKEN.
// Prints message ids and counts only — never an address or a token. Run by a person, never by CI.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('../', import.meta.url)
// Load the app's TypeScript as Node 24 strips its types: `@/` is src/, an import without an extension is its .ts, and
// 'server-only' (a guard for Next's bundler) is nothing here.
register('data:text/javascript,' + encodeURIComponent(`
  import { existsSync } from 'node:fs'
  import { fileURLToPath } from 'node:url'
  const SRC = ${JSON.stringify(new URL('src/', ROOT).href)}
  const withExt = href => { for (const ext of ['', '.ts', '.tsx', '/index.ts']) { const u = href + ext; try { if (existsSync(fileURLToPath(u)) && !u.endsWith('/')) return u } catch {} } return null }
  export async function resolve(spec, ctx, next) {
    if (spec === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true }
    if (spec.startsWith('@/')) { const u = withExt(SRC + spec.slice(2)); if (u) return { url: u, shortCircuit: true } }
    if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:') && ctx.parentURL.includes('/src/')) {
      const u = withExt(new URL(spec, ctx.parentURL).href); if (u) return { url: u, shortCircuit: true }
    }
    return next(spec, ctx)
  }
`), pathToFileURL('./'))

const args = new Set(process.argv.slice(2))
const keep = await import(new URL('src/lib/member/crm-media-keep.ts', ROOT).href)
const media = await import(new URL('src/lib/whatsapp/media.ts', ROOT).href)
const storage = await import(new URL('src/lib/storage/server.ts', ROOT).href)
if (args.has('--check-import')) {
  console.log('crm-keep-media-backfill: the TypeScript loads —', typeof keep.keepOne, typeof storage.withFileStorage, typeof media.messengerExpiresAt)
  process.exit(0)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (node --env-file=.env.local …).'); process.exit(1) }
const { createClient } = await import('@supabase/supabase-js')
const db = storage.withFileStorage(createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }))
const token = process.env.META_SYSTEM_USER_TOKEN?.trim()
const apply = args.has('--apply')
const withWhatsApp = args.has('--whatsapp')

// Every customer message with a Meta file and no copy yet, a page of 1,000 at a time (PostgREST stops at 1,000).
async function waiting() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('crm_messages')
      .select('id, contact_id, media_id, media_url, media_mime, sent_at')
      .eq('direction', 'in').is('media_path', null).or('media_id.not.is.null,media_url.not.is.null')
      .order('sent_at', { ascending: false }).range(from, from + 999)
    if (error) throw new Error(`crm_messages could not be read (${error.code ?? 'error'})`)
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}

const now = Date.now()
const all = await waiting()
const messenger = all.filter(r => r.media_url && !media.goneAtMeta(r, now))
const whatsapp = all.filter(r => !r.media_url && r.media_id && !media.goneAtMeta(r, now))
const lost = all.length - messenger.length - whatsapp.length
console.log(`Customer files with no copy: ${all.length} — Messenger still at Meta ${messenger.length}, WhatsApp under 7 days ${whatsapp.length}, gone at Meta ${lost}.`)
const todo = [...messenger, ...(withWhatsApp ? whatsapp : [])]
if (!apply) {
  console.log(`Dry run: --apply would copy ${todo.length}${withWhatsApp ? '' : ' (add --whatsapp for the WhatsApp ones; the hourly sweep takes them anyway)'}.`)
  process.exit(0)
}
if (withWhatsApp && whatsapp.length && !token) { console.error('META_SYSTEM_USER_TOKEN is needed for --whatsapp.'); process.exit(1) }

let kept = 0
for (const r of todo) {
  const ok = await keep.keepOne(db, { id: r.id, contactId: r.contact_id, mediaId: r.media_url ? null : r.media_id, mediaUrl: r.media_url, mime: r.media_mime }, { token })
  if (ok) kept++
  console.log(ok ? 'kept' : 'not kept', r.id)
}
console.log(`Kept ${kept} of ${todo.length}. What was not kept is said above by message id ([crm-media keep] gives why).`)
