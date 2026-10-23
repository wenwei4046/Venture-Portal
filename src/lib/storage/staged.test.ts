import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { dropStaged, dropStagedIn, formFile, formFiles } from './staged'
import { stagedRefText } from './staging'

// The server's half of a file sent ahead of its Server Action (2026-10-24): what a form sent, the File itself or a
// staged one read back under the action's own client.
const ME = '0e2f8a7c-1b3d-4e5f-8a9b-0c1d2e3f4a5b'
const KEY = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const PATH = `${ME}/${KEY}/slip.pdf`
const BYTES = new Uint8Array([37, 80, 68, 70, 45, 49])

/** The action's client: `file_objects` rows the caller may read, and the bucket's files. */
function fakeDb(rows: Record<string, number>, files: Record<string, Uint8Array>) {
  const removed: string[][] = []
  const reads: string[] = []
  const db = {
    from: (table: string) => {
      const eqs: Record<string, unknown> = {}
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => {
          eqs[c] = v
          return b
        },
        maybeSingle: async () => {
          expect(table).toBe('file_objects')
          expect(eqs.bucket_id).toBe('uploads')
          const size = rows[String(eqs.name)]
          return { data: size === undefined ? null : { metadata: { size, mimetype: 'application/pdf' } }, error: null }
        },
      }
      return b
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          expect(bucket).toBe('uploads')
          reads.push(path)
          const bytes = files[path]
          return bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null } : { data: null, error: { message: 'Object not found' } }
        },
        remove: vi.fn(async (paths: string[]) => {
          expect(bucket).toBe('uploads')
          removed.push(paths)
          return { data: [], error: null }
        }),
      }),
    },
  }
  return { db: db as unknown as SupabaseClient, removed, reads }
}

const line = (name = 'slip.pdf', path = PATH) => stagedRefText({ staged: path, name, type: 'application/pdf', size: 6 })

describe('what a form sent', () => {
  it('a File from an older page answers as it did', async () => {
    const { db, reads } = fakeDb({}, {})
    const form = new FormData()
    form.set('file', new File([BYTES], 'Slip.pdf', { type: 'application/pdf' }))
    const read = await formFile(db, form, 'file')
    if (!read.ok || !read.file) throw new Error('no file')
    expect([read.file.name, read.file.type, read.file.size, read.file.staged]).toEqual(['Slip.pdf', 'application/pdf', 6, null])
    expect(await read.file.bytes()).toEqual(BYTES)
    expect(await read.file.text()).toBe('%PDF-1')
    expect(reads).toEqual([])
  })

  it('a staged file is read back from the sender’s folder: its size from its row, its bytes from the bucket', async () => {
    const { db, reads } = fakeDb({ [PATH]: 6 }, { [PATH]: BYTES })
    const form = new FormData()
    form.set('file', line('Slip — Oct.pdf'))
    const read = await formFile(db, form, 'file')
    if (!read.ok || !read.file) throw new Error('no file')
    expect([read.file.name, read.file.type, read.file.size, read.file.staged]).toEqual(['Slip — Oct.pdf', 'application/pdf', 6, PATH])
    expect(reads).toEqual([])
    expect(await read.file.bytes()).toEqual(BYTES)
    expect(reads).toEqual([PATH])
  })

  it('one that never arrived, or is not this sender’s to read, stops the action in words', async () => {
    const { db } = fakeDb({}, {})
    const form = new FormData()
    form.set('file', line('Slip.pdf'))
    expect(await formFile(db, form, 'file')).toEqual({ ok: false, reason: 'Slip.pdf did not arrive. Attach it again.' })
  })

  it('bytes that are not what its row says are refused, never half kept', async () => {
    const { db } = fakeDb({ [PATH]: 9 }, { [PATH]: BYTES })
    const form = new FormData()
    form.set('file', line())
    const read = await formFile(db, form, 'file')
    if (!read.ok || !read.file) throw new Error('no file')
    await expect(read.file.bytes()).rejects.toThrow('slip.pdf did not arrive whole. Attach it again.')
  })

  it('several, in order; an empty File kept for its action to name; anything else in the field is no file', async () => {
    const other = `${ME}/${'1'.repeat(8)}-1111-4111-8111-${'1'.repeat(12)}/b.pdf`
    const { db } = fakeDb({ [PATH]: 6, [other]: 6 }, {})
    const form = new FormData()
    form.append('files', line('a.pdf'))
    form.append('files', 'a note')
    form.append('files', new File([], 'empty.pdf'))
    form.append('files', line('b.pdf', other))
    const read = await formFiles(db, form, 'files')
    if (!read.ok) throw new Error(read.reason)
    expect(read.files.map(f => [f.name, f.size, f.staged])).toEqual([['a.pdf', 6, PATH], ['empty.pdf', 0, null], ['b.pdf', 6, other]])
    expect(await formFile(db, new FormData(), 'files')).toEqual({ ok: true, file: null })
  })
})

describe('taking the staged copies away', () => {
  it('only the staged ones, once their action is done', async () => {
    const { db, removed } = fakeDb({ [PATH]: 6 }, {})
    const form = new FormData()
    form.append('files', line())
    form.append('files', new File([BYTES], 'old.pdf'))
    const read = await formFiles(db, form, 'files')
    if (!read.ok) throw new Error(read.reason)
    await dropStaged(db, [...read.files, null])
    expect(removed).toEqual([[PATH]])
    await dropStaged(db, [read.files[1]])
    expect(removed).toHaveLength(1)
  })

  it('every one a refused form names, whatever its field', async () => {
    const { db, removed } = fakeDb({}, {})
    const form = new FormData()
    form.set('description', 'Rent')
    form.set('attachment_0', line())
    form.set('attachment_1', new File([BYTES], 'old.pdf'))
    await dropStagedIn(db, form)
    expect(removed).toEqual([[PATH]])
  })
})
