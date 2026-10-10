'use client'

import { useState } from 'react'
import { SecLabel, Toggle, btn } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { flash } from '@/components/hrv/toast'
import {
  BUILT_FORM_NAME,
  FIELD_TYPES,
  addQuestion,
  applicationFormHtml,
  cleanedFields,
  formChanged,
  moveQuestion,
  typeLabel,
  waitingFormRefusal,
  withOption,
  withType,
  withoutOption,
  type WaitingField,
  type WaitingForm,
} from '@/lib/commission/waiting-form'
import { saveWaitingForm, waitingFormTemplateLink } from '../../../waiting-actions'
import w from './waiting.module.css'

/**
 * Waiting list › Form settings (2026-10-10, the HR revamp): what the Revenue
 * team fills in when they submit a waiting list. The four built-in questions
 * stay required and keep their kind; HR adds its own (Text, Dropdown, Date,
 * Yes / No, Phone), orders them with ▲ ▼, and says whether members must
 * upload the signed form. Save makes the next version — the form members
 * filled in before keeps its own.
 *
 * Mounted only while open, so every opening starts from the saved form.
 */
export default function WaitingFormSettings({
  form,
  subName,
  subOptions,
  onClose,
  onSaved,
}: {
  form: WaitingForm
  subName: string
  /** The department's sub-departments — the built-in "Preferred sub-department" offers them. */
  subOptions: string[]
  onClose: () => void
  onSaved: (form: WaitingForm) => void
}) {
  const [fields, setFields] = useState<WaitingField[]>(() => form.fields.map(f => ({ ...f, ...(f.options ? { options: [...f.options] } : {}) })))
  const [requireUpload, setRequireUpload] = useState(form.requireUpload)
  const [useBuiltForm, setUseBuiltForm] = useState(false)
  const [newOption, setNewOption] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const uploaded = form.templatePath !== null && !useBuiltForm
  const changed = formChanged(form, { fields, requireUpload, useBuiltForm })
  const setField = (i: number, next: WaitingField) => setFields(all => all.map((f, j) => (j === i ? next : f)))

  function addOptionTo(i: number) {
    const f = fields[i]
    const text = newOption[f.id] ?? ''
    if (!text.trim()) return
    setField(i, withOption(f, text))
    setNewOption(all => ({ ...all, [f.id]: '' }))
  }

  async function download() {
    setError(null)
    if (uploaded) {
      const link = await waitingFormTemplateLink()
      if (!link.ok) {
        setError(link.reason)
        return
      }
      clickLink(link.url)
      return
    }
    const html = applicationFormHtml(
      { version: changed ? form.version + 1 : form.version, fields: cleanedFields(fields), templateName: BUILT_FORM_NAME },
      subName,
      subOptions,
    )
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    clickLink(url, BUILT_FORM_NAME)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  async function save() {
    if (busy) return
    // The same form again would only be a copy: nothing is sent.
    if (!changed) {
      flash(`Nothing changed — the form is still v${form.version}`)
      onClose()
      return
    }
    const cleaned = cleanedFields(fields)
    const refused = waitingFormRefusal(cleaned)
    if (refused) {
      setError(refused)
      return
    }
    setBusy(true)
    setError(null)
    const done = await saveWaitingForm({ fields: cleaned, requireUpload, useBuiltForm })
    setBusy(false)
    if (!done.ok) {
      setError(done.reason)
      return
    }
    onSaved(done.form)
    flash(`Waiting-list form saved as v${done.form.version}`)
    onClose()
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      eyebrow={`Waiting list · v${form.version}`}
      title="Form settings"
      sub="What the Revenue team fills in when they submit a waiting list."
      bodyStyle={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}
      footer={
        <>
          {error ? <p className={w.formError} role="alert">{error}</p> : null}
          <button type="button" className={btn('outline')} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`${btn('primary')} ${w.save}`} onClick={save} disabled={busy}>
            {busy ? 'Saving…' : `Save as v${form.version + 1}`}
          </button>
        </>
      }
    >
      <SecLabel>Questions</SecLabel>
      <div className={w.questions}>
        {fields.map((f, i) => {
          const name = f.label.trim() || 'this question'
          return (
            <div key={f.id} className={w.question} role="group" aria-label={f.builtin ? f.label : `Question ${i + 1}`}>
              <div className={w.qRow}>
                <span className={w.arrows}>
                  <button type="button" className={w.arrow} aria-label={`Move ${name} up`} aria-disabled={i === 0 || undefined} onClick={() => setFields(all => moveQuestion(all, i, -1))}>
                    ▲
                  </button>
                  <button type="button" className={w.arrow} aria-label={`Move ${name} down`} aria-disabled={i === fields.length - 1 || undefined} onClick={() => setFields(all => moveQuestion(all, i, 1))}>
                    ▼
                  </button>
                </span>
                {f.builtin ? (
                  <span className={w.builtinLabel}>
                    {f.label}
                    <span className={w.builtinKind}>{typeLabel(f.type)} · built in</span>
                  </span>
                ) : (
                  <input
                    className={w.labelInput}
                    value={f.label}
                    maxLength={120}
                    aria-label={`Question ${i + 1}`}
                    onChange={e => setField(i, { ...f, label: e.target.value })}
                  />
                )}
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.required}
                  aria-label={`${name} required`}
                  className={w.required}
                  disabled={f.builtin}
                  onClick={() => setField(i, { ...f, required: !f.required })}
                >
                  <Toggle on={f.required} />
                  {f.required ? 'Required' : 'Optional'}
                </button>
                {f.builtin ? null : (
                  <button type="button" className={w.remove} title="Remove" aria-label={`Remove ${name}`} onClick={() => setFields(all => all.filter((_, j) => j !== i))}>
                    ×
                  </button>
                )}
              </div>
              {f.builtin ? null : (
                <div className={w.types} role="group" aria-label={`${name} kind`}>
                  {FIELD_TYPES.map(([key, label]) => (
                    <button key={key} type="button" className={w.type} aria-pressed={f.type === key} onClick={() => setField(i, withType(f, key))}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {f.builtin && f.type === 'dropdown' ? (
                <div className={w.builtinOptions}>Options: {subOptions.join(' · ') || '—'} (from the sub-departments)</div>
              ) : null}
              {!f.builtin && f.type === 'dropdown' ? (
                <div className={w.options}>
                  {(f.options ?? []).map((o, k) => (
                    <span key={`${o}-${k}`} className={w.option}>
                      {o}
                      <button type="button" className={w.optionRemove} aria-label={`Remove ${o}`} onClick={() => setField(i, withoutOption(f, k))}>
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className={w.newOption}
                    placeholder="New option"
                    aria-label={`New option for ${name}`}
                    maxLength={80}
                    value={newOption[f.id] ?? ''}
                    onChange={e => setNewOption(all => ({ ...all, [f.id]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addOptionTo(i)
                      }
                    }}
                  />
                  <button type="button" className={w.addOption} onClick={() => addOptionTo(i)}>
                    Add
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
        <button type="button" className={w.addQuestion} onClick={() => setFields(all => addQuestion(all))} disabled={fields.length >= 40}>
          + Add question
        </button>
      </div>

      <SecLabel style={{ marginTop: 12 }}>Application form</SecLabel>
      <div className={w.formCard}>
        <div className={w.formRow}>
          <span className={w.paper} aria-hidden="true" />
          <div className={w.formText}>
            <div className={w.formName}>{uploaded ? form.templateName : BUILT_FORM_NAME}</div>
            <div className={w.formSub}>
              {uploaded ? (
                <>
                  Uploaded on the waiting list · members download this file ·{' '}
                  <button type="button" onClick={() => setUseBuiltForm(true)}>
                    use the built form
                  </button>
                </>
              ) : (
                'Built from the questions above · black and white, prints on A4'
              )}
            </div>
          </div>
          <button type="button" className={`${btn('outlineFrame')} ${w.download}`} onClick={download}>
            Download
          </button>
        </div>
        <button type="button" role="switch" aria-checked={requireUpload} className={w.mustUpload} onClick={() => setRequireUpload(v => !v)}>
          <Toggle on={requireUpload} />
          Members must upload the signed form with the request
        </button>
      </div>
    </Drawer>
  )
}

function clickLink(href: string, download?: string) {
  const a = document.createElement('a')
  a.href = href
  if (download) a.download = download
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
