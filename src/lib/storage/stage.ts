import { createClient } from '@/lib/supabase/client'
import { STAGED_MAX_BYTES, STAGING_BUCKET, stagedPath, stagedRefText, type StagedRef } from './staging'

/**
 * The browser's half of a file sent ahead of its Server Action (lib/storage/staging.ts): the file goes into the
 * sender's own folder of `uploads`, straight to R2 on a link made for it, and the form carries a line naming it.
 * Throws an Error in words a person reads — the page shows it where it showed the action's own.
 */
export async function stageFile(file: File): Promise<StagedRef> {
  const label = file.name || 'That file'
  if (file.size > STAGED_MAX_BYTES) throw new Error(`${label} is over 100 MB.`)
  const db = createClient()
  let owner: string | undefined
  try {
    owner = (await db.auth.getSession()).data.session?.user.id
  } catch {
    owner = undefined
  }
  if (!owner) throw new Error('Your session has ended. Sign in again.')
  const path = stagedPath(owner, crypto.randomUUID(), file.name)
  const { error } = await db.storage.from(STAGING_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) {
    const said = String((error as { message?: unknown }).message ?? '')
    throw new Error(said.startsWith('Read-only') ? said : `${label} could not be sent. Check the connection and try again.`)
  }
  return { staged: path, name: file.name, type: file.type, size: file.size }
}

/**
 * One staged copy of a page's file for the several actions that read it — Invoice Financing reads a bank's advice
 * (Auto-read), then keeps it on the saved financing: the file goes up once, and the action that keeps it takes the
 * staged copy away. A send that failed is not remembered, so the next ask sends again.
 */
export function stagedOnce(): (file: File) => Promise<string> {
  let last: { file: File; line: Promise<string> } | null = null
  return (file: File) => {
    if (last?.file !== file) {
      const sent = { file, line: stageFile(file).then(stagedRefText) }
      sent.line.catch(() => {
        if (last === sent) last = null
      })
      last = sent
    }
    return last.line
  }
}

/**
 * Every file a finished form holds sent ahead, each field then carrying its line in the file's place, in the same
 * order — for a form whose many branches each put their own file in (the Revenue app's requests). An empty file
 * becomes an empty field, which the server reads as no file, as it read the empty file.
 */
export async function stageFiles(form: FormData): Promise<void> {
  const keys = new Set<string>()
  form.forEach((value, key) => {
    if (typeof value !== 'string') keys.add(key)
  })
  for (const key of keys) {
    const lines: string[] = []
    for (const value of form.getAll(key)) {
      lines.push(typeof value === 'string' ? value : value.size > 0 ? stagedRefText(await stageFile(value)) : '')
    }
    form.delete(key)
    for (const line of lines) form.append(key, line)
  }
}

/** Each file sent ahead, and its line added to the form under `field` — in place of the file itself. */
export async function stageInto(form: FormData, field: string, files: File | readonly File[] | null | undefined): Promise<void> {
  const list = files == null ? [] : Array.isArray(files) ? files : [files as File]
  for (const file of list) form.append(field, stagedRefText(await stageFile(file)))
}
