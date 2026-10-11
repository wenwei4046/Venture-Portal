'use client'

import { useRef, useState } from 'react'
import { flash } from '@/components/hrv/toast'
import { TEMPLATE_ACCEPT, templateRefusal, type MemberFormKind, type WaitingForm } from '@/lib/commission/waiting-form'
import { uploadReplacementFormTemplate, uploadWaitingFormTemplate } from '../../../waiting-actions'
import WaitingFormSettings from './WaitingFormSettings'
import w from './waiting.module.css'

// Above the Waiting list (2026-10-10) and, since round 2 (2026-10-11, README
// 18.5), the Replacement list: Upload form — HR's own form, the one Revenue
// members download — and Form settings, the questions they answer. Each list
// has its own versions; the tools are the same.

const WORDS: Readonly<Record<MemberFormKind, { title: string; uploaded: (name: string) => string }>> = {
  waiting: {
    title: 'Upload the application form Revenue members download',
    uploaded: name => `Form uploaded — the waiting-list application is now ${name}`,
  },
  replacement: {
    title: 'Upload the replacement form Revenue members download',
    uploaded: name => `Replacement form uploaded — Revenue members now download ${name}`,
  },
}

export default function MemberFormTools({
  kind,
  form: initialForm,
  subName,
  subOptions,
}: {
  kind: MemberFormKind
  /** The form as saved, or why it could not be read. */
  form: { ok: true; form: WaitingForm } | { ok: false; reason: string }
  subName: string
  /** The department's sub-departments, for the waiting list's built-in "Preferred sub-department". */
  subOptions: string[]
}) {
  // The page's answer is the truth; a save here shows at once, until the
  // page's next answer catches up.
  const [seen, setSeen] = useState(initialForm)
  const [form, setForm] = useState(initialForm.ok ? initialForm.form : null)
  if (seen !== initialForm) {
    setSeen(initialForm)
    setForm(initialForm.ok ? initialForm.form : null)
  }
  const formMissing = initialForm.ok ? null : initialForm.reason

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File | undefined) {
    if (!file || uploading) return
    const refused = templateRefusal(file)
    if (refused) {
      flash(refused)
      return
    }
    setUploading(true)
    const data = new FormData()
    data.set('file', file)
    const done = kind === 'replacement' ? await uploadReplacementFormTemplate(data) : await uploadWaitingFormTemplate(data)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (!done.ok) {
      flash(done.reason)
      return
    }
    setForm(done.form)
    flash(WORDS[kind].uploaded(done.form.templateName))
  }

  const uploaded = form?.templatePath ? form.templateName : null

  return (
    <>
      <div className={w.toolbar}>
        <label
          className={w.upload}
          data-uploaded={uploaded ? 'true' : undefined}
          data-busy={uploading ? 'true' : undefined}
          title={formMissing ?? (uploaded ? 'Click to replace — Revenue members download this file' : WORDS[kind].title)}
        >
          {uploading ? 'Uploading…' : uploaded ? `Form: ${uploaded}` : 'Upload form'}
          <input
            ref={fileRef}
            type="file"
            accept={TEMPLATE_ACCEPT}
            disabled={uploading || form === null}
            onChange={e => void upload(e.target.files?.[0])}
          />
        </label>
        <button type="button" className={w.settings} onClick={() => setSettingsOpen(true)} disabled={form === null} title={formMissing ?? undefined}>
          Form settings
        </button>
      </div>

      {settingsOpen && form ? (
        <WaitingFormSettings
          kind={kind}
          form={form}
          subName={subName}
          subOptions={subOptions}
          onClose={() => setSettingsOpen(false)}
          onSaved={setForm}
        />
      ) : null}
    </>
  )
}
