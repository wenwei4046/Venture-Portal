'use client'

import { useState } from 'react'
import type { MktSub } from '@/lib/marketing/board'
import { MIN_PASSWORD_LENGTH } from '@/lib/account/password'
import { PASSWORD_CHANGED, useChangePassword, type ChangePassword } from '@/components/account/use-change-password'
import { SWITCH_VIEWS, phoneWhere, type SwitchTarget } from '@/lib/view-switch'
import { QUICK_TITLE_MIN, QUICK_TYPES, quickNote } from '@/lib/mkt-app/model'
import s from './mkt-app.module.css'

// The Marketing app's bottom sheets (`Marketing App iOS + Android.dc.html` › the sheets): ＋ New, a Quick / Recurring
// task, Request changes (a claim's Reject too), the 🔓 handoff's pick — and, the settings card's, Change view, Change
// password and Sign out.

/** ＋ New: the subsidiary (the first five), then ⚡ Quick task, 🔁 Recurring task, 📦 Product project (the manager's). */
export function NewSheet({ subs, sub, onSub, onKind, manager }: {
  subs: MktSub[]
  sub: string | null
  onSub: (code: string) => void
  onKind: (k: 'quick' | 'recurring' | 'product') => void
  manager: boolean
}) {
  const kinds = [
    { key: 'quick' as const, emoji: '⚡', label: 'Quick task', sub: 'A title, a type and its stages', locked: false },
    { key: 'recurring' as const, emoji: '🔁', label: 'Recurring task', sub: 'Every day, week or month', locked: false },
    { key: 'product' as const, emoji: '📦', label: 'Product project', sub: 'Minutes, PIC link, deliverables', locked: !manager },
  ]
  return (
    <>
      <div className={s.sheetTitle}>New</div>
      <div>
        <div className={`${s.label} ${s.label1}`} style={{ marginBottom: 8 }}>Subsidiary</div>
        <div className={s.chips}>
          {subs.slice(0, 5).map(b => (
            <button key={b.id} type="button" className={s.chip} data-on={sub === b.code ? 'true' : 'false'} onClick={() => onSub(b.code)}>
              <span className={s.chipDot} style={{ background: b.dot }} />{b.name}
            </button>
          ))}
        </div>
      </div>
      {kinds.map(k => (
        <button key={k.key} type="button" className={s.kindRow} disabled={k.locked} onClick={() => onKind(k.key)}>
          <span className={s.kindRowEmoji}>{k.emoji}</span>
          <span className={s.grow}>
            <span className={s.kindRowLabel} style={{ display: 'block' }}>{k.label}</span>
            <span className={s.kindRowSub} style={{ display: 'block' }}>{k.sub}</span>
          </span>
          {k.locked ? <span className={s.lock}>Manager only</span> : <span className={s.chev}>›</span>}
        </button>
      ))}
    </>
  )
}

export interface QuickForm {
  kind: 'quick' | 'recurring'
  sub: string
  title: string
  type: string
}

/** ⚡ Quick task / 🔁 Recurring task: a title (3 characters or more), its type, what will be made — Back · Create task. */
export function QuickSheet({ form, subName, today, bad, busy, onForm, onBack, onCreate }: {
  form: QuickForm
  subName: string
  today: string
  bad: boolean
  busy: boolean
  onForm: (patch: Partial<QuickForm>) => void
  onBack: () => void
  onCreate: () => void
}) {
  return (
    <>
      <div className={s.sheetTitle}>{form.kind === 'recurring' ? '🔁 Recurring task' : '⚡ Quick task'} · {subName}</div>
      <div>
        <div className={s.fLabel}>Title <span className={s.req}>*</span></div>
        <input className={s.input} data-bad={bad ? 'true' : 'false'} value={form.title} maxLength={140} placeholder="What needs to be done"
          aria-label="Title" onChange={e => onForm({ title: e.target.value })} />
        {bad ? <div className={s.sheetBad}>A title of {QUICK_TITLE_MIN} characters or more.</div> : null}
      </div>
      <div>
        <div className={s.fLabel} style={{ marginBottom: 6 }}>Type</div>
        <div className={s.chips}>
          {QUICK_TYPES.map(t => (
            <button key={t.key} type="button" className={s.chip} data-on={form.type === t.key ? 'true' : 'false'} onClick={() => onForm({ type: t.key })}>{t.label}</button>
          ))}
        </div>
      </div>
      <div className={s.sheetNote}>{quickNote(form.kind, today)}</div>
      <div className={s.barRow}>
        <button type="button" className={`${s.btn} ${s.btnAuto}`} onClick={onBack}>Back</button>
        <button type="button" className={s.btn} data-kind="primary" disabled={busy} onClick={onCreate}>Create task</button>
      </div>
    </>
  )
}

/** Request changes (a claim's Reject too): who it goes back to, the words (5–500), Send back. */
export function ReasonSheet({ title, to, onSend }: { title: string; to: string; onSend: (reason: string) => Promise<string | null> }) {
  const [reason, setReason] = useState('')
  const [bad, setBad] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (busy) return
    if (reason.trim().length < 5) return setBad('Say what needs to change — 5 characters or more.')
    setBusy(true)
    const refusal = await onSend(reason.trim())
    setBusy(false)
    if (refusal) setBad(refusal)
  }
  return (
    <>
      <div className={s.sheetTitle}>{title}</div>
      <div className={s.sheetSub}>{to}</div>
      <textarea className={s.textarea} data-bad={bad ? 'true' : 'false'} value={reason} maxLength={500} placeholder="What needs to change" aria-label="What needs to change"
        onChange={e => { setReason(e.target.value); setBad(null) }} />
      <div className={s.hint} data-bad={bad ? 'true' : 'false'}>
        <span className={s.grow}>{bad ?? 'They see this on the task.'}</span>
        <span>{reason.length}/500</span>
      </div>
      <button type="button" className={s.btn} data-kind="dark" disabled={busy} onClick={() => void send()}>Send back</button>
    </>
  )
}

/** The 🔓 handoff: who takes the next stage (its shortlist). */
export function PickSheet({ stage, people, onPick }: { stage: string; people: { id: string; name: string; role: string }[]; onPick: (id: string) => void }) {
  return (
    <>
      <div className={s.sheetTitle}>Who takes {stage}?</div>
      {people.map(x => (
        <button key={x.id} type="button" className={s.pickRow} onClick={() => onPick(x.id)}>
          <span className={s.grow}>
            <span style={{ display: 'block', fontWeight: 600 }}>{x.name}</span>
            {x.role ? <span className={s.kindRowSub}>{x.role}</span> : null}
          </span>
          <span className={s.chev}>›</span>
        </button>
      ))}
    </>
  )
}

/** Change view: every view of the one app (lib/view-switch.ts), where each opens on a phone; this one *You are here*. */
export function ViewsSheet({ current, onPick }: { current: SwitchTarget; onPick: (v: SwitchTarget) => void }) {
  return (
    <>
      <div className={s.sheetTitle}>Change view</div>
      <div className={s.group}>
        {SWITCH_VIEWS.map(v => {
          const here = v.value === current
          return (
            <button key={v.value} type="button" className={s.viewRow} aria-current={here ? 'true' : undefined} disabled={here} onClick={() => onPick(v.value)}>
              <span className={s.grow}>
                <span style={{ display: 'block', fontWeight: 500 }}>{v.short}</span>
                <span className={s.viewWhere}>{here ? 'You are here' : phoneWhere(v.value, 'marketing')}</span>
              </span>
              {here ? null : <span className={s.chev}>›</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** Change password — a login of one's own only (the portal's own action and rules, components/account). */
export function PasswordSheet({ change, onDone }: { change: ChangePassword; onDone: () => void }) {
  const f = useChangePassword(change)
  const type = f.shown ? 'text' : 'password'
  if (f.done) {
    return (
      <>
        <div className={s.sheetTitle}>Change password</div>
        <div className={s.sheetSub}>{PASSWORD_CHANGED}</div>
        <button type="button" className={s.btn} data-kind="primary" onClick={onDone}>Done</button>
      </>
    )
  }
  return (
    <>
      <div className={s.sheetTitle}>Change password</div>
      <div>
        <div className={s.fLabel}>Current password</div>
        <input className={s.input} type={type} autoComplete="current-password" value={f.form.current} onChange={e => f.set('current')(e.target.value)} aria-label="Current password" />
      </div>
      <div>
        <div className={s.fLabel}>New password · at least {MIN_PASSWORD_LENGTH} characters</div>
        <input className={s.input} type={type} autoComplete="new-password" value={f.form.next} onChange={e => f.set('next')(e.target.value)} aria-label="New password" />
      </div>
      <div>
        <div className={s.fLabel}>Confirm new password</div>
        <input className={s.input} type={type} autoComplete="new-password" value={f.form.confirm} onChange={e => f.set('confirm')(e.target.value)} aria-label="Confirm new password" />
      </div>
      <button type="button" className={s.showRow} onClick={() => f.setShown(!f.shown)} aria-pressed={f.shown}>
        <span className={s.checkBox} data-on={f.shown ? 'true' : 'false'}>{f.shown ? '✓' : ''}</span>Show passwords
      </button>
      {f.error ? <div className={s.formBad}>{f.error}</div> : null}
      <button type="button" className={s.btn} data-kind="primary" disabled={f.busy} onClick={f.submit}>Change password</button>
    </>
  )
}

/** Sign out? — this phone only (`scope: 'local'`, the shared logins are signed in on several). */
export function SignOutSheet({ busy, onCancel, onSignOut }: { busy: boolean; onCancel: () => void; onSignOut: () => void }) {
  return (
    <>
      <div className={s.sheetTitle}>Sign out?</div>
      <div className={s.sheetSub}>You will need to sign in again to open Marketing.</div>
      <div className={s.barRow}>
        <button type="button" className={s.btn} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={s.btn} data-kind="danger" onClick={onSignOut} disabled={busy}>Sign out</button>
      </div>
    </>
  )
}
