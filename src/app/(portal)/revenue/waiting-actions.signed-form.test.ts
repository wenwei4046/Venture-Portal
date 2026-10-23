import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// An applicant's signed form, in their drawer on Sales Groups › Waiting list (2026-10-20, the user: "i want here
// can be view for the letter they submit, then can be upload as well, the file"). Upload looks at the file byte by
// byte, puts it into the uploader's own folder of the request, and has member_waiting_attach_form attest it —
// removing it again when that is refused. View and Download find the file the request names, as Member services'
// View ↗ does. The database's half is mig 20261020130000 (tests/member-sql/validate-waiting-signed-form.mjs).

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), action: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), refresh: vi.fn(),
  bucket: vi.fn(), upload: vi.fn(), remove: vi.fn(), sign: vi.fn(), table: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth, requireActionOn: mocks.action }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('./_lib/waiting-form', () => ({ loadMemberForm: vi.fn() }))

import { signedFormDownload, uploadSignedForm, viewSignedForm } from './waiting-actions'

const HR = '7f3c2a10-1b2c-4d5e-8f90-112233445566'
const JOAN = '0d2e4f60-7a8b-4c9d-8e0f-a1b2c3d4e5f6'
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10]) // %PDF-1.4
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0])
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function sent(file: File | string | null, requestId = JOAN): FormData {
  const data = new FormData()
  data.set('requestId', requestId)
  if (file !== null) data.set('file', file)
  return data
}

/** A table read: every link of the chain hands itself back, `maybeSingle` answers what the test set for the table. */
const answers: Record<string, { data: unknown; error: unknown }> = {}
const asked: Array<{ table: string; calls: Array<[string, unknown[]]> }> = []
function table(name: string) {
  const record = { table: name, calls: [] as Array<[string, unknown[]]> }
  asked.push(record)
  const chain: Record<string, unknown> = {}
  for (const link of ['select', 'eq', 'order', 'limit']) {
    chain[link] = (...args: unknown[]) => {
      record.calls.push([link, args])
      return chain
    }
  }
  chain.maybeSingle = async () => answers[name] ?? { data: null, error: null }
  return chain
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const key of Object.keys(answers)) delete answers[key]
  asked.length = 0
  mocks.auth.mockResolvedValue({ id: HR, permissions: ['member_requests_manage'] })
  mocks.action.mockResolvedValue({ id: HR, permissions: ['member_requests_manage'] })
  mocks.bucket.mockReturnValue({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: mocks.sign })
  mocks.table.mockImplementation(table)
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: mocks.table, storage: { from: mocks.bucket } })
  mocks.upload.mockResolvedValue({ data: { path: 'x' }, error: null })
  mocks.remove.mockResolvedValue({ data: [{ name: 'x' }], error: null })
  mocks.rpc.mockResolvedValue({ data: { name: 'Joan Quek application.pdf', type: 'application/pdf', at: '2026-10-20T06:00:00+00:00', by: 'LI SEAN' }, error: null })
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://files.test/sign/joan?token=t' }, error: null })
})

describe('Upload', () => {
  it('puts the file into the uploader’s own folder of the request, then has the database attest it', async () => {
    const done = await uploadSignedForm(sent(new File([PDF], ' Joan Quek application.pdf', { type: 'application/pdf' })))
    expect(done).toEqual({ ok: true, form: { name: 'Joan Quek application.pdf', type: 'application/pdf', at: '2026-10-20T06:00:00+00:00', by: 'LI SEAN' } })
    // Member services · Edit and the waiting list's key, as "+".
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith('/revenue/[sub]/hierarchy', 'member', 'manage')
    expect(mocks.bucket).toHaveBeenCalledWith('member-invoices')
    const [path, bytes, options] = mocks.upload.mock.calls[0]
    expect(path).toMatch(new RegExp(`^${HR}/${JOAN}/[0-9a-f-]{36}\\.pdf$`))
    expect([...bytes]).toEqual([...PDF])
    expect(options).toEqual({ contentType: 'application/pdf', upsert: false })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('member_waiting_attach_form', {
      p_request: JOAN,
      p_path: path,
      p_name: 'Joan Quek application.pdf',
      p_hash: sha(PDF),
    })
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0])
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledWith('/revenue', 'layout')
  })

  // 2026-10-20, the user: "want word file as well".
  it('takes a Word file too — a .docx kept as Word, whatever the browser called it', async () => {
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0, ...Array.from('word/document.xml', c => c.charCodeAt(0)), 0, 0])
    await uploadSignedForm(sent(new File([docx], 'Joan Quek letter.docx', { type: '' })))
    const [path, , options] = mocks.upload.mock.calls[0]
    expect(path).toMatch(new RegExp(`^${HR}/${JOAN}/[0-9a-f-]{36}\\.docx$`))
    expect(options).toEqual({ contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: false })
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_path: path, p_name: 'Joan Quek letter.docx', p_hash: sha(docx) })
  })

  it('an old .doc too; never one holding macros', async () => {
    const utf16 = (s: string) => Array.from(s).flatMap(c => [c.charCodeAt(0), 0])
    const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
    await uploadSignedForm(sent(new File([new Uint8Array([...OLE, ...utf16('WordDocument')])], 'Joan.doc', { type: 'application/msword' })))
    expect(mocks.upload.mock.calls[0][0]).toMatch(/\.doc$/)
    expect(mocks.upload.mock.calls[0][2].contentType).toBe('application/msword')

    mocks.upload.mockClear()
    const docm = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Array.from('word/document.xml word/vbaProject.bin', c => c.charCodeAt(0))])
    expect(await uploadSignedForm(sent(new File([docm], 'Joan.docm')))).toEqual({
      ok: false,
      reason: 'This Word file holds macros — save it as a plain Word document (.docx) or a PDF, then upload it.',
    })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('names the kind by the bytes, not the name: a picture is kept as a PNG', async () => {
    await uploadSignedForm(sent(new File([PNG], 'Joan', { type: '' })))
    const [path, , options] = mocks.upload.mock.calls[0]
    expect(path).toMatch(/\.png$/)
    expect(options.contentType).toBe('image/png')
    expect(mocks.rpc.mock.calls[0][1].p_name).toBe('Joan')
  })

  it('refuses before anything is uploaded: another kind, an empty file, one over 100 MB, no file', async () => {
    const html = new TextEncoder().encode('<html><body>Joan</body></html>')
    expect(await uploadSignedForm(sent(new File([html], 'Joan.pdf', { type: 'application/pdf' })))).toEqual({
      ok: false,
      reason: 'The signed form must be a PDF, Word, PNG or JPG file.',
    })
    expect(await uploadSignedForm(sent(new File([], 'Joan.pdf')))).toEqual({ ok: false, reason: 'That file is empty — attach the signed form again.' })
    // A File the form holds as it is (no name given to set), so its size may be said without 100 MB of bytes.
    const big = new File([PDF], 'Joan.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 100 * 1024 * 1024 + 1 })
    expect(await uploadSignedForm(sent(big))).toEqual({
      ok: false,
      reason: 'The signed form must be 100 MB or smaller.',
    })
    expect(await uploadSignedForm(sent(null))).toEqual({ ok: false, reason: 'Choose the signed form to upload.' })
    expect(await uploadSignedForm(sent('not a file'))).toEqual({ ok: false, reason: 'Choose the signed form to upload.' })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses a request id that is not one, and anybody without the waiting list’s key', async () => {
    const pdf = () => new File([PDF], 'Joan.pdf', { type: 'application/pdf' })
    expect(await uploadSignedForm(sent(pdf(), 'joan'))).toEqual({ ok: false, reason: 'Reload the page and try again.' })
    mocks.action.mockResolvedValue({ id: HR, permissions: [] })
    expect(await uploadSignedForm(sent(pdf()))).toEqual({ ok: false, reason: 'The waiting list needs HR request management access.' })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('removes the file again when the database refuses it, and says why in its words', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'This applicant is no longer on the waiting list. Reload the page.' } })
    const done = await uploadSignedForm(sent(new File([PDF], 'Joan.pdf', { type: 'application/pdf' })))
    expect(done).toEqual({ ok: false, reason: 'This applicant is no longer on the waiting list. Reload the page.' })
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([mocks.upload.mock.calls[0][0]])
    expect(mocks.refresh).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'HR management access is required' } })
    expect(await uploadSignedForm(sent(new File([PDF], 'Joan.pdf', { type: 'application/pdf' })))).toEqual({
      ok: false,
      reason: 'The waiting list needs HR request management access.',
    })
  })

  it('says when the bucket would not take the file — and asks the database nothing', async () => {
    mocks.upload.mockResolvedValue({ data: null, error: { message: 'Read-only while viewing as somebody — nothing is saved.' } })
    expect(await uploadSignedForm(sent(new File([PDF], 'Joan.pdf', { type: 'application/pdf' })))).toEqual({
      ok: false,
      reason: 'The signed form could not be uploaded: Read-only while viewing as somebody — nothing is saved.',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('View and Download', () => {
  beforeEach(() => {
    answers.member_requests = { data: { kind: 'waiting', detail: { newPerson: 'JOAN QUEK XIAO', signedFormName: 'Joan.pdf', signedFormHash: 'a'.repeat(64) } }, error: null }
    answers.member_request_attachments = { data: { object_path: `${HR}/${JOAN}/f.pdf`, mime_type: 'application/pdf' }, error: null }
  })

  it('opens the file the request names — its latest attestation of that hash — where it is, for five minutes', async () => {
    expect(await viewSignedForm(JOAN)).toEqual({ ok: true, url: 'https://files.test/sign/joan?token=t', name: 'Joan.pdf', type: 'application/pdf' })
    expect(asked.map(a => a.table)).toEqual(['member_requests', 'member_request_attachments'])
    expect(asked[1].calls).toEqual([
      ['select', ['object_path, mime_type']],
      ['eq', ['request_id', JOAN]],
      ['eq', ['content_sha256', 'a'.repeat(64)]],
      ['order', ['created_at', { ascending: false }]],
      ['limit', [1]],
    ])
    expect(mocks.bucket).toHaveBeenCalledWith('member-invoices')
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(`${HR}/${JOAN}/f.pdf`, 300, undefined)
  })

  it('downloads it under its own name, for a minute', async () => {
    expect((await signedFormDownload(JOAN)).ok).toBe(true)
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(`${HR}/${JOAN}/f.pdf`, 60, { download: 'Joan.pdf' })
  })

  it('says there is none when the request names no form, the file is not attested, or it is not a waiting list’s', async () => {
    const none = { ok: false, reason: 'No signed form is on file for them.' }
    answers.member_request_attachments = { data: null, error: null }
    expect(await viewSignedForm(JOAN)).toEqual(none)
    answers.member_requests = { data: { kind: 'waiting', detail: { newPerson: 'JOAN QUEK XIAO' } }, error: null }
    expect(await viewSignedForm(JOAN)).toEqual(none)
    answers.member_requests = { data: { kind: 'replacement', detail: { signedFormName: 'x.pdf', signedFormHash: 'a'.repeat(64) } }, error: null }
    expect(await viewSignedForm(JOAN)).toEqual(none)
    answers.member_requests = { data: null, error: null }
    expect(await signedFormDownload(JOAN)).toEqual(none)
    expect(mocks.sign).not.toHaveBeenCalled()
  })

  it('asks the waiting list’s key, and a request id', async () => {
    expect(await viewSignedForm('joan')).toEqual({ ok: false, reason: 'Reload the page and try again.' })
    mocks.auth.mockResolvedValue({ id: HR, permissions: [] })
    expect(await viewSignedForm(JOAN)).toEqual({ ok: false, reason: 'The waiting list needs HR request management access.' })
    expect(asked).toEqual([])
  })
})
