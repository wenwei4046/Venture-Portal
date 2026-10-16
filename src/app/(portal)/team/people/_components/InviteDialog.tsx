'use client'

import { useMemo, useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { Window } from '@/components/hrv/overlay'
import { Tabs } from '@/components/hrv/tabs'
import { MIN_PASSWORD_LENGTH, generatePassword, type InviteMode } from '@/lib/invite'
import type { TemplateRecord } from '../../_lib/permission-templates'
import { inviteUser, reinviteUser, type InviteResult } from '../invite-actions'
import SecretText, { EyeButton, copyText } from './SecretText'
import s from './people.module.css'
import { Select } from '@/components/hrv/select'

/** Somebody Invite user may give a login to: active, on the roster, no login yet. */
export interface InviteCandidate {
  staffId: string
  name: string
  code: string | null
  department: string | null
  title: string | null
  levelRank: number | null
  templateId: string | null
  /** "NAME · TITLE" of who they report to, from their People record. */
  reportsTo: string | null
}

/** Somebody whose invite link was never used (2026-10-16): invited again, with the login's own email. */
export interface PendingInvite {
  staffId: string
  name: string
  email: string
  templateId: string | null
}

/** What the page says once the window has done its work; a password rides as a secret, dots until shown. */
export interface InviteNotice {
  text: string
  secret?: string
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const NO_DEPT = '— No department'
const MODES: Array<{ key: InviteMode; label: string }> = [
  { key: 'link', label: 'Send invite link' },
  { key: 'password', label: 'Set password' },
]

/**
 * Invite user, as the handoff draws it (2026-10-10): a 420px window — the
 * email, and the role, which is their title's template and nothing to choose.
 * Opened from a person (right-click, their window) it is theirs; opened from
 * the head it first asks who. A cell raised or lowered for them alone is set
 * afterwards, in their window's Permissions.
 *
 * Two ways to hand the login over (2026-10-16, the user): *Send invite link* —
 * they choose their own password from the link — or *Set password*, set or
 * generated here, hidden until the eye is pressed. When Supabase will not
 * email the link, the window keeps it on screen to copy and send by hand.
 * Opened for somebody whose link was never used, it invites them again:
 * the login's email, a new link or a password now.
 */
export default function InviteDialog({
  candidates,
  pending = [],
  templates,
  initialStaffId,
  onClose,
  onCreated,
}: {
  candidates: InviteCandidate[]
  pending?: PendingInvite[]
  templates: TemplateRecord[]
  initialStaffId: string | null
  onClose: () => void
  onCreated: (notice: InviteNotice) => void
}) {
  // Settled when the window opens: a login made here moves the person from candidates to pending as the page
  // refreshes behind it, and the window must not start calling its first invite "again" (seen on the E2E).
  const [again] = useState(() => (initialStaffId !== null ? (pending.find(p => p.staffId === initialStaffId) ?? null) : null))
  const [fixed] = useState(() => again !== null || (initialStaffId !== null && candidates.some(c => c.staffId === initialStaffId)))
  const [staffId, setStaffId] = useState<string>(fixed ? initialStaffId! : '')
  const [mode, setMode] = useState<InviteMode>('link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => generatePassword())
  const [shown, setShown] = useState(false)
  const [tried, setTried] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [handed, setHanded] = useState<{ link: string; why: string; name: string; email: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, startTransition] = useTransition()

  const person: { staffId: string; name: string; templateId: string | null } | null =
    again ?? candidates.find(c => c.staffId === staffId) ?? null
  const template = person?.templateId ? (templates.find(t => t.id === person.templateId) ?? null) : null
  const sendTo = again ? again.email : email.trim()
  const error = !tried
    ? ''
    : !person
      ? 'Pick somebody from the roster'
      : !EMAIL.test(sendTo)
        ? 'Enter a valid email'
        : mode === 'password' && password.length < MIN_PASSWORD_LENGTH
          ? `Password needs ${MIN_PASSWORD_LENGTH}+ characters`
          : ''

  const groups = useMemo(() => {
    const byDept = new Map<string, InviteCandidate[]>()
    for (const c of candidates) byDept.set(c.department ?? NO_DEPT, [...(byDept.get(c.department ?? NO_DEPT) ?? []), c])
    return [...byDept.entries()]
      .sort(([a], [b]) => (a === NO_DEPT ? 1 : b === NO_DEPT ? -1 : a.localeCompare(b)))
      .map(([dept, rows]) => ({ dept, rows: rows.sort((a, b) => (b.levelRank ?? 0) - (a.levelRank ?? 0) || a.name.localeCompare(b.name)) }))
  }, [candidates])

  function send() {
    if (busy) return
    setTried(true)
    setRefusal(null)
    if (!person || !EMAIL.test(sendTo) || (mode === 'password' && password.length < MIN_PASSWORD_LENGTH)) return
    const secret = mode === 'password' ? password : undefined
    startTransition(async () => {
      const result: InviteResult = again
        ? await reinviteUser({ staffId: person.staffId, mode, password: secret })
        : await inviteUser({ staffId: person.staffId, email: sendTo, mode, password: secret, cells: [] })
      if (!result.ok) {
        setRefusal(result.reason)
        return
      }
      if (result.mode === 'password') {
        onCreated({ text: `${result.name} can sign in with ${result.email} and the password`, secret })
      } else if (result.emailed) {
        onCreated({ text: `Invite link sent to ${result.email}` })
      } else {
        setHanded({ link: result.link, why: result.why, name: result.name, email: result.email })
      }
    })
  }

  const who = handed?.name ?? person?.name
  const title = who ? `Invite ${who}${again ? ' again' : ''}` : 'Invite user'

  return (
    <Window
      open
      onClose={handed ? () => onCreated({ text: `Invite link made for ${handed.name} (${handed.email})` }) : onClose}
      // The handoff's 420px is the content: its window is content-box, so 420 + 2 × 22 + the 1px rim.
      width={466}
      scrim={0.22}
      z={32}
      label={title}
      style={{ border: '1px solid rgb(var(--hv-hairline))', borderRadius: 14, boxShadow: '0 16px 48px rgb(43 31 23 / 0.2)', padding: 22 }}
    >
      {handed ? (
        <div className={s.inv}>
          <h2 className={s.invTitle}>{title}</h2>
          <div className={s.invWhy} role="status">
            {handed.why}
          </div>
          <div className={s.invField}>
            <span className={s.invLabel} id="invite-link">
              <span>Invite link · {handed.email}</span>
            </span>
            <div className={s.invPwRow}>
              <input
                className={`${s.invInput} ${s.invLink}`}
                value={handed.link}
                readOnly
                aria-labelledby="invite-link"
                onFocus={e => e.currentTarget.select()}
              />
              <button
                type="button"
                className={s.invRegen}
                onClick={() => void copyText(handed.link).then(ok => setCopied(ok))}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
          </div>
          <div className={s.invFoot}>
            <button
              type="button"
              className={`${btn('primary')} ${s.invSend}`}
              onClick={() => onCreated({ text: `Invite link made for ${handed.name} (${handed.email})` })}
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className={s.inv}>
          <h2 className={s.invTitle}>{title}</h2>
          <Tabs
            items={MODES}
            active={mode}
            onSelect={key => {
              setMode(key as InviteMode)
              setRefusal(null)
            }}
            size="small"
            label="How they get in"
          />
          {fixed ? null : (
            <label className={s.invField}>
              <span className={s.invLabel}>
                <span>Person *</span>
              </span>
              <Select bare className={s.invInput} value={staffId} onChange={e => setStaffId(e.target.value)} aria-label="Person">
                <option value="">{candidates.length ? 'Pick somebody from the roster' : 'Everybody active already has a login'}</option>
                {groups.map(g => (
                  <optgroup key={g.dept} label={g.dept}>
                    {g.rows.map(c => (
                      <option key={c.staffId} value={c.staffId}>
                        {[c.name, c.title].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </label>
          )}
          {again ? (
            <div className={s.invField}>
              <span className={s.invLabel}>
                <span>Email</span>
                <span className={s.invErr}>{error}</span>
              </span>
              <span className={s.invFixed}>{again.email}</span>
            </div>
          ) : (
            <label className={s.invField}>
              <span className={s.invLabel}>
                <span>Email *</span>
                <span className={s.invErr}>{error}</span>
              </span>
              <input
                className={s.invInput}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="off"
              />
            </label>
          )}
          {mode === 'password' ? (
            <div className={s.invField}>
              <span className={s.invLabel} id="invite-password">
                <span>Password · set it, or generate one</span>
              </span>
              <div className={s.invPwRow}>
                <span className={s.invPwWrap}>
                  <input
                    className={`${s.invInput} ${s.invPw}`}
                    type={shown ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    aria-labelledby="invite-password"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <EyeButton shown={shown} onToggle={() => setShown(v => !v)} className={s.invEye} />
                </span>
                <button type="button" className={s.invRegen} onClick={() => setPassword(generatePassword())}>
                  Regenerate
                </button>
              </div>
            </div>
          ) : null}
          <div className={s.invRole}>
            <span className={s.invRoleLabel}>Role</span>
            <span className={s.invRoleChip} title="Their title's permission template — what they may do follows their title">
              {template?.name ?? (person ? 'No template on their title yet' : '—')}
            </span>
          </div>
          <div className={s.invFoot}>
            {refusal ? (
              <span className={s.invRefusal} role="alert">
                {refusal}
              </span>
            ) : null}
            <button type="button" className={`${btn('outline')} ${s.invCancel}`} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={`${btn('primary')} ${s.invSend}`} onClick={send} disabled={busy}>
              {mode === 'link' ? (busy ? 'Sending…' : 'Send invite link') : busy ? 'Saving…' : again ? 'Set password' : 'Create login'}
            </button>
          </div>
        </div>
      )}
    </Window>
  )
}
