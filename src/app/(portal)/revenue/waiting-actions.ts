'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireActionOn, requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { signedFormKind, signedFormRefusal, waitingAddDetail, waitingAddInputFrom, waitingAddRefusal } from '@/lib/commission/waiting-add'
import {
  FORM_KINDS,
  cleanedFields,
  formFromRow,
  templateContentType,
  templateObjectPath,
  templateRefusal,
  waitingFormRefusal,
  type MemberFormKind,
  type WaitingField,
  type WaitingForm,
} from '@/lib/commission/waiting-form'
import { loadMemberForm } from './_lib/waiting-form'

/**
 * Sales Groups › Waiting list's writes (2026-10-10, the HR revamp): the form
 * (Form settings, Upload form) and Fail. Each is the member back office's own
 * RPC (mig 20261010140000), which asks `member_is_manager` again — so the
 * gate here is the one Member services and Rules › Capacity ask.
 *
 * The Replacement list has the same Form settings and Upload form since
 * 2026-10-11 (round 2's README 18.5): its own versions, through
 * `member_save_replacement_form` (mig 20261011130000), which asks the same.
 *
 * Transfer is People Management's (`team/people/waiting-transfer-actions.ts`):
 * it files an employee.
 *
 * "+" (2026-10-11) puts somebody straight onto the list: `addToWaitingList`,
 * the page's own action gate (Member services · Edit) and the same key.
 *
 * The uploaded form's right-click menu (2026-10-14): View (`viewFormTemplate`)
 * and Remove (`removeFormTemplate` — the next version without the file, then
 * the file out of the bucket), under the same key as Upload form.
 *
 * Refusals come back as `{ ok: false, reason }`: a thrown message never
 * reaches the browser in production.
 */

export type WaitingFormOutcome = { ok: true; form: WaitingForm } | { ok: false; reason: string }
export type WaitingOutcome = { ok: true } | { ok: false; reason: string }

const BUCKET = 'member-forms'
const NO_ACCESS = 'The waiting list needs HR request management access.'
const NO_ACCESS_REPLACEMENT = 'The replacement list needs HR request management access.'

async function manages(): Promise<boolean> {
  const user = await requireAuth()
  return user.permissions.includes('member_requests_manage')
}

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** The database's refusal in words: its own sentence (22023), or what went wrong. */
function refusal(error: PostgrestError, fallback: string, kind: MemberFormKind = 'waiting'): string {
  if (error.code === '42501') return kind === 'replacement' ? NO_ACCESS_REPLACEMENT : NO_ACCESS
  if (error.code === '22023' || error.code === 'P0001') return error.message
  return fallback
}

function revalidateWaiting() {
  revalidatePath('/revenue', 'layout')
  revalidatePath('/member-admin')
  revalidatePath('/member')
}

async function saveVersion(
  supabase: SupabaseClient,
  kind: MemberFormKind,
  fields: WaitingField[],
  requireUpload: boolean,
  templatePath: string | null,
  templateName: string,
): Promise<WaitingFormOutcome> {
  const args = {
    p_fields: fields,
    p_require_upload: requireUpload,
    p_template_path: templatePath,
    p_template_name: templateName,
  }
  const { data, error } =
    kind === 'replacement'
      ? await supabase.rpc('member_save_replacement_form', args)
      : await supabase.rpc('member_save_waiting_form', args)
  if (error) return { ok: false, reason: refusal(error, 'The form could not be saved. Please try again.', kind) }
  const form = formFromRow(data, kind)
  if (!form) return { ok: false, reason: 'The form was saved, but could not be read back. Reload the page.' }
  revalidateWaiting()
  return { ok: true, form }
}

type FormDraft = { fields: WaitingField[]; requireUpload: boolean; useBuiltForm: boolean }

async function saveForm(kind: MemberFormKind, draft: FormDraft): Promise<WaitingFormOutcome> {
  if (!(await manages())) return { ok: false, reason: kind === 'replacement' ? NO_ACCESS_REPLACEMENT : NO_ACCESS }
  const fields = cleanedFields(draft.fields)
  const refused = waitingFormRefusal(fields, kind)
  if (refused) return { ok: false, reason: refused }
  const current = await loadMemberForm(kind)
  if (!current.ok) return current
  const keep = !draft.useBuiltForm && current.form.templatePath !== null
  return saveVersion(
    await client(),
    kind,
    fields,
    draft.requireUpload === true,
    keep ? current.form.templatePath : null,
    keep ? current.form.templateName : FORM_KINDS[kind].formName,
  )
}

/**
 * Form settings' Save as vN: the questions and "Members must upload the
 * signed form". The application form goes with them as it is — HR's upload,
 * unless `useBuiltForm` drops it for the form built from the questions.
 */
export async function saveWaitingForm(draft: FormDraft): Promise<WaitingFormOutcome> {
  return saveForm('waiting', draft)
}

/** The Replacement list's Form settings — the same, its own versions. */
export async function saveReplacementForm(draft: FormDraft): Promise<WaitingFormOutcome> {
  return saveForm('replacement', draft)
}

async function uploadTemplate(kind: MemberFormKind, formData: FormData): Promise<WaitingFormOutcome> {
  if (!(await manages())) return { ok: false, reason: kind === 'replacement' ? NO_ACCESS_REPLACEMENT : NO_ACCESS }
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, reason: 'Choose a file to upload.' }
  const refused = templateRefusal(file)
  if (refused) return { ok: false, reason: refused }
  const current = await loadMemberForm(kind)
  if (!current.ok) return current

  const supabase = await client()
  const path = templateObjectPath(file.name, randomUUID())
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: templateContentType(file.name) ?? undefined, upsert: false })
  if (upErr) return { ok: false, reason: `The form could not be uploaded: ${upErr.message}` }

  const saved = await saveVersion(supabase, kind, current.form.fields, current.form.requireUpload, path, file.name.trim().slice(0, 160))
  if (!saved.ok) await supabase.storage.from(BUCKET).remove([path]).then(() => undefined, () => undefined)
  return saved
}

/**
 * Upload form: HR's own application form becomes the one members download,
 * as a new version of the form (the questions unchanged). The file goes into
 * the private `member-forms` bucket under the uploader's own session — the
 * bucket's policy asks `member_is_manager` too. Each upload keeps a folder of
 * its own, so an older version still opens the file it was saved with.
 */
export async function uploadWaitingFormTemplate(formData: FormData): Promise<WaitingFormOutcome> {
  return uploadTemplate('waiting', formData)
}

/** The Replacement list's Upload form — the same bucket, its own versions. */
export async function uploadReplacementFormTemplate(formData: FormData): Promise<WaitingFormOutcome> {
  return uploadTemplate('replacement', formData)
}

export type FormFileLink = { ok: true; url: string; name: string } | { ok: false; reason: string }

async function templateLink(kind: MemberFormKind, view = false): Promise<FormFileLink> {
  if (!(await manages())) return { ok: false, reason: kind === 'replacement' ? NO_ACCESS_REPLACEMENT : NO_ACCESS }
  const current = await loadMemberForm(kind)
  if (!current.ok) return current
  if (!current.form.templatePath) return { ok: false, reason: 'No form has been uploaded — the built form is the one members download.' }
  // A download hands the file over under its name; a view opens it where it is, for five minutes.
  const { data, error } = await (await client()).storage
    .from(BUCKET)
    .createSignedUrl(current.form.templatePath, view ? 300 : 60, view ? undefined : { download: current.form.templateName })
  if (error || !data) return { ok: false, reason: 'The form could not be opened. Please try again.' }
  return { ok: true, url: data.signedUrl, name: current.form.templateName }
}

/** Download of HR's uploaded form: a link that works for a minute. */
export async function waitingFormTemplateLink(): Promise<FormFileLink> {
  return templateLink('waiting')
}

export async function replacementFormTemplateLink(): Promise<FormFileLink> {
  return templateLink('replacement')
}

const isFormKind = (kind: unknown): kind is MemberFormKind => kind === 'waiting' || kind === 'replacement'

/**
 * View, on the uploaded form's right-click menu (2026-10-14, the user: "right
 * click 然后按 view"): a link that opens the file itself, not a download — the
 * page draws it.
 */
export async function viewFormTemplate(kind: MemberFormKind): Promise<FormFileLink> {
  if (!isFormKind(kind)) return { ok: false, reason: 'Reload the page and try again.' }
  return templateLink(kind, true)
}

export type RemoveFormOutcome = { ok: true; form: WaitingForm; fileDeleted: boolean } | { ok: false; reason: string }

/**
 * Remove, on the same menu (the user: "如果我 upload 错的话，我需要 remove 掉",
 * and the file with it — "连档案一起删掉"): the next version of the form
 * without HR's file, so members download the form built from the questions
 * again; then the file itself leaves the bucket under this session (mig
 * 20261014244500: a manager deletes a template no form uses now). `path` is
 * the file the page showed — when the form has changed since, nothing is done.
 */
export async function removeFormTemplate(kind: MemberFormKind, path: string): Promise<RemoveFormOutcome> {
  if (!isFormKind(kind) || typeof path !== 'string' || !path) return { ok: false, reason: 'Reload the page and try again.' }
  if (!(await manages())) return { ok: false, reason: kind === 'replacement' ? NO_ACCESS_REPLACEMENT : NO_ACCESS }
  const current = await loadMemberForm(kind)
  if (!current.ok) return current
  if (current.form.templatePath !== path) {
    return {
      ok: false,
      reason: current.form.templatePath
        ? 'Another form was uploaded in the meantime. Reload the page.'
        : 'This form has been removed already. Reload the page.',
    }
  }
  const supabase = await client()
  const saved = await saveVersion(supabase, kind, current.form.fields, current.form.requireUpload, null, FORM_KINDS[kind].formName)
  if (!saved.ok) return saved
  // The Storage API answers a refused delete with nothing deleted, not an error.
  const { data, error } = await supabase.storage.from(BUCKET).remove([path])
  return { ok: true, form: saved.form, fileDeleted: !error && (data?.length ?? 0) > 0 }
}

export type WaitingAddOutcome = { ok: true; requestNo: string | null } | { ok: false; reason: string }

/**
 * "+" (2026-10-11, the user: "我点击「加」了过后，我可以直接加人进去这个 waiting list
 * 里面"): somebody straight onto this sub-department's waiting list — at the
 * end, as if accepted now — through `member_waiting_add` (mig 20261011230000),
 * which asks Member services · Edit and `member_is_manager` again.
 *
 * `formData`: `input` (the window's fields as JSON) and, when attached,
 * `signedForm`. A signed form is looked at byte by byte (the member app's
 * rule) and goes where a member's does: the add keeps the request a draft,
 * the file is uploaded into the adder's own folder of it under this session
 * (the bucket's own policy), and `member_waiting_add_form` finds it there,
 * attests it and puts the request on the list. Each press is its own add.
 */
export async function addToWaitingList(formData: FormData): Promise<WaitingAddOutcome> {
  const user = await requireActionOn('/revenue/[sub]/hierarchy', 'member', 'manage')
  if (!user.permissions.includes('member_requests_manage')) return { ok: false, reason: NO_ACCESS }

  let raw: unknown = null
  try {
    raw = JSON.parse(String(formData.get('input') ?? ''))
  } catch {
    raw = null
  }
  const input = waitingAddInputFrom(raw)
  if (!input) return { ok: false, reason: 'Reload the page and try again.' }

  const file = formData.get('signedForm')
  const attached = file instanceof File && file.size > 0
  const form = await loadMemberForm('waiting')
  if (!form.ok) return form
  const refused = waitingAddRefusal(input, form.form, attached)
  if (refused) return { ok: false, reason: refused }

  let signed: { name: string; hash: string; bytes: Uint8Array; mime: string; extension: string } | null = null
  if (attached) {
    const tooBig = signedFormRefusal(file)
    if (tooBig) return { ok: false, reason: tooBig }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = signedFormKind(bytes, file.type)
    if (!kind) return { ok: false, reason: 'The signed form must be a PDF, PNG or JPG file.' }
    signed = { name: file.name.trim() || `Signed form.${kind.extension}`, hash: createHash('sha256').update(bytes).digest('hex'), bytes, ...kind }
  }

  const supabase = await client()
  const { data, error } = await supabase.rpc('member_waiting_add', {
    p_sub: input.subDepartmentId,
    p_staff: input.submittedBy,
    p_detail: waitingAddDetail(input, form.form, signed),
    p_idempotency: randomUUID(),
    p_with_form: signed !== null,
  })
  if (error) return { ok: false, reason: refusal(error, 'They could not be added to the waiting list. Please try again.') }
  const added = (data ?? {}) as { id?: unknown; requestNo?: unknown; status?: unknown; userId?: unknown }
  if (typeof added.id !== 'string') return { ok: false, reason: 'They were added, but the answer could not be read. Reload the page.' }

  let requestNo = typeof added.requestNo === 'string' ? added.requestNo : null
  if (signed && added.status === 'draft') {
    const path = `${typeof added.userId === 'string' ? added.userId : user.id}/${added.id}/${randomUUID()}.${signed.extension}`
    const upload = await supabase.storage.from('member-invoices').upload(path, signed.bytes, { contentType: signed.mime, upsert: false })
    if (upload.error) return { ok: false, reason: `The signed form could not be uploaded: ${upload.error.message}` }
    const done = await supabase.rpc('member_waiting_add_form', { p_request: added.id, p_path: path })
    if (done.error) {
      await supabase.storage.from('member-invoices').remove([path]).then(() => undefined, () => undefined)
      return { ok: false, reason: refusal(done.error, 'The signed form could not be kept. Please try again.') }
    }
    const finished = (done.data ?? {}) as { requestNo?: unknown }
    requestNo = typeof finished.requestNo === 'string' ? finished.requestNo : null
  }

  revalidateWaiting()
  return { ok: true, requestNo }
}

/** Fail: they didn't come when called — off the waiting list, and the next moves up. */
export async function failWaitingApplicant(requestId: string): Promise<WaitingOutcome> {
  if (!(await manages())) return { ok: false, reason: NO_ACCESS }
  const { error } = await (await client()).rpc('member_fail_waiting', { p_request: requestId, p_note: null })
  if (error) return { ok: false, reason: refusal(error, 'The applicant could not be taken off the list. Please try again.') }
  revalidateWaiting()
  return { ok: true }
}
