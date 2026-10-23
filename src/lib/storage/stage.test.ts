import { beforeEach, describe, expect, it, vi } from 'vitest'

// The browser's half of a file sent ahead of its Server Action (2026-10-24): into the sender's own folder of
// `uploads`, then a line in the form in the file's place.
const ME = '0e2f8a7c-1b3d-4e5f-8a9b-0c1d2e3f4a5b'

const client = vi.hoisted(() => ({
  session: { user: { id: '0e2f8a7c-1b3d-4e5f-8a9b-0c1d2e3f4a5b' } } as { user: { id: string } } | null,
  upload: vi.fn(async (..._args: unknown[]) => ({ data: {}, error: null as { message: string } | null })),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: client.session } }) },
    storage: { from: (bucket: string) => ({ upload: (...args: unknown[]) => client.upload(bucket, ...args) }) },
  }),
}))

import { stagedOnce, stageFile, stageFiles, stageInto } from './stage'
import { parseStagedRef } from './staging'

const pdf = (name = 'Slip.pdf', size = 6) => {
  const file = new File([new Uint8Array([37, 80, 68, 70, 45, 49])], name, { type: 'application/pdf' })
  if (size !== 6) Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  client.session = { user: { id: ME } }
  client.upload.mockReset()
  client.upload.mockResolvedValue({ data: {}, error: null })
})

describe('sending a file ahead', () => {
  it('goes into the sender’s own folder, a fresh one each time, as the file says it is', async () => {
    const file = pdf('Slip (Oct).pdf')
    const ref = await stageFile(file)
    expect(ref.staged).toMatch(new RegExp(`^${ME}/[0-9a-f-]{36}/Slip_Oct\\.pdf$`))
    expect([ref.name, ref.type, ref.size]).toEqual(['Slip (Oct).pdf', 'application/pdf', 6])
    expect(client.upload).toHaveBeenCalledWith('uploads', ref.staged, file, { contentType: 'application/pdf', upsert: false })
    expect((await stageFile(file)).staged).not.toBe(ref.staged)
  })

  it('says no in words: past 100 MB, signed out, or the file did not go', async () => {
    await expect(stageFile(pdf('Video.pdf', 100 * 1024 * 1024 + 1))).rejects.toThrow('Video.pdf is over 100 MB.')
    expect(client.upload).not.toHaveBeenCalled()
    client.session = null
    await expect(stageFile(pdf())).rejects.toThrow('Your session has ended. Sign in again.')
    client.session = { user: { id: ME } }
    client.upload.mockResolvedValueOnce({ data: {}, error: { message: 'network' } })
    await expect(stageFile(pdf())).rejects.toThrow('Slip.pdf could not be sent. Check the connection and try again.')
    client.upload.mockResolvedValueOnce({ data: {}, error: { message: 'Read-only while viewing as somebody.' } })
    await expect(stageFile(pdf())).rejects.toThrow('Read-only while viewing as somebody.')
  })

  it('puts each file’s line in the form under its field — none for no file', async () => {
    const form = new FormData()
    await stageInto(form, 'files', [pdf('a.pdf'), pdf('b.pdf')])
    await stageInto(form, 'file', null)
    expect(form.getAll('files').map(v => parseStagedRef(v)?.name)).toEqual(['a.pdf', 'b.pdf'])
    expect(form.has('file')).toBe(false)
  })

  it('turns every file a finished form holds into its line, in place, the rest as it was', async () => {
    const form = new FormData()
    form.set('kind', 'claim')
    form.set('invoice', pdf('Invoice.pdf'))
    form.append('signedForm', pdf('Form.pdf'))
    form.append('signedForm', new File([], 'empty.pdf'))
    form.set('notes', 'Hotel')
    await stageFiles(form)
    expect(form.get('kind')).toBe('claim')
    expect(form.get('notes')).toBe('Hotel')
    expect(parseStagedRef(form.get('invoice'))?.name).toBe('Invoice.pdf')
    expect(form.getAll('signedForm').map(v => (v === '' ? '' : parseStagedRef(v)?.name))).toEqual(['Form.pdf', ''])
    expect([...form.values()].some(v => typeof v !== 'string')).toBe(false)
    expect(client.upload).toHaveBeenCalledTimes(2)
  })

  it('sends a page’s file once for the actions that read it — again after a send that failed', async () => {
    const stage = stagedOnce()
    const advice = pdf('Advice.pdf')
    const first = await stage(advice)
    expect(await stage(advice)).toBe(first)
    expect(client.upload).toHaveBeenCalledTimes(1)
    const other = pdf('Other.pdf')
    expect(parseStagedRef(await stage(other))?.name).toBe('Other.pdf')
    expect(client.upload).toHaveBeenCalledTimes(2)
    client.upload.mockResolvedValueOnce({ data: {}, error: { message: 'network' } })
    const third = pdf('Third.pdf')
    await expect(stage(third)).rejects.toThrow('could not be sent')
    expect(parseStagedRef(await stage(third))?.name).toBe('Third.pdf')
    expect(client.upload).toHaveBeenCalledTimes(4)
  })
})
