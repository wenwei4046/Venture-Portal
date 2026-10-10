'use client'

import { useMemo, useState, useTransition } from 'react'
import { btn } from '@/components/hrv/kit'
import { Window } from '@/components/hrv/overlay'
import { MIN_PASSWORD_LENGTH, generatePassword } from '@/lib/invite'
import type { TemplateRecord } from '../../_lib/permission-templates'
import { inviteUser } from '../invite-actions'
import s from './people.module.css'

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

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const NO_DEPT = '— No department'

/**
 * Invite user, as the handoff draws it (2026-10-10): a 420px window — the
 * email, a password set or generated, and the role, which is their title's
 * template and nothing to choose. Opened from a person (right-click, their
 * window) it is theirs; opened from the head it first asks who. A cell raised
 * or lowered for them alone is set afterwards, in their window's Permissions.
 */
export default function InviteDialog({
  candidates,
  templates,
  initialStaffId,
  onClose,
  onCreated,
}: {
  candidates: InviteCandidate[]
  templates: TemplateRecord[]
  initialStaffId: string | null
  onClose: () => void
  onCreated: (notice: string) => void
}) {
  const fixed = initialStaffId !== null && candidates.some(c => c.staffId === initialStaffId)
  const [staffId, setStaffId] = useState<string>(fixed ? initialStaffId! : '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(() => generatePassword())
  const [tried, setTried] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const person = candidates.find(c => c.staffId === staffId) ?? null
  const template = person?.templateId ? (templates.find(t => t.id === person.templateId) ?? null) : null
  const error = !tried
    ? ''
    : !person
      ? 'Pick somebody from the roster'
      : !EMAIL.test(email.trim())
        ? 'Enter a valid email'
        : password.length < MIN_PASSWORD_LENGTH
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
    if (pending) return
    setTried(true)
    setRefusal(null)
    if (!person || !EMAIL.test(email.trim()) || password.length < MIN_PASSWORD_LENGTH) return
    startTransition(async () => {
      const result = await inviteUser({ staffId: person.staffId, email, password, cells: [] })
      if (!result.ok) {
        setRefusal(result.reason)
        return
      }
      onCreated(`Invite sent to ${result.email} — ${result.name} signs in with the temporary password ${password}, then sets their own.`)
    })
  }

  return (
    <Window
      open
      onClose={onClose}
      // The handoff's 420px is the content: its window is content-box, so 420 + 2 × 22 + the 1px rim.
      width={466}
      scrim={0.22}
      z={32}
      label={person ? `Invite ${person.name}` : 'Invite user'}
      style={{ border: '1px solid rgb(var(--hv-hairline))', borderRadius: 14, boxShadow: '0 16px 48px rgb(43 31 23 / 0.2)', padding: 22 }}
    >
      <div className={s.inv}>
        <div>
          <h2 className={s.invTitle}>{person ? `Invite ${person.name}` : 'Invite user'}</h2>
          <div className={s.invSub}>Creates their login. They sign in with the email and temporary password, then set their own.</div>
        </div>
        {fixed ? null : (
          <label className={s.invField}>
            <span className={s.invLabel}>
              <span>Person *</span>
            </span>
            <select className={s.invInput} value={staffId} onChange={e => setStaffId(e.target.value)} aria-label="Person">
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
            </select>
          </label>
        )}
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
        <div className={s.invField}>
          <span className={s.invLabel} id="invite-password">
            <span>Password · set it, or generate one</span>
          </span>
          <div className={s.invPwRow}>
            <input
              className={`${s.invInput} ${s.invPw}`}
              value={password}
              onChange={e => setPassword(e.target.value)}
              aria-labelledby="invite-password"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className={s.invRegen} onClick={() => setPassword(generatePassword())}>
              Regenerate
            </button>
          </div>
        </div>
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
          <button type="button" className={`${btn('primary')} ${s.invSend}`} onClick={send} disabled={pending}>
            {pending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </div>
    </Window>
  )
}
