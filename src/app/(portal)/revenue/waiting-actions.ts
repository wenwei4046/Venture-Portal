'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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

async function templateLink(kind: MemberFormKind): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!(await manages())) return { ok: false, reason: kind === 'replacement' ? NO_ACCESS_REPLACEMENT : NO_ACCESS }
  const current = await loadMemberForm(kind)
  if (!current.ok) return current
  if (!current.form.templatePath) return { ok: false, reason: 'No form has been uploaded — the built form is the one members download.' }
  const { data, error } = await (await client()).storage
    .from(BUCKET)
    .createSignedUrl(current.form.templatePath, 60, { download: current.form.templateName })
  if (error || !data) return { ok: false, reason: 'The form could not be opened. Please try again.' }
  return { ok: true, url: data.signedUrl }
}

/** Download of HR's uploaded form: a link that works for a minute. */
export async function waitingFormTemplateLink(): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  return templateLink('waiting')
}

export async function replacementFormTemplateLink(): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  return templateLink('replacement')
}

/** Fail: they didn't come when called — off the waiting list, and the next moves up. */
export async function failWaitingApplicant(requestId: string): Promise<WaitingOutcome> {
  if (!(await manages())) return { ok: false, reason: NO_ACCESS }
  const { error } = await (await client()).rpc('member_fail_waiting', { p_request: requestId, p_note: null })
  if (error) return { ok: false, reason: refusal(error, 'The applicant could not be taken off the list. Please try again.') }
  revalidateWaiting()
  return { ok: true }
}
