'use client'

import { useMemo, useRef, useState } from 'react'
import { Select } from '@/components/hrv/select'
import { guestHire } from '@/lib/guest/actions'
import { uploadGuestFile } from '@/lib/guest/upload'
import {
  hireAnswers,
  hireGroups,
  hireMissing,
  hirePlaceholder,
  hirePreview,
  hireValue,
  isChips,
  spansRow,
  type GuestOpen,
  type HireField,
} from '@/lib/guest/model'
import s from './guest.module.css'

/**
 * Request manpower (2026-10-11, README §16 — the prototype's step-by-step
 * form, guest-phone-04): About you → The role → Candidate requirements → Job
 * description (type it, attach a file, or both) → Check and send. The fields
 * are Hiring › Form settings'; the request lands in Hiring › Requests as
 * "Submitted via guest link". From 900px the Preview column shows what HR
 * will see.
 */
export function HireFlow({ code, data, onClosed }: { code: string; data: GuestOpen; onClosed: () => void }) {
  const groups = useMemo(() => hireGroups(data.hireForm, data.subs), [data.hireForm, data.subs])
  const [ans, setAns] = useState<Record<string, string>>({ headcount: '1' })
  const [file, setFile] = useState<{ name: string; path: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [step, setStep] = useState(0)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ id: string; position: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const n = groups.length
  const at = Math.min(step, n)
  const isReview = at === n
  const fileName = file?.name ?? null
  const set = (id: string, v: string) => {
    setAns(a => ({ ...a, [id]: v }))
    setErr('')
  }

  const send = async () => {
    if (busy || uploading) return
    const miss = hireMissing(groups.flatMap(g => g.fields), ans, fileName)
    if (miss) return setErr(miss)
    setBusy(true)
    const res = await guestHire({
      code,
      subsidiary: ans._co ?? '',
      name: (ans._name ?? '').trim(),
      answers: hireAnswers(ans),
      attachmentPath: file?.path ?? null,
      attachmentName: file?.name ?? null,
    })
    setBusy(false)
    if (!res.ok) {
      if (res.reason === 'This link is closed.') return onClosed()
      return setErr(res.reason)
    }
    setDone({ id: res.id, position: res.position })
  }

  const next = () => {
    if (isReview) return void send()
    const miss = hireMissing(groups[at].fields, ans, fileName)
    if (miss) return setErr(miss)
    setStep(at + 1)
    setErr('')
  }

  const attach = async (picked: File | undefined) => {
    if (!picked) return
    setUploading(true)
    setErr('')
    const res = await uploadGuestFile(code, picked)
    setUploading(false)
    if (!res.ok) return setErr(res.reason)
    setFile({ name: res.name, path: res.path })
  }

  const field = (f: HireField) => {
    const v = ans[f.id] ?? ''
    const span = spansRow(f) ? { gridColumn: '1 / -1' } : undefined
    let input: React.ReactNode = null
    if (f.type === 'text') {
      input = <input className={`${s.input} ${s.hInput}`} value={v} placeholder={hirePlaceholder(f)} maxLength={f.id === '_name' ? 80 : 400} onChange={e => set(f.id, e.target.value)} />
    } else if (f.type === 'number') {
      const num = Number(v) || 0
      input = (
        <span className={`${s.stepper} ${s.hStepper}`}>
          <button type="button" className={s.step} aria-label={`${f.label}: one fewer`} onClick={() => set(f.id, String(Math.max(0, num - 1)))}>
            −
          </button>
          <span className={s.hCount}>{v || '0'}</span>
          <button type="button" className={s.step} aria-label={`${f.label}: one more`} onClick={() => set(f.id, String(num + 1))}>
            +
          </button>
        </span>
      )
    } else if (f.type === 'longtext') {
      input = <textarea className={s.textarea} value={v} rows={5} placeholder={hirePlaceholder(f)} maxLength={4000} onChange={e => set(f.id, e.target.value)} />
    } else if (f.type === 'select' && isChips(f)) {
      input = (
        <div className={s.pills}>
          {f.options.map(o => (
            <button key={o.v} type="button" className={s.pill} aria-pressed={v === o.v} onClick={() => set(f.id, v === o.v ? '' : o.v)}>
              {o.label}
            </button>
          ))}
        </div>
      )
    } else if (f.type === 'select') {
      input = (
        <Select bare round={12} className={s.select} value={v} onChange={e => set(f.id, e.target.value)}>
          <option value="">{hirePlaceholder(f)}</option>
          {f.options.map(o => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </Select>
      )
    } else if (f.type === 'range') {
      const [mn = '', mx = ''] = v.split('–')
      input = (
        <span className={s.range}>
          <input className={s.rangeInput} type="number" inputMode="numeric" min={0} value={mn} placeholder="From" aria-label={`${f.label} from`} onChange={e => set(f.id, `${e.target.value}–${mx}`)} />
          <span className={s.rangeTo}>to</span>
          <input className={s.rangeInput} type="number" inputMode="numeric" min={0} value={mx} placeholder="To" aria-label={`${f.label} to`} onChange={e => set(f.id, `${mn}–${e.target.value}`)} />
        </span>
      )
    } else if (f.type === 'file') {
      const ext = fileName ? (fileName.split('.').pop() ?? '').toUpperCase().slice(0, 4) : '+'
      input = (
        <label className={s.fileBox}>
          <span className={s.fileExt}>{ext}</span>
          <span className={s.fileText}>
            <span className={s.fileName}>{fileName ?? 'Upload a file'}</span>
            <span className={s.fileHint}>PDF, Word or a photo</span>
          </span>
          <span className={s.fileBtn}>{uploading ? 'Attaching…' : fileName ? 'Replace' : 'Choose'}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.doc,.docx,image/*"
            style={{ display: 'none' }}
            onChange={e => {
              void attach(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      )
    }
    return (
      <div key={f.id} className={s.hField} style={span}>
        <span className={s.hLabel}>
          {f.label}
          <span className={s.reqMark}>{f.required ? ' *' : ''}</span>
          <span className={s.optMark}>{f.required || f.type === 'file' ? '' : ' · optional'}</span>
        </span>
        {input}
      </div>
    )
  }

  const shown = isReview ? [] : groups.slice(at, at + 1)
  const preview = hirePreview(groups, ans, fileName)

  return (
    <div className={s.cols} data-preview={done ? 'false' : 'true'}>
      <div className={s.main}>
        <div className={s.h1}>Request manpower</div>
        {done ? (
          <div className={`${s.done} ${s.hDone}`}>
            <div className={s.doneHead}>
              <span className={s.doneIcon}>✓</span>
              <div>
                <div className={s.doneTitle}>Sent to HR</div>
                <div className={s.doneRef}>{done.id}</div>
              </div>
            </div>
            <div className={s.doneLine}>
              HR has your request for {done.position}. You will hear back once someone in HR takes it on. Keep the reference above.
            </div>
            <button
              type="button"
              className={s.another}
              onClick={() => {
                setDone(null)
                setAns({ headcount: '1', _co: ans._co ?? '', _name: ans._name ?? '' })
                setFile(null)
                setStep(0)
              }}
            >
              Send another request
            </button>
          </div>
        ) : (
          <>
            <div className={s.steps}>
              <div className={s.stepsTop}>
                <span className={s.stepName}>{isReview ? 'Check and send' : groups[at]?.title}</span>
                <span className={s.stepCount}>
                  Step {at + 1} of {n + 1}
                </span>
              </div>
              <div className={s.stepBars} style={{ gridTemplateColumns: `repeat(${n + 1}, 1fr)` }}>
                {Array.from({ length: n + 1 }, (_, i) => (
                  <span key={i} className={s.stepBar} data-on={i <= at ? 'true' : 'false'} />
                ))}
              </div>
            </div>
            {shown.map(g => (
              <section key={g.key} className={s.hGroup}>
                <div>
                  <div className={s.hTitle}>{g.title}</div>
                  {g.desc ? <div className={s.hDesc}>{g.desc}</div> : null}
                </div>
                <div className={s.hFields}>{g.fields.map(field)}</div>
              </section>
            ))}
            {isReview ? (
              <section className={s.review}>
                {groups.map((g, i) => (
                  <div key={g.key} className={s.rvGroup}>
                    <div className={s.rvHead}>
                      <span className={s.rvTitle}>{g.title}</span>
                      <button type="button" className={s.rvEdit} onClick={() => setStep(i)}>
                        Edit
                      </button>
                    </div>
                    <div className={s.rvRows}>
                      {g.fields.map(f => (
                        <span key={f.id} className={s.rvPair}>
                          <span className={s.rvL}>{f.type === 'file' ? 'Attachment' : f.label}</span>
                          <span className={s.rvV}>{hireValue(f, ans, fileName)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}
            {err ? (
              <div className={s.err} role="alert">
                {err}
              </div>
            ) : null}
            <div className={s.navBtns}>
              {at > 0 ? (
                <button
                  type="button"
                  className={s.backBtn}
                  onClick={() => {
                    setStep(Math.max(0, at - 1))
                    setErr('')
                  }}
                >
                  Back
                </button>
              ) : null}
              <button type="button" className={s.nextBtn} onClick={next} disabled={busy || uploading}>
                {isReview ? 'Send to HR' : at === n - 1 ? 'Review' : 'Next'}
              </button>
            </div>
          </>
        )}
      </div>
      {!done ? (
        <aside className={s.aside} aria-label="Preview">
          <div>
            <div className={s.pvKicker}>Preview</div>
            <div className={s.pvTitle}>Your request</div>
            <div className={s.pvSub}>This is what HR will see</div>
          </div>
          <div className={s.pvProg}>
            <div className={s.pvDone}>
              <span>{preview.done}</span>
            </div>
            <span className={s.pvTrack}>
              <span className={s.pvFill} style={{ width: preview.pct }} />
            </span>
          </div>
          {preview.groups.map(g => (
            <div key={g.title} className={s.pvGroup}>
              <div className={s.pvGroupTitle}>{g.title}</div>
              {g.rows.map(r => (
                <div key={r.l} className={s.pvRow}>
                  <span className={s.pvL}>{r.l}</span>
                  <span className={s.pvV} data-filled={r.filled ? 'true' : 'false'}>
                    {r.v}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </aside>
      ) : null}
    </div>
  )
}
