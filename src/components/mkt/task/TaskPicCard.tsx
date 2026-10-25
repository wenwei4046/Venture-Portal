'use client'

import { useEffect, useRef, useState } from 'react'
import { ACCEPT_HOURS, workingHours } from '@/lib/marketing/board'
import { linkUrl, whatsappUrl, type MinutesEdit } from '@/lib/marketing/project'
import { picWho } from '@/lib/marketing/task-minutes'
import { picMessage, picWaiting, trailTime, type MktTaskPage, type TaskPicMinutes } from '@/lib/marketing/task'
import p from '../project/project.module.css'
import s from './task.module.css'

// The PIC approving a task's minutes (②a-4 — the user's answers 52, 53), on the task's page above them, as a product
// project's Meeting and side cards have it: the PIC's name and WhatsApp (a second PIC on their own link), what is still
// missing, *Generate tracking link* — its owner's or a manager's — then each PIC's link to copy or share on WhatsApp, how
// long they have been silent (red after 4 working hours), *Resend* after the changes they asked for, the manager's
// *Start before approval…* with its reason, and once answered whose approval it was.

export default function TaskPicCard({ page, pm, edit, readOnly, sends, manage, problems, tally, pending, onChange, onSend, onResend, onOverride, say }: {
  page: MktTaskPage
  pm: TaskPicMinutes
  /** The PICs as typed — saved with the minutes. */
  edit: MinutesEdit
  readOnly: boolean
  /** Its owner, or a manager: sends and resends. */
  sends: boolean
  /** Marketing · Manage: starts before approval. */
  manage: boolean
  problems: string[]
  tally: { done: number; total: number }
  pending: boolean
  onChange: (next: Partial<Pick<MinutesEdit, 'pic' | 'whatsapp' | 'pic2' | 'whatsapp2'>>) => void
  onSend: () => void
  onResend: () => void
  /** Answers whether it started, so the dialog closes only then. */
  onOverride: (reason: string) => Promise<boolean>
  say: (words: string) => void
}) {
  const [second, setSecond] = useState(() => !!edit.pic2)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  // How long the PIC has been silent, only once in the browser (the server's clock and the browser's differ).
  const [now, setNow] = useState<Date | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    setOrigin(window.location.origin)
    setNow(new Date())
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [pm.sentAt, pm.status])

  const both = !!page.minutes?.template.rules.picAll && !!edit.pic2.trim()
  const waiting = pm.status === 'waiting_pic' || pm.status === 'changes'
  const complete = tally.done >= tally.total
  const title = page.project.title
  // Once the work is under way the PIC approves its stages on the same link (②a-5): the message names the one ready.
  const stage = picWaiting(page)
  // Each PIC their own link (the user's answer 29), shared with them on WhatsApp.
  const links = [
    { key: 'pic', who: edit.pic.trim(), code: pm.link, whatsapp: edit.whatsapp },
    { key: 'pic2', who: edit.pic2.trim(), code: edit.pic2.trim() ? pm.link2 : null, whatsapp: edit.whatsapp2 },
  ].flatMap(l => {
    if (!l.code || pm.status === 'minutes') return []
    const url = linkUrl(origin, l.code)
    return [{ ...l, url, wa: whatsappUrl(l.whatsapp, stage ? picMessage(l.who, title, url, stage)
      : `Hi ${l.who || 'there'}, the minutes of our meeting for ${title} — please review and approve: ${url}`) }]
  })
  const halfway = pm.status === 'waiting_pic' && both && pm.ok
    ? pm.ok['1'] && !pm.ok['2'] ? `${pm.ok['1'].name || pm.pic} approved · waiting for ${pm.pic2}`
      : pm.ok['2'] && !pm.ok['1'] ? `${pm.ok['2'].name || pm.pic2} approved · waiting for ${pm.pic || 'the PIC'}` : null
    : null

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 2000)
    } catch {
      say('Copy it from the box')
    }
  }
  const start = async () => {
    if (await onOverride(reason.trim())) {
      setAsking(false)
      setReason('')
    }
  }

  return (
    <div className={s.picCard} aria-label="PIC approval">
      <div className={s.picHead}>
        <span className={p.cardTitle}>PIC approval</span>
        <span className={s.picWho}>{picWho({ pic: edit.pic, pic2: edit.pic2 }, both)}</span>
      </div>
      <div className={s.picFields}>
        <label className={p.field}>
          <span className={p.fieldLabel}>PIC name<span className={p.marks}><span title="Required">⭐</span><span title="The PIC sees it on the link">👁</span></span></span>
          <input className={p.input} value={edit.pic} maxLength={80} readOnly={readOnly} onChange={e => onChange({ pic: e.target.value })} />
        </label>
        <label className={p.field}>
          <span className={p.fieldLabel}>PIC WhatsApp<span className={p.marks}><span title="Required">⭐</span><span title="Internal only — the PIC never sees it">🔒</span></span></span>
          <input className={`${p.input} ${p.mono}`} value={edit.whatsapp} maxLength={40} inputMode="tel" placeholder="+60 1X-XXX XXXX" readOnly={readOnly}
            onChange={e => onChange({ whatsapp: e.target.value })} />
        </label>
        {second || edit.pic2 ? (
          <>
            <label className={p.field}>
              <span className={p.fieldLabel}>Second PIC<span className={p.marks}><span title="The PICs see it on the link">👁</span></span></span>
              <input className={p.input} value={edit.pic2} maxLength={80} readOnly={readOnly} onChange={e => onChange({ pic2: e.target.value })} />
            </label>
            <label className={p.field}>
              <span className={p.fieldLabel}>Second PIC WhatsApp<span className={p.marks}>{edit.pic2.trim() ? <span title="Required">⭐</span> : null}<span title="Internal only — the PIC never sees it">🔒</span></span></span>
              <input className={`${p.input} ${p.mono}`} value={edit.whatsapp2} maxLength={40} inputMode="tel" placeholder="+60 1X-XXX XXXX" readOnly={readOnly}
                onChange={e => onChange({ whatsapp2: e.target.value })} />
            </label>
          </>
        ) : !readOnly ? (
          <button type="button" className={`${p.textBtn} ${p.addPic}`} onClick={() => setSecond(true)}>+ Second PIC</button>
        ) : null}
      </div>

      {pm.status === 'minutes' ? (
        <div className={s.picSend}>
          <div className={p.reqRow}>
            <span className={p.reqLabel}>Required</span>
            <span className={`${p.reqCount}${complete ? ` ${p.reqDone}` : ''}`}>{tally.done}/{tally.total}</span>
          </div>
          <div className={p.bar}>
            <div className={`${p.barFill}${complete ? ` ${p.barDone}` : ''}`} style={{ width: `${tally.total ? Math.round((tally.done / tally.total) * 100) : 100}%` }} />
          </div>
          {sends ? (
            <>
              <div className={p.sendWrap}>
                <button type="button" className={p.primary} disabled={pending || problems.length > 0} onClick={onSend}>Generate tracking link</button>
                {problems.length ? (
                  <div className={p.tip} role="tooltip">
                    <div className={p.tipHead}>Still missing</div>
                    {problems.map(x => <div key={x}>• {x}</div>)}
                  </div>
                ) : null}
              </div>
              {problems.length ? <div className={p.left}>{problems.length} left</div> : null}
            </>
          ) : null}
        </div>
      ) : null}

      {links.length ? (
        <div className={p.linkBox}>
          {links.map(l => (
            <div key={l.key} className={p.linkOne}>
              {links.length > 1 ? <div className={p.linkWho}>{l.who || 'The PIC'}</div> : null}
              <div className={p.linkUrl}><span>{l.url}</span></div>
              <div className={p.linkBtns}>
                <button type="button" className={p.ghost} onClick={() => void copy(l.url)}>{copied === l.url ? 'Copied ✓' : 'Copy link'}</button>
                {l.wa ? <a className={`${p.ghost} ${p.ghostWide}`} href={l.wa} target="_blank" rel="noreferrer">Share via WhatsApp</a> : null}
              </div>
            </div>
          ))}
          {pm.status === 'waiting_pic' && pm.sentAt ? (() => {
            // No reply after 4 working hours: red (the user's answer 2, the PIC's wait as a stage's).
            const hours = now ? workingHours(pm.sentAt, now, new Set()) : 0
            return hours >= ACCEPT_HOURS
              ? <div className={`${p.wait} ${p.waitLate}`}>Sent {trailTime(pm.sentAt)}{halfway ? '' : ' · no reply'} · {Math.floor(hours)} working hours</div>
              : <div className={p.wait}>Sent {trailTime(pm.sentAt)}</div>
          })() : null}
          {halfway ? <div className={p.wait}>{halfway}</div> : null}
          {pm.status === 'changes' && sends ? (
            <button type="button" className={p.primary} disabled={pending} onClick={onResend}>Resend to {picWho({ pic: edit.pic, pic2: edit.pic2 }, both).replace(/ \(PIC\)$/, '')}</button>
          ) : null}
        </div>
      ) : null}

      {pm.reply?.decision === 'approved' && !waiting ? (
        <div className={p.wait}>Approved by {pm.reply.name || 'the PIC'} via link{pm.reply.at ? ` · ${trailTime(pm.reply.at)}` : ''}</div>
      ) : null}
      {manage && waiting && !pm.override ? (
        <div className={p.overrideRow}>
          <button type="button" className={p.textBtn} disabled={pending} onClick={() => setAsking(true)}>Start before approval…</button>
        </div>
      ) : null}
      {pm.override ? (
        <div className={p.overrideBox}>
          <div className={p.overrideHead}>Override · started before PIC approval</div>
          <div className={p.overrideWhy}>{pm.override.by || 'Somebody'}: “{pm.override.reason}”</div>
        </div>
      ) : null}

      {asking ? (
        <div className={s.scrim} onClick={() => !pending && setAsking(false)}>
          <div className={s.dialog} role="dialog" aria-modal="true" aria-label="Start before PIC approval" onClick={e => e.stopPropagation()}>
            <div>
              <div className={s.dialogTitle}>Start before PIC approval</div>
              <div className={s.dialogSub}>Kept in the audit trail · the work starts today</div>
            </div>
            <label className={p.dialogField}>
              <span className={p.dialogLabel}>Reason (required)</span>
              <textarea className={s.dialogArea} value={reason} maxLength={300} autoFocus placeholder="e.g. Kelvin confirmed by phone; ads must be live by 1 Nov"
                onChange={e => setReason(e.target.value)} />
            </label>
            <div className={s.dialogBtns}>
              <button type="button" className={s.dialogBtn} onClick={() => setAsking(false)} disabled={pending}>Cancel</button>
              <button type="button" className={`${s.dialogBtn} ${s.dialogOk}`} disabled={pending || reason.trim().length < 5} onClick={() => void start()}>Start anyway</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
