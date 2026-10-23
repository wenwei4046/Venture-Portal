import type { SupabaseClient } from '@supabase/supabase-js'
import { STAGING_BUCKET, parseStagedRef } from './staging'

/**
 * The server's half of a file sent ahead of its Server Action (lib/storage/staging.ts): what a form sent under a
 * field — the File itself (a page loaded before these went ahead), or a staged file read back from the sender's own
 * folder of `uploads`. Both answer the same few things a File did, so an action changes only where its bytes come
 * from. Read under the action's own client: the bucket's policy lets a session see only its own folder, so a line
 * naming somebody else's file finds nothing.
 */
export interface FormFile {
  name: string
  type: string
  size: number
  /** Its name in `uploads` when it was sent ahead; null for a File in the form itself. */
  staged: string | null
  bytes(): Promise<Uint8Array>
  text(): Promise<string>
}

export type FormFilesAnswer = { ok: true; files: FormFile[] } | { ok: false; reason: string }
export type FormFileAnswer = { ok: true; file: FormFile | null } | { ok: false; reason: string }

/** Only `.from()` and `.storage` are asked of the action's client. */
type Client = Pick<SupabaseClient, 'from' | 'storage'>

function fromFile(file: File): FormFile {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    staged: null,
    bytes: async () => new Uint8Array(await file.arrayBuffer()),
    text: () => file.text(),
  }
}

async function readStaged(db: Client, path: string, size: number, name: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(STAGING_BUCKET).download(path)
  if (error || !data) throw new Error(`${name} could not be read. Attach it again.`)
  const bytes = new Uint8Array(await data.arrayBuffer())
  if (bytes.length !== size) throw new Error(`${name} did not arrive whole. Attach it again.`)
  return bytes
}

/** Every file a form sent under `field`, in its order — an empty File too: each action says of it what it always said. */
export async function formFiles(db: Client, form: FormData, field: string): Promise<FormFilesAnswer> {
  const out: FormFile[] = []
  for (const value of form.getAll(field)) {
    if (typeof value !== 'string') {
      out.push(fromFile(value))
      continue
    }
    const ref = parseStagedRef(value)
    if (!ref) continue
    const { data, error } = await db.from('file_objects').select('metadata').eq('bucket_id', STAGING_BUCKET).eq('name', ref.staged).maybeSingle()
    if (error) return { ok: false, reason: 'The files could not be read. Please try again.' }
    const size = Number((data as { metadata?: { size?: unknown } | null } | null)?.metadata?.size)
    if (!data || !Number.isSafeInteger(size)) return { ok: false, reason: `${ref.name} did not arrive. Attach it again.` }
    out.push({
      name: ref.name,
      type: ref.type,
      size,
      staged: ref.staged,
      bytes: () => readStaged(db, ref.staged, size, ref.name),
      text: async () => new TextDecoder().decode(await readStaged(db, ref.staged, size, ref.name)),
    })
  }
  return { ok: true, files: out }
}

/** The one file a form sent under `field`, or null when it sent none. */
export async function formFile(db: Client, form: FormData, field: string): Promise<FormFileAnswer> {
  const read = await formFiles(db, form, field)
  return read.ok ? { ok: true, file: read.files[0] ?? null } : read
}

/** The staged copies taken away once their action is done with them (as far as the sender may; else the sweep). */
export async function dropStaged(db: Client, files: ReadonlyArray<FormFile | null | undefined>): Promise<void> {
  const paths = files.flatMap(f => (f?.staged ? [f.staged] : []))
  if (!paths.length) return
  await Promise.resolve(db.storage.from(STAGING_BUCKET).remove(paths)).then(() => undefined, () => undefined)
}

/** Every staged copy a form names, whatever its field — for an action that refused the whole form. */
export async function dropStagedIn(db: Client, form: FormData): Promise<void> {
  const paths = [...form.values()].flatMap(v => {
    const ref = parseStagedRef(v)
    return ref ? [ref.staged] : []
  })
  if (!paths.length) return
  await Promise.resolve(db.storage.from(STAGING_BUCKET).remove(paths)).then(() => undefined, () => undefined)
}
