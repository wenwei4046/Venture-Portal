'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  BUILT_FORM_NAME,
  cleanedFields,
  formFromRow,
  templateContentType,
  templateObjectPath,
  templateRefusal,
  waitingFormRefusal,
  type WaitingField,
  type WaitingForm,
} from '@/lib/commission/waiting-form'
import { loadWaitingForm } from './_lib/waiting-form'

/**
 * Sales Groups › Waiting list's writes (2026-10-10, the HR revamp): the form
 * (Form settings, Upload form) and Fail. Each is the member back office's own
 * RPC (mig 20261010140000), which asks `member_is_manager` again — so the
 * gate here is the one Member services and Rules › Capacity ask.
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

async function manages(): Promise<boolean> {
  const user = await requireAuth()
  return user.permissions.includes('member_requests_manage')
}

async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** The database's refusal in words: its own sentence (22023), or what went wrong. */
function refusal(error: PostgrestError, fallback: string): string {
  if (error.code === '42501') return NO_ACCESS
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
  fields: WaitingField[],
  requireUpload: boolean,
  templatePath: string | null,
  templateName: string,
): Promise<WaitingFormOutcome> {
  const { data, error } = await supabase.rpc('member_save_waiting_form', {
    p_fields: fields,
    p_require_upload: requireUpload,
    p_template_path: templatePath,
    p_template_name: templateName,
  })
  if (error) return { ok: false, reason: refusal(error, 'The form could not be saved. Please try again.') }
  const form = formFromRow(data)
  if (!form) return { ok: false, reason: 'The form was saved, but could not be read back. Reload the page.' }
  revalidateWaiting()
  return { ok: true, form }
}

/**
 * Form settings' Save as vN: the questions and "Members must upload the
 * signed form". The application form goes with them as it is — HR's upload,
 * unless `useBuiltForm` drops it for the form built from the questions.
 */
export async function saveWaitingForm(draft: {
  fields: WaitingField[]
  requireUpload: boolean
  useBuiltForm: boolean
}): Promise<WaitingFormOutcome> {
  if (!(await manages())) return { ok: false, reason: NO_ACCESS }
  const fields = cleanedFields(draft.fields)
  const refused = waitingFormRefusal(fields)
  if (refused) return { ok: false, reason: refused }
  const current = await loadWaitingForm()
  if (!current.ok) return current
  const keep = !draft.useBuiltForm && current.form.templatePath !== null
  return saveVersion(
    await client(),
    fields,
    draft.requireUpload === true,
    keep ? current.form.templatePath : null,
    keep ? current.form.templateName : BUILT_FORM_NAME,
  )
}

/**
 * Upload form: HR's own application form becomes the one members download,
 * as a new version of the form (the questions unchanged). The file goes into
 * the private `member-forms` bucket under the uploader's own session — the
 * bucket's policy asks `member_is_manager` too. Each upload keeps a folder of
 * its own, so an older version still opens the file it was saved with.
 */
export async function uploadWaitingFormTemplate(formData: FormData): Promise<WaitingFormOutcome> {
  if (!(await manages())) return { ok: false, reason: NO_ACCESS }
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, reason: 'Choose a file to upload.' }
  const refused = templateRefusal(file)
  if (refused) return { ok: false, reason: refused }
  const current = await loadWaitingForm()
  if (!current.ok) return current

  const supabase = await client()
  const path = templateObjectPath(file.name, randomUUID())
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: templateContentType(file.name) ?? undefined, upsert: false })
  if (upErr) return { ok: false, reason: `The form could not be uploaded: ${upErr.message}` }

  const saved = await saveVersion(supabase, current.form.fields, current.form.requireUpload, path, file.name.trim().slice(0, 160))
  if (!saved.ok) await supabase.storage.from(BUCKET).remove([path]).then(() => undefined, () => undefined)
  return saved
}

/** Download of HR's uploaded form: a link that works for a minute. */
export async function waitingFormTemplateLink(): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  if (!(await manages())) return { ok: false, reason: NO_ACCESS }
  const current = await loadWaitingForm()
  if (!current.ok) return current
  if (!current.form.templatePath) return { ok: false, reason: 'No form has been uploaded — the built form is the one members download.' }
  const { data, error } = await (await client()).storage
    .from(BUCKET)
    .createSignedUrl(current.form.templatePath, 60, { download: current.form.templateName })
  if (error || !data) return { ok: false, reason: 'The form could not be opened. Please try again.' }
  return { ok: true, url: data.signedUrl }
}

/** Fail: they didn't come when called — off the waiting list, and the next moves up. */
export async function failWaitingApplicant(requestId: string): Promise<WaitingOutcome> {
  if (!(await manages())) return { ok: false, reason: NO_ACCESS }
  const { error } = await (await client()).rpc('member_fail_waiting', { p_request: requestId, p_note: null })
  if (error) return { ok: false, reason: refusal(error, 'The applicant could not be taken off the list. Please try again.') }
  revalidateWaiting()
  return { ok: true }
}
