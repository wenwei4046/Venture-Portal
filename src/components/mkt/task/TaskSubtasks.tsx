'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useRef, useState, useTransition } from 'react'
import { addMktSubtask, deliverMktSubtask, removeMktSubtask, reviewMktSubtask } from '@/lib/marketing/actions'
import { shortDay, type MktDelivery, type MktDeliveryFile } from '@/lib/marketing/board'
import { LIB_MAX_BYTES, SUB_MAX_FILES, subtaskPath } from '@/lib/marketing/library'
import { sizeText, subtaskView, type MktTaskPage, type SubtaskRow, type TaskViewer, type Tone } from '@/lib/marketing/task'
import type { PickPerson } from '@/lib/marketing/tasks'
import { officeTime } from '@/lib/office-time'
import { fileRoute } from '@/lib/storage/browser'
import { createClient } from '@/lib/supabase/client'
import s from './task.module.css'
import u from './subtasks.module.css'

// A stage's subtasks (`Task Page.dc.html`, ②b-2c): the list under the stage rail — each subtask, whom it is with, its
// deadline, where it stands, and for the stage's owner Review delivery and Take back; ✂️ Split into subtasks (somebody
// on Marketing's roster, a deadline on or before the stage's, one deliverable); the red line once a delivery has been
// returned three times; and, for its assignee, the delivery — files uploaded (to the bucket, ≤ 2 GB each), links, a
// note. Every answer comes back with the task as it now stands.

const TONE: Record<Tone, string> = { red: s.red, waiting: s.waiting, done: s.done, draft: s.draft }
const isLink = (v: string) => /^https?:\/\/\S+$/i.test(v.trim())

interface Draft {
  note: string
  links: { url: string; label: string }[]
  linkDraft: string
  /** The last version's files, sent again unless taken off. */
  keep: MktDeliveryFile[]
  /** Picked here, sent to the bucket when the delivery goes. */
  picked: File[]
}

const draftOf = (d: MktDelivery | null): Draft => ({ note: d?.note ?? '', links: d?.links ?? [], linkDraft: '', keep: d?.files ?? [], picked: [] })

export default function TaskSubtasks({ part, page, can, people = [], onPage, say }: {
  /** The list (under the stage rail, with its dialogs) or the viewer's own deliveries (in the page's body). */
  part: 'list' | 'deliver'
  page: MktTaskPage
  can: TaskViewer
  /** Whom ✂️ Split offers — the roster with a login, not the viewer, with what is on their plate. */
  people?: PickPerson[]
  onPage: (next: MktTaskPage | null) => void
  say: (text: string) => void
}) {
  const [pending, start] = useTransition()
  const [modal, setModal] = useState<{ kind: 'split' } | { kind: 'review'; id: string } | null>(null)
  const [split, setSplit] = useState<{ who: string | null; due: string; deliv: string }>({ who: null, due: '', deliv: '' })
  const [reason, setReason] = useState('')
  const [asking, setAsking] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [sending, setSending] = useState<string | null>(null)
  const pickers = useRef<Record<string, HTMLInputElement | null>>({})

  const v = subtaskView(page, can)
  if (!v || (part === 'deliver' && !v.rows.some(r => r.mine))) return null
  const today = page.today
  const mine = v.rows.filter(r => r.mine)
  const draft = (r: SubtaskRow) => drafts[r.id] ?? draftOf(r.delivery)
  const edit = (r: SubtaskRow, patch: Partial<Draft>) => setDrafts(d => ({ ...d, [r.id]: { ...(d[r.id] ?? draftOf(r.delivery)), ...patch } }))

  // ── ✂️ Split into subtasks ──
  const dueBad = !!split.due && !!v.stageDue && split.due > v.stageDue
  const splitOk = !!split.who && !!split.due && split.due >= today && !dueBad && !!split.deliv.trim()
  const openSplit = () => {
    setSplit({ who: null, due: v.stageDue && v.stageDue >= today ? v.stageDue : today, deliv: '' })
    setModal({ kind: 'split' })
  }
  const create = () =>
    start(async () => {
      if (!split.who) return
      const r = await addMktSubtask(page.project.id, split.deliv.trim(), split.who, split.due)
      if (!r.ok) return say(r.reason)
      setModal(null)
      onPage(r.page)
      say(`Subtask sent to ${people.find(p => p.id === split.who)?.first ?? 'them'}`)
    })

  // ── Review delivery ──
  const reviewing = modal?.kind === 'review' ? v.rows.find(r => r.id === modal.id) ?? null : null
  const review = (approve: boolean) =>
    start(async () => {
      if (!reviewing) return
      const r = await reviewMktSubtask(page.project.id, reviewing.id, approve, approve ? undefined : reason.trim())
      if (!r.ok) return say(r.reason)
      setModal(null)
      setReason('')
      onPage(r.page)
      say(approve ? `Approved · ${reviewing.title}` : `Returned to ${reviewing.who}`)
    })

  const takeBack = (r: SubtaskRow) =>
    start(async () => {
      const res = await removeMktSubtask(page.project.id, r.id)
      setAsking(null)
      if (!res.ok) return say(res.reason)
      onPage(res.page)
      say(`Taken back · ${r.title}`)
    })

  // ── The assignee's delivery: the picked files to the bucket first, then the delivery; refused — taken back ──
  const pick = (r: SubtaskRow, list: FileList | null) => {
    if (!list?.length) return
    const d = draft(r)
    const room = SUB_MAX_FILES - d.keep.length - d.picked.length
    const ok = Array.from(list).filter(f => {
      if (f.size > LIB_MAX_BYTES) say(`${f.name} is over 2 GB — add it as a link.`)
      return f.size <= LIB_MAX_BYTES
    })
    if (ok.length > room) say(`Ten files at most in one delivery.`)
    edit(r, { picked: [...d.picked, ...ok.slice(0, Math.max(0, room))] })
    const el = pickers.current[r.id]
    if (el) el.value = ''
  }
  const addLink = (r: SubtaskRow) => {
    const d = draft(r)
    const url = d.linkDraft.trim()
    if (!isLink(url)) return say('A link starts with https://')
    edit(r, { links: [...d.links, { url, label: '' }], linkDraft: '' })
  }
  const deliver = (r: SubtaskRow) =>
    start(async () => {
      const d = draft(r)
      const db = createClient() as unknown as SupabaseClient
      const sent: { path: string; name: string }[] = []
      for (const [k, f] of d.picked.entries()) {
        setSending(`Uploading ${k + 1} of ${d.picked.length} · ${f.name}`)
        const path = subtaskPath(f.name, crypto.randomUUID())
        const put = await db.storage.from('marketing').upload(path, f, { contentType: f.type || undefined })
        if (put.error) {
          setSending(null)
          if (sent.length) await db.storage.from('marketing').remove(sent.map(x => x.path))
          return say(put.error.message || `${f.name} could not be uploaded.`)
        }
        sent.push({ path, name: f.name })
      }
      setSending(null)
      const files = [...d.keep.map(f => ({ path: f.path, name: f.name })), ...sent]
      const res = await deliverMktSubtask(page.project.id, r.id, d.note, d.links, files)
      if (!res.ok) {
        if (sent.length) await db.storage.from('marketing').remove(sent.map(x => x.path))
        return say(res.reason)
      }
      setDrafts(cur => {
        const next = { ...cur }
        delete next[r.id]
        return next
      })
      onPage(res.page)
      say(`Delivered · ${nameOfOwner(page)} reviews it next`)
    })

  const deliveryBox = (r: SubtaskRow) => {
    const d = draft(r)
    const count = d.keep.length + d.picked.length
    const something = count > 0 || d.links.length > 0 || !!d.note.trim()
    const nextV = (r.delivery?.v ?? 0) + 1
    return (
      <div key={`deliver:${r.id}`} className={u.deliver} aria-label={`Deliver ${r.title}`} role="group" style={{ marginBottom: 16 }}>
        <div className={u.deliverHead}>
          <span className={u.deliverTitle}>📤 {r.title}</span>
          {r.due ? <span className={u.rowDue}>{r.due}</span> : null}
          <span className={`${s.pill} ${TONE[r.tone]}`}><span className={s.pillDot} aria-hidden="true" />{r.label}</span>
        </div>
        {r.returned ? <div className={u.returned}>Returned: &ldquo;{r.returned}&rdquo;</div> : null}
        <div className={s.f}>
          <span className={s.fLabel}>Files</span>
          {count ? (
            <div className={s.files}>
              {d.keep.map(f => (
                <span key={f.path} className={s.fileChip}>
                  <a href={fileRoute('marketing', f.path)} target="_blank" rel="noreferrer" className={s.libLink}>📎 <span>{f.name}</span></a>
                  <span className={s.libMeta}>{sizeText(f.size)}</span>
                  <button type="button" className={s.fileX} aria-label={`Remove ${f.name}`} disabled={pending} onClick={() => edit(r, { keep: d.keep.filter(x => x.path !== f.path) })}>×</button>
                </span>
              ))}
              {d.picked.map((f, k) => (
                <span key={`${f.name}:${k}`} className={s.fileChip}>
                  📎 <span>{f.name}</span>
                  <span className={s.libMeta}>{sizeText(f.size)}</span>
                  <button type="button" className={s.fileX} aria-label={`Remove ${f.name}`} disabled={pending} onClick={() => edit(r, { picked: d.picked.filter((_, j) => j !== k) })}>×</button>
                </span>
              ))}
            </div>
          ) : null}
          {count < SUB_MAX_FILES ? (
            <>
              <button type="button" className={u.drop} disabled={pending} onClick={() => pickers.current[r.id]?.click()}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(r, e.dataTransfer.files) }}>
                <span className={u.dropIcon} aria-hidden="true">⬆</span>
                <span className={u.dropText}>Drop what you made here</span>
                <span className={u.dropHint}>Any file · up to 2 GB</span>
              </button>
              <input ref={el => { pickers.current[r.id] = el }} type="file" multiple hidden aria-label={`Upload files for ${r.title}`} onChange={e => pick(r, e.target.files)} />
            </>
          ) : null}
        </div>
        <div className={s.f}>
          <span className={s.fLabel}>Links</span>
          {d.links.length ? (
            <div className={s.files}>
              {d.links.map((l, k) => (
                <span key={`${l.url}${k}`} className={s.fileChip}>
                  <a href={l.url} target="_blank" rel="noreferrer" className={s.libLink}>🔗 <span>{l.label || l.url}</span></a>
                  <button type="button" className={s.fileX} aria-label="Remove link" disabled={pending} onClick={() => edit(r, { links: d.links.filter((_, j) => j !== k) })}>×</button>
                </span>
              ))}
            </div>
          ) : null}
          <div className={s.linkAdd}>
            <input className={`${s.fInput} ${s.linkInput}`} type="url" value={d.linkDraft} placeholder="https://… (Drive, Canva …)"
              aria-label={`A link for ${r.title}`} onChange={e => edit(r, { linkDraft: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(r) } }} />
            <button type="button" className={s.dashBtn} disabled={!d.linkDraft.trim()} onClick={() => addLink(r)}>+ Add link</button>
          </div>
        </div>
        <div className={s.f}>
          <span className={s.fLabel}>Note</span>
          <textarea className={s.fArea} rows={2} maxLength={1000} value={d.note} aria-label={`A note for ${r.title}`}
            placeholder="What changed, what to look at" onChange={e => edit(r, { note: e.target.value })} />
        </div>
        <div className={u.deliverBtns}>
          {sending ? <span className={u.sending} role="status">{sending}</span> : null}
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={pending || !something} onClick={() => deliver(r)}>Deliver v{nextV}</button>
        </div>
      </div>
    )
  }

  if (part === 'deliver') return <>{mine.map(r => deliveryBox(r))}</>

  return (
    <>
      {v.alert ? (
        <div className={u.alert} role="alert">
          <span className={u.alertDot} aria-hidden="true" />
          <span className={u.alertText}><strong>{v.alert.text}</strong>{v.alert.tail ? ` ${v.alert.tail}` : ''}</span>
        </div>
      ) : null}
      <div className={u.wrap} style={{ marginTop: v.alert ? 14 : 0 }}>
        <div className={u.head}>
          <span className={u.headText}>Subtasks · {v.stage}</span>
          {v.canSplit ? <button type="button" className={u.split} disabled={pending} onClick={openSplit}>✂️ Split into subtasks</button> : null}
        </div>
        {v.rows.map(r => (
          <div key={r.id} className={`${u.row}${r.red ? ` ${u.rowRed}` : ''}`}>
            <span className={u.rowTitle} title={r.title}>{r.title}</span>
            <span className={u.rowWho}>→ {r.who}</span>
            {r.due ? <span className={u.rowDue}>{r.due}</span> : null}
            <span className={`${s.pill} ${TONE[r.tone]}`}><span className={s.pillDot} aria-hidden="true" />{r.label}</span>
            {r.canReview ? (
              <button type="button" className={u.review} disabled={pending} onClick={() => { setReason(''); setModal({ kind: 'review', id: r.id }) }}>Review delivery</button>
            ) : null}
            {r.canRemove ? (
              asking === r.id ? (
                <span className={u.ask}>
                  Take it back?
                  <button type="button" className={u.askYes} disabled={pending} onClick={() => takeBack(r)}>Take back</button>
                  <button type="button" className={u.askNo} disabled={pending} onClick={() => setAsking(null)}>Keep</button>
                </span>
              ) : (
                <button type="button" className={u.takeBack} disabled={pending} onClick={() => setAsking(r.id)}>Take back</button>
              )
            ) : null}
          </div>
        ))}
      </div>

      {modal?.kind === 'split' ? (
        <div className={s.scrim} onClick={() => !pending && setModal(null)}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label="Split into subtasks" onClick={e => e.stopPropagation()}>
            <div>
              <div className={s.dialogTitle}>Split into subtasks</div>
              <div className={s.dialogSub}>{v.stage}{v.stageDue ? ` · stage deadline ${shortDay(v.stageDue)}` : ''}</div>
            </div>
            <div className={u.group}>
              <div className={u.label}>Assignee</div>
              <div className={u.people} role="radiogroup" aria-label="Assignee">
                {people.map(p => (
                  <button key={p.id} type="button" role="radio" aria-checked={split.who === p.id} className={`${u.person}${split.who === p.id ? ` ${u.personOn}` : ''}`}
                    onClick={() => setSplit(x => ({ ...x, who: p.id }))}>
                    <span className={u.radio} aria-hidden="true" />
                    <span className={u.initial} aria-hidden="true">{(p.first[0] ?? '?').toUpperCase()}</span>
                    <span className={u.personName}>{p.first}</span>
                    <span className={u.personHint}>· {p.hint}</span>
                  </button>
                ))}
                {!people.length ? <span className={s.noFiles}>Nobody else on the roster has a login yet</span> : null}
              </div>
            </div>
            <div className={u.pair}>
              <label className={u.group}>
                <span className={u.label}>Deadline</span>
                <input type="date" className={`${u.input}${dueBad ? ` ${u.inputBad}` : ''}`} value={split.due} min={today || undefined} max={v.stageDue ?? undefined}
                  onChange={e => setSplit(x => ({ ...x, due: e.target.value }))} />
              </label>
              <label className={u.group}>
                <span className={u.label}>Deliverable</span>
                <input className={u.input} value={split.deliv} maxLength={120} placeholder="e.g. Price-tag motion graphics" onChange={e => setSplit(x => ({ ...x, deliv: e.target.value }))} />
              </label>
            </div>
            {dueBad && v.stageDue ? <div className={u.bad}>Must be on or before {shortDay(v.stageDue)} — the {v.stage} stage deadline.</div> : null}
            <div className={s.dialogBtns}>
              <button type="button" className={s.dialogBtn} disabled={pending} onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className={`${s.dialogBtn} ${s.dialogOk}`} disabled={pending || !splitOk} onClick={create}>Create subtask</button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewing ? (
        <div className={s.scrim} onClick={() => !pending && setModal(null)}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label="Review delivery" onClick={e => e.stopPropagation()}>
            <div>
              <div className={s.dialogTitle}>Review delivery</div>
              <div className={s.dialogSub}>{reviewing.title} · from {reviewing.who}{reviewing.delivery ? ` · v${reviewing.delivery.v}` : ''}</div>
            </div>
            {reviewing.delivery?.files.map(f => (
              <a key={f.path} className={u.delivered} href={fileRoute('marketing', f.path, f.name)} target="_blank" rel="noreferrer">
                <span aria-hidden="true">📎</span>
                <span className={u.deliveredName}>{f.name}</span>
                <span className={u.deliveredMeta}>{sizeText(f.size)} · from {reviewing.who}{reviewing.delivery?.at ? ` · ${officeTime(reviewing.delivery.at).format('D MMM')}` : ''}</span>
              </a>
            ))}
            {reviewing.delivery?.links.map((l, k) => (
              <a key={`${l.url}${k}`} className={u.delivered} href={l.url} target="_blank" rel="noreferrer">
                <span aria-hidden="true">🔗</span>
                <span className={u.deliveredName}>{l.label || l.url}</span>
              </a>
            ))}
            {reviewing.delivery?.note ? <div className={u.deliveredNote}>{reviewing.delivery.note}</div> : null}
            <div className={u.group}>
              <div className={u.label}>Reason (required to return)</div>
              <textarea className={s.dialogArea} value={reason} maxLength={1000} placeholder="What needs to change?" onChange={e => setReason(e.target.value)} />
            </div>
            <div className={s.dialogBtns}>
              <button type="button" className={`${s.dialogBtn} ${u.dialogDanger}`} disabled={pending || !reason.trim()} onClick={() => review(false)}>Return</button>
              <button type="button" className={`${s.dialogBtn} ${s.dialogOk}`} disabled={pending} onClick={() => review(true)}>Approve</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** Whom a delivery goes to: the stage's owner. */
function nameOfOwner(page: MktTaskPage): string {
  const cur = page.stages[page.project.cur]
  const p = cur ? page.team.find(x => x.id === cur.owner) : null
  return p ? p.first || p.full : 'the stage’s owner'
}
