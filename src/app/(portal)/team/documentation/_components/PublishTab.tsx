'use client'

import { useMemo, useState } from 'react'
import { Select } from '@/components/hrv/select'
import { flash } from '@/components/hrv/toast'
import { addPublishType, deletePublishType, publishDocumentation, withdrawMemo } from '@/lib/documentation/actions'
import {
  DOC_ACCEPT, ackLine, audienceGroups, audienceLabel, deptLabel, docShortDay, plural, publishRefusal, publishSummary,
  publishedAudience, withdrawnLine, type Documentation,
} from '@/lib/documentation/model'
import { uploadDocumentationFile } from '@/lib/documentation/upload'
import { firstDepartment } from './DocumentsTab'
import SwitchMenu from './SwitchMenu'
import s from './documentation.module.css'

/**
 * Documentation › Publish (README §10, portal-28) — Member services' Publish
 * memo moved here: a Memo, a Letter (and its type) or a type of HR's own; a
 * title, a body, an attachment; the departments it goes to, each opening its
 * people, all ticked — untick who it should not reach. Everyone it reaches
 * must Acknowledge. With a file, Publish goes outlined and "Publish & save"
 * also files the attachment into every recipient's Data center. With
 * Documentation · Edit a published memo can be withdrawn from everyone it
 * reached (2026-10-11 — asks once more, as Delete does); withdrawn ones wait
 * greyed under "Show withdrawn" with what they had reached.
 */
export default function PublishTab({ data, can }: { data: Documentation; can: { create: boolean; edit: boolean } }) {
  const [kind, setKind] = useState('Memo')
  const [letterType, setLetterType] = useState(() => data.letterTypes[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [depts, setDepts] = useState<Set<string>>(() => new Set(firstDepartment(data)))
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // A type just added shows, picked, at once — until the page's next read brings it.
  const [justAdded, setJustAdded] = useState<{ name: string; before: Documentation['publishTypes'] } | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [showGone, setShowGone] = useState(false)
  const live = data.published.filter(m => !m.withdrawnAt)
  const gone = data.published.filter(m => m.withdrawnAt)

  const groups = useMemo(() => audienceGroups(data.departments, data.people, depts, unticked), [data.departments, data.people, depts, unticked])
  const isLetter = kind === 'Letter'
  const pendingType = justAdded && justAdded.before === data.publishTypes ? justAdded.name : null
  const kindLive = data.publishTypes.some(t => t.name === kind) || kind === pendingType ? kind : 'Memo'
  const letterTypeId = data.letterTypes.some(t => t.id === letterType) ? letterType : data.letterTypes[0]?.id ?? ''

  function toggleDept(id: string) {
    const on = !depts.has(id)
    setDepts(prev => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
    // A department picked again comes back with everybody ticked.
    if (on) {
      setUnticked(prev => {
        const next = new Set(prev)
        for (const p of data.people) if (p.departmentId === id) next.delete(p.id)
        return next
      })
    }
    setError('')
  }

  function togglePerson(id: string) {
    setUnticked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setError('')
  }

  function toggleAll(ids: string[], full: boolean) {
    setUnticked(prev => {
      const next = new Set(prev)
      for (const id of ids) {
        if (full) next.add(id)
        else next.delete(id)
      }
      return next
    })
    setError('')
  }

  async function go(save: boolean) {
    if (busy) return
    const refused = publishRefusal({ title, body, hasFile: !!file, groups })
    if (refused) return setError(refused)
    setBusy(true)
    setError('')
    try {
      let attachment = null
      if (file) {
        const up = await uploadDocumentationFile('publish', file)
        if (!up.ok) return setError(up.reason)
        attachment = { path: up.path, fileName: up.fileName, contentType: up.contentType, size: up.size }
      }
      const to = groups.flatMap(g => g.picked.map(p => p.id))
      const res = await publishDocumentation({
        kind: kindLive,
        letterTypeId: isLetter ? letterTypeId || null : null,
        title: title.trim(),
        body: body.trim(),
        attachment,
        departmentIds: groups.filter(g => g.picked.length > 0).map(g => g.department.id),
        staffIds: to,
        audience: audienceLabel(groups),
        save,
      })
      if (!res.ok) return setError(res.reason)
      const typeName = isLetter ? data.letterTypes.find(t => t.id === letterTypeId)?.name ?? 'Letter' : kindLive
      setTitle('')
      setBody('')
      setFile(null)
      flash(`${typeName} published to ${plural(res.recipients, 'person', 'people')}${save ? ' · saved to their Data center' : ''} · acknowledgement required`)
    } catch {
      setError('It could not be published. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function addType(name: string): Promise<boolean> {
    if (data.publishTypes.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      flash(`${name} already exists`)
      return false
    }
    const res = await addPublishType(name)
    if (!res.ok) {
      flash(res.reason)
      return false
    }
    setJustAdded({ name, before: data.publishTypes })
    setKind(name)
    setError('')
    flash(`${name} added`)
    return true
  }

  async function removeType(id: string, name: string) {
    const res = await deletePublishType(id)
    if (res.ok && kind === name) setKind('Memo')
    flash(res.ok ? `${name} removed` : res.reason)
  }

  async function withdraw(id: string) {
    if (armed !== id) return setArmed(id)
    setArmed(null)
    const res = await withdrawMemo(id)
    if (!res.ok) return flash(res.reason)
    const who = res.reached === 1 ? '1 person no longer sees it' : res.reached > 1 ? `${res.reached} people no longer see it` : 'nobody sees it any more'
    flash(`${res.title} withdrawn · ${who}`)
  }

  return (
    <div className={s.pubGrid}>
      {can.create ? (
        <section className={`${s.card} ${s.pubForm}`} aria-labelledby="pub-new">
          <div id="pub-new" className={s.cardTitle}>Publish</div>
          <div className={s.pubTypeRow}>
            <SwitchMenu
              keyWord="Type"
              value={kindLive}
              minWidth={220}
              menuWidth={300}
              label="Type"
              addPlaceholder="New type, e.g. Notice"
              onAdd={addType}
              closeOnAdd
            >
              {close =>
                data.publishTypes.map(t => {
                  const on = kindLive === t.name
                  return (
                    <div key={t.id} className={s.menuRow} aria-current={on ? 'true' : undefined} style={{ gap: 8 }}>
                      <button
                        type="button"
                        className={s.menuPick}
                        role="menuitem"
                        style={{ display: 'block' }}
                        onClick={() => {
                          setKind(t.name)
                          setError('')
                          close()
                        }}
                      >
                        {t.name}
                      </button>
                      {!t.builtin && can.edit ? (
                        <button type="button" className={s.x} title="Delete type" aria-label={`Delete ${t.name}`} onClick={() => void removeType(t.id, t.name)}>
                          ×
                        </button>
                      ) : null}
                    </div>
                  )
                })
              }
            </SwitchMenu>
            {isLetter ? (
              <label className={s.letTypeLabel}>
                <span className={s.fieldLabel}>Letter type</span>
                <Select value={letterTypeId} onChange={e => setLetterType(e.target.value)}>
                  {data.letterTypes.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
                <span className={s.fieldLabel}>Saved under this type in Data center</span>
              </label>
            ) : null}
          </div>
          <label className={s.field}>
            <span className={s.fieldLabel}>Title</span>
            <input
              className={s.input}
              value={title}
              maxLength={200}
              onChange={e => {
                setTitle(e.target.value)
                setError('')
              }}
            />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Body</span>
            <textarea
              className={s.input}
              rows={5}
              value={body}
              maxLength={30000}
              onChange={e => {
                setBody(e.target.value)
                setError('')
              }}
            />
          </label>
          <div className={`${s.fileBox} ${s.attachBox}`}>
            <div className={s.fileBoxText}>
              <div className={s.fileBoxName}>{file ? file.name : 'No file attached'}</div>
              <div className={s.fileBoxHint}>Attach a file to also save it to each recipient&apos;s Data center</div>
            </div>
            {file ? (
              <button type="button" className={s.removeLink} onClick={() => setFile(null)}>Remove</button>
            ) : null}
            <label className={s.fileBtn}>
              {file ? 'Replace' : 'Upload file'}
              <input
                type="file"
                accept={DOC_ACCEPT}
                className={s.hiddenFile}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    setFile(f)
                    setError('')
                  }
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <div className={s.audience}>
            <span className={s.fieldLabel} id="pub-aud">Audience · pick departments, then untick anyone it shouldn&apos;t go to</span>
            <div className={s.pickRow} role="group" aria-labelledby="pub-aud">
              {data.departments.map(d => {
                const on = depts.has(d.id)
                return (
                  <button key={d.id} type="button" className={s.pick} aria-pressed={on} onClick={() => toggleDept(d.id)}>
                    <span aria-hidden="true">{on ? '☑' : '☐'}</span>
                    {deptLabel(d.name)}
                    <span className={s.pickCount}>{d.people}</span>
                  </button>
                )
              })}
            </div>
            {groups.map(g => {
              const full = g.picked.length === g.all.length
              const some = g.picked.length > 0
              return (
                <div key={g.department.id} className={s.block}>
                  <div className={s.blockHead}>
                    <span className={s.blockName}>{deptLabel(g.department.name)}</span>
                    <span className={s.blockLine}>{g.picked.length} of {g.all.length} selected</span>
                    <span className={s.blockSpacer} />
                    <button type="button" className={s.selectAll} aria-pressed={full} onClick={() => toggleAll(g.all.map(p => p.id), full)}>
                      <span className={s.box} data-some={some ? 'true' : undefined} aria-hidden="true">{full ? '✓' : some ? '–' : ''}</span>
                      Select all
                    </button>
                  </div>
                  <div className={s.peopleGrid}>
                    {g.all.map(p => {
                      const on = !unticked.has(p.id)
                      return (
                        <button key={p.id} type="button" className={s.personPick} aria-pressed={on} onClick={() => togglePerson(p.id)}>
                          <span aria-hidden="true">{on ? '☑' : '☐'}</span>
                          <span className={s.personPickName}>{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <div className={s.summary}>
            <span className={s.summaryTick} aria-hidden="true">✓</span>
            {publishSummary(groups)}
          </div>
          <div className={s.pubFoot}>
            <span className={s.err} role={error ? 'alert' : undefined}>{error}</span>
            <button type="button" className={s.publish} data-outlined={file ? 'true' : undefined} onClick={() => void go(false)} disabled={busy}>
              Publish
            </button>
            {file ? (
              <button
                type="button"
                className={s.publish}
                title="Publish, and file the attachment in each recipient's Data center"
                onClick={() => void go(true)}
                disabled={busy}
              >
                Publish &amp; save
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={`${s.card} ${s.published}`} aria-labelledby="pub-list" style={can.create ? undefined : { gridColumn: '1 / -1' }}>
        <div id="pub-list" className={s.publishedTitle}>Published</div>
        {live.map(m => {
          const ack = ackLine(m)
          return (
            <div key={m.id} className={s.pubRow}>
              <div className={s.pubTop}>
                <span className={s.pubTopLeft}>
                  <span className={s.kind}>{m.kind}</span>
                  <span className={s.pubName}>{m.title}</span>
                </span>
                <span className={s.pubWhen}>{docShortDay(m.publishedAt)}</span>
              </div>
              <div className={s.pubAud}>{publishedAudience(m)}</div>
              {m.attachmentName ? (
                <div className={s.pubFile}>
                  {m.attachmentName}
                  {m.saved ? ` · saved to ${plural(m.recipients, 'Data center')}` : ''}
                </div>
              ) : null}
              <div className={s.ackRow}>
                <span className={s.ackTrack}>
                  <span className={s.ackFill} style={{ width: `${ack.pct}%` }} />
                </span>
                <span className={s.ackLine}>{ack.line}</span>
                {can.edit ? (
                  <button
                    type="button"
                    className={`${s.smallBtn} ${s.deleteBtn}`}
                    data-armed={armed === m.id ? 'true' : undefined}
                    aria-label={armed === m.id ? `Confirm withdrawing ${m.title}` : `Withdraw ${m.title}`}
                    onClick={() => void withdraw(m.id)}
                  >
                    {armed === m.id ? 'Confirm withdraw' : 'Withdraw'}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
        {live.length === 0 ? <div className={s.pubEmpty}>Nothing published yet.</div> : null}
        {showGone
          ? gone.map(m => (
              <div key={m.id} className={s.pubRow} data-gone="true">
                <div className={s.pubTop}>
                  <span className={s.pubTopLeft}>
                    <span className={s.kind}>{m.kind}</span>
                    <span className={s.pubName}>{m.title}</span>
                  </span>
                  <span className={s.pubWhen}>{docShortDay(m.publishedAt)}</span>
                </div>
                <div className={s.pubAud}>{publishedAudience(m)}</div>
                {m.attachmentName ? <div className={s.pubFile}>{m.attachmentName}</div> : null}
                <div className={s.deletedMark}>{withdrawnLine(m)}</div>
              </div>
            ))
          : null}
        {gone.length > 0 ? (
          <button type="button" className={`${s.showDeleted} ${s.goneToggle}`} onClick={() => setShowGone(v => !v)}>
            {showGone ? 'Hide' : 'Show'} withdrawn ({gone.length})
          </button>
        ) : null}
      </section>
    </div>
  )
}
