import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_FIELDS, BUILT_FORM_NAME, REPLACEMENT_BUILTIN_FIELDS, REPLACEMENT_FORM_NAME, type WaitingForm } from '@/lib/commission/waiting-form'

// The uploaded form's right-click menu (2026-10-14, the user: "right click 然后按 view，同时也可以按
// remove。因为如果我 upload 错的话，我需要 remove 掉" — and, asked, the file with it: "连档案一起删掉").
// Remove saves the next version without HR's file, then deletes the file from the bucket; View is a
// link that opens the file where it is. The bucket's delete policy is mig 20261014244500's
// (tests/member-sql/validate-member-forms-remove.mjs).

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), createClient: vi.fn(), rpc: vi.fn(), refresh: vi.fn(), load: vi.fn(),
  bucket: vi.fn(), remove: vi.fn(), sign: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ requireAuth: mocks.auth, requireActionOn: mocks.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }))
vi.mock('./_lib/waiting-form', () => ({ loadMemberForm: mocks.load }))

import { removeFormTemplate, viewFormTemplate, waitingFormTemplateLink } from './waiting-actions'

const PATH = 'templates/0b3fb828-3253-4aa8-899b-eadca6e6aec2/Revenue_Team_Waiting_List_Form_04.09.2026 -2-.docx'
const NAME = 'Revenue_Team_Waiting_List_Form_04.09.2026 (2).docx'
const FIELDS = [...BUILTIN_FIELDS, { id: 'q1', label: 'How did they hear about us', type: 'text' as const, required: false }]
const UPLOADED: WaitingForm = { version: 2, fields: FIELDS, requireUpload: true, templatePath: PATH, templateName: NAME, createdAt: '2026-10-14T10:32:07Z' }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'hr', permissions: ['member_requests_manage'] })
  mocks.bucket.mockReturnValue({ remove: mocks.remove, createSignedUrl: mocks.sign })
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, storage: { from: mocks.bucket } })
  mocks.load.mockResolvedValue({ ok: true, form: UPLOADED })
  // The writer answers the version it saved, as member_waiting_form() reads it.
  mocks.rpc.mockImplementation(async (_fn: string, args: Record<string, unknown>) => ({
    data: { version: 3, fields: args.p_fields, requireUpload: args.p_require_upload, templatePath: args.p_template_path, templateName: args.p_template_name, createdAt: null },
    error: null,
  }))
  mocks.remove.mockResolvedValue({ data: [{ name: PATH }], error: null })
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://files.test/sign/form?token=t' }, error: null })
})

describe('Remove', () => {
  it('saves the next version without the file — the questions and the signed-form rule as they were — then deletes the file', async () => {
    const done = await removeFormTemplate('waiting', PATH)
    expect(done).toEqual({
      ok: true,
      fileDeleted: true,
      form: { version: 3, fields: FIELDS, requireUpload: true, templatePath: null, templateName: BUILT_FORM_NAME, createdAt: null },
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('member_save_waiting_form', {
      p_fields: FIELDS,
      p_require_upload: true,
      p_template_path: null,
      p_template_name: BUILT_FORM_NAME,
    })
    expect(mocks.bucket).toHaveBeenCalledWith('member-forms')
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([PATH])
    // The file goes only once no form names it: the delete policy refuses the form members download.
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.remove.mock.invocationCallOrder[0])
    expect(mocks.refresh).toHaveBeenCalledWith('/revenue', 'layout')
  })

  it('works on the replacement list’s own form', async () => {
    const replacement: WaitingForm = { ...UPLOADED, fields: [...REPLACEMENT_BUILTIN_FIELDS], requireUpload: false }
    mocks.load.mockResolvedValue({ ok: true, form: replacement })
    const done = await removeFormTemplate('replacement', PATH)
    expect(done.ok && done.form.templateName).toBe(REPLACEMENT_FORM_NAME)
    expect(mocks.load).toHaveBeenCalledWith('replacement')
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('member_save_replacement_form', {
      p_fields: [...REPLACEMENT_BUILTIN_FIELDS],
      p_require_upload: false,
      p_template_path: null,
      p_template_name: REPLACEMENT_FORM_NAME,
    })
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith([PATH])
  })

  it('does nothing when the form changed since the page drew it', async () => {
    mocks.load.mockResolvedValue({ ok: true, form: { ...UPLOADED, version: 3, templatePath: 'templates/other/Right form.pdf', templateName: 'Right form.pdf' } })
    expect(await removeFormTemplate('waiting', PATH)).toEqual({ ok: false, reason: 'Another form was uploaded in the meantime. Reload the page.' })
    mocks.load.mockResolvedValue({ ok: true, form: { ...UPLOADED, version: 3, templatePath: null, templateName: BUILT_FORM_NAME } })
    expect(await removeFormTemplate('waiting', PATH)).toEqual({ ok: false, reason: 'This form has been removed already. Reload the page.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('says when the bucket kept the file — the Storage API answers a refused delete with nothing deleted', async () => {
    mocks.remove.mockResolvedValueOnce({ data: [], error: null })
    expect(await removeFormTemplate('waiting', PATH)).toMatchObject({ ok: true, fileDeleted: false })
    mocks.remove.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
    expect(await removeFormTemplate('waiting', PATH)).toMatchObject({ ok: true, fileDeleted: false })
  })

  it('deletes nothing when the save is refused', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'HR management access is required' } })
    expect(await removeFormTemplate('waiting', PATH)).toEqual({ ok: false, reason: 'The waiting list needs HR request management access.' })
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('is refused without HR request management, before the form is read', async () => {
    mocks.auth.mockResolvedValue({ id: 'member', permissions: ['member_requests'] })
    expect(await removeFormTemplate('replacement', PATH)).toEqual({ ok: false, reason: 'The replacement list needs HR request management access.' })
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('refuses a list or a file it does not know', async () => {
    expect(await removeFormTemplate('claims' as never, PATH)).toEqual({ ok: false, reason: 'Reload the page and try again.' })
    expect(await removeFormTemplate('waiting', '')).toEqual({ ok: false, reason: 'Reload the page and try again.' })
    expect(await removeFormTemplate('waiting', 42 as never)).toEqual({ ok: false, reason: 'Reload the page and try again.' })
    expect(mocks.auth).not.toHaveBeenCalled()
  })
})

describe('View', () => {
  it('is a five-minute link that opens the file where it is — not a download', async () => {
    expect(await viewFormTemplate('waiting')).toEqual({ ok: true, url: 'https://files.test/sign/form?token=t', name: NAME })
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(PATH, 300, undefined)
  })

  it('leaves Download as it was: a minute, under the file’s own name', async () => {
    expect(await waitingFormTemplateLink()).toEqual({ ok: true, url: 'https://files.test/sign/form?token=t', name: NAME })
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith(PATH, 60, { download: NAME })
  })

  it('says why when nothing is uploaded, or the list is not known', async () => {
    mocks.load.mockResolvedValue({ ok: true, form: { ...UPLOADED, templatePath: null, templateName: BUILT_FORM_NAME } })
    expect(await viewFormTemplate('waiting')).toEqual({ ok: false, reason: 'No form has been uploaded — the built form is the one members download.' })
    expect(await viewFormTemplate('claims' as never)).toEqual({ ok: false, reason: 'Reload the page and try again.' })
    expect(mocks.sign).not.toHaveBeenCalled()
  })
})
