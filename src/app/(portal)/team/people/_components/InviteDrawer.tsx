'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  ACTIONS,
  type CellKey,
  type PermFunction,
  type PersonCells,
  cellOf,
  cyclePersonCell,
  effectiveGrants,
  exceptionCounts,
  heldCells,
  initialsOf,
  keyList,
  personCellsToRows,
} from '@/lib/permission-matrix'
import { generatePassword, inviteBlocker, passwordStrength } from '@/lib/invite'
import type { TemplateRecord } from '../../_lib/permission-templates'
import PermissionCell from '../../_components/PermissionCell'
import { inviteUser } from '../invite-actions'

/** Somebody the drawer may give a login to: active, on the roster, no login yet. */
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

interface Props {
  candidates: InviteCandidate[]
  templates: TemplateRecord[]
  functions: PermFunction[]
  /** What each cell opens today — for the held-for-now line. */
  cellKeys: CellKey[]
  /** accounts.manage — a cell may be changed for this person only with it. */
  canSetCells: boolean
  initialStaffId: string | null
  onClose: () => void
  onCreated: (notice: string) => void
}

const NO_DEPT = '— No department'

/**
 * Invite user, as a right-hand drawer (the Claude Design handoff, 2026-10-08).
 * Three steps: the person — picked from the roster, never typed, because the
 * People record owns their name, department, title and reporting line; the
 * login; and what they can do — their title's template, with a cell raised or
 * lowered for them alone. There is no role: the title decides.
 */
export default function InviteDrawer({ candidates, templates, functions, cellKeys, canSetCells, initialStaffId, onClose, onCreated }: Props) {
  const [staffId, setStaffId] = useState<string | null>(
    initialStaffId && candidates.some(c => c.staffId === initialStaffId) ? initialStaffId : null,
  )
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(true)
  const [own, setOwn] = useState<PersonCells>({})
  const [showAll, setShowAll] = useState(false)
  const [showHeld, setShowHeld] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const person = candidates.find(c => c.staffId === staffId) ?? null
  const template = person?.templateId ? (templates.find(t => t.id === person.templateId) ?? null) : null
  const base = template?.grants ?? {}
  const effective = useMemo(() => effectiveGrants(base, own), [base, own])
  const { raised, lowered } = exceptionCounts(base, own)
  const held = useMemo(
    () => (template ? heldCells(effective, template.sensitive, template.baseRole, cellKeys, functions) : []),
    [effective, template, cellKeys, functions],
  )

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pickable = candidates.filter(
      c => !q || [c.name, c.code, c.title].some(x => (x ?? '').toLowerCase().includes(q)),
    )
    const byDept = new Map<string, InviteCandidate[]>()
    for (const c of pickable) {
      const key = c.department ?? NO_DEPT
      byDept.set(key, [...(byDept.get(key) ?? []), c])
    }
    return [...byDept.entries()]
      .sort(([a], [b]) => (a === NO_DEPT ? 1 : b === NO_DEPT ? -1 : a.localeCompare(b)))
      .map(([dept, rows]) => ({
        dept,
        rows: rows.sort((a, b) => (b.levelRank ?? 0) - (a.levelRank ?? 0) || a.name.localeCompare(b.name)),
      }))
  }, [candidates, query])

  const strength = passwordStrength(password)
  const blocker = inviteBlocker({ staffId, email, password })
  const rows = functions.filter(
    fn => showAll || fn.actions.some(a => cellOf(effective, fn.key, a) !== 'none' || `${fn.key}.${a}` in own),
  )

  function choose(id: string | null) {
    setStaffId(id)
    setOwn({})
    setError(null)
  }

  function create() {
    if (blocker || pending || !person) return
    setError(null)
    startTransition(async () => {
      const result = await inviteUser({ staffId: person.staffId, email, password, cells: personCellsToRows(own) })
      if (!result.ok) {
        setError(result.reason)
        return
      }
      onCreated(`Created a login for ${result.name} (${result.email}). Tell them the password yourself — ${password}`)
    })
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} aria-hidden />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={person ? `Invite ${person.name}` : 'Invite user'}>
        <div className="px-6 pt-5 pb-4 border-b border-hairline flex justify-between gap-3 items-start">
          <div>
            <div className="page-eyebrow !mb-1.5">
              <em>I.</em> PEOPLE · INVITE USER
            </div>
            <div className="font-display text-[26px] leading-[1.2] tracking-[-0.02em]">
              {person ? `Invite ${person.name}` : 'Invite user'}
            </div>
            <p className="mt-1.5 text-[12px] leading-normal">
              Creates a login they can sign in with straight away — there is no email step, so tell them the password
              yourself.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 shrink-0 rounded-control border border-hairline bg-surface text-[14px] leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <section className="drawer-step">
            <h2>
              <span className="n">01</span>The person<span className="ml-auto text-[11px] font-normal">From People Management</span>
            </h2>
            {!person ? (
              <>
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search name, code or title…"
                  aria-label="Search the roster"
                  className="drawer-input"
                  autoFocus
                />
                <div className="mt-2 max-h-[300px] overflow-y-auto border border-hairline rounded-[8px] bg-surface">
                  {groups.map(g => (
                    <div key={g.dept}>
                      <div className="drawer-band">
                        {g.dept}
                        <span className="font-mono font-normal tracking-[0.02em] normal-case ml-1.5">{g.rows.length}</span>
                      </div>
                      {g.rows.map(c => (
                        <div
                          key={c.staffId}
                          role="button"
                          tabIndex={0}
                          className="drawer-pick"
                          onClick={() => choose(c.staffId)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              choose(c.staffId)
                            }
                          }}
                        >
                          <span className="mono-tile">{initialsOf(c.name)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-medium truncate">{c.name}</span>
                            <span className="block text-[11px] truncate">{c.title ?? '— No title'}</span>
                          </span>
                          <span className="font-mono text-[10.5px] shrink-0">{c.code}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {groups.length === 0 ? (
                    <div className="p-[18px] text-center text-[12px]">Nobody matches. Only active people without a login are listed.</div>
                  ) : null}
                </div>
                <p className="mt-2 text-[11px] leading-normal">
                  Only active people without a login are listed. Somebody not on the roster yet? Add them with + Add person first.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 bg-surface border border-hairline rounded-[10px]">
                  <span className="mono-tile mono-tile-lg">{initialsOf(person.name)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-bold">{person.name}</span>
                    <span className="block font-mono text-[10.5px] mt-0.5">{person.code ?? '—'} · no login yet</span>
                  </span>
                  <button type="button" className="perm-link text-[11px] shrink-0" onClick={() => choose(null)}>
                    Change person
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3.5 gap-y-2.5 mt-3">
                  <Fact label="Department">{person.department ?? '— No department'}</Fact>
                  <Fact label="Title">
                    {person.title ?? '— No title'}
                    {person.levelRank !== null ? <span className="font-mono text-[10px] ml-1">L{person.levelRank}</span> : null}
                  </Fact>
                  <Fact label="Reports to">{person.reportsTo ?? '— Nobody'}</Fact>
                  <Fact label="Permission template">{template?.name ?? '— None'}</Fact>
                </div>
                <p className="mt-3 text-[11px] leading-normal">
                  Read from their People record. Wrong title or reporting line? Fix it there — the login and its permissions
                  follow the title.
                </p>
              </>
            )}
          </section>

          <section className="drawer-step">
            <h2>
              <span className="n">02</span>The login
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3.5 gap-y-3">
              <label className="block">
                <span className="drawer-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@houzs.com"
                  autoComplete="off"
                  className="drawer-input"
                />
              </label>
              {/* Not a wrapping <label>: the Show and Generate buttons would take
                  the whole label as their names. */}
              <div className="block">
                <label htmlFor="invite-password" className="drawer-label">
                  Password
                </label>
                <span className="flex items-stretch bg-surface border border-hairline rounded-control overflow-hidden">
                  <input
                    id="invite-password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="flex-1 min-w-0 px-3 py-2 border-0 font-mono text-[13px] tracking-[0.04em] outline-none"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)} className="border-l border-hairline bg-surface px-2.5 text-[11px]">
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(generatePassword())
                      setShowPw(true)
                    }}
                    className="border-l border-hairline bg-surface-2 hover:bg-accent-bg px-2.5 text-[11px] font-medium"
                  >
                    Generate
                  </button>
                </span>
              </div>
              <span className="sm:col-span-2 flex items-center gap-2 text-[11px] -mt-1">
                <span className="flex gap-[3px]" aria-hidden>
                  {[1, 2, 3].map(n => (
                    <span
                      key={n}
                      className={`pw-seg ${strength >= n ? (strength === 1 ? 'weak' : strength === 2 ? 'fair' : 'strong') : ''}`}
                    />
                  ))}
                </span>
                <span>
                  {strength === 1
                    ? 'Too short — at least 6 characters.'
                    : 'At least 6 characters. Shown in the clear so you can pass it on.'}
                </span>
              </span>
            </div>
          </section>

          <section className="drawer-step">
            <h2 className="!mb-2.5">
              <span className="n">03</span>What they can do
              <span className="ml-auto font-mono text-[10.5px] font-medium">{template ? `${keyList(effective, [], functions).length} keys` : ''}</span>
            </h2>
            {!template ? (
              <p className="m-0 text-[12px] leading-[1.6]">
                {person && person.title
                  ? `${person.title} has no permission template yet. Choose one under People Management → Permissions, then invite.`
                  : 'Pick a title above and its permission template loads here. You can still change a cell for this person only.'}
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2.5 px-3 py-2.5 border border-accent rounded-[8px] bg-accent-bg text-[12px] leading-[1.55] mb-3">
                  <span className="flex-1">
                    Template <b className="font-bold">{template.name}</b>, from the title {person?.title}.{' '}
                    {raised + lowered > 0
                      ? `${raised} raised, ${lowered} lowered for this person only.`
                      : canSetCells
                        ? 'Click a cell to change it for this person only.'
                        : 'Only whoever manages permissions changes a cell for one person.'}
                  </span>
                  {raised + lowered > 0 ? (
                    <button type="button" className="perm-link shrink-0 text-[11px]" onClick={() => setOwn({})}>
                      Back to template
                    </button>
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="perm-matrix compact">
                    <thead>
                      <tr>
                        <th>Function</th>
                        {ACTIONS.map(a => (
                          <th key={a.key}>{a.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(fn => (
                        <tr key={fn.key} className="fn">
                          <td>{fn.label}</td>
                          {ACTIONS.map(a => (
                            <td key={a.key}>
                              <PermissionCell
                                fn={fn}
                                action={a.key}
                                cell={cellOf(effective, fn.key, a.key)}
                                small
                                changed={`${fn.key}.${a.key}` in own}
                                onClick={canSetCells ? () => setOwn(o => cyclePersonCell(base, o, fn, a.key)) : undefined}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded bg-surface" style={{ boxShadow: '0 0 0 2px rgb(var(--walnut))' }} aria-hidden />
                    Changed for this person
                  </span>
                  {held.length > 0 ? (
                    <button type="button" className="perm-link" onClick={() => setShowHeld(s => !s)}>
                      {held.length} held for now
                    </button>
                  ) : null}
                  <button type="button" className="perm-link ml-auto" onClick={() => setShowAll(s => !s)}>
                    {showAll ? 'Only what they have' : `Show all ${functions.length} functions`}
                  </button>
                </div>
                {showHeld && held.length > 0 ? (
                  <ul className="perm-held mt-2 rounded-[8px] list-none">
                    {held.map(h => (
                      <li key={h.key}>
                        <b className="font-bold">{h.label}</b> — {h.reason}.
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>
          {error ? <div className="sheet-danger !my-0">{error}</div> : null}
        </div>

        <div className="px-6 py-3.5 border-t border-hairline bg-[rgb(var(--sheet-foot))] flex items-center gap-3">
          <button
            type="button"
            onClick={create}
            disabled={!!blocker || pending || !template}
            className="bg-accent hover:bg-accent-hover text-ink text-[13px] font-medium px-5 py-2.5 rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            {pending ? 'Creating…' : 'Create account'}
          </button>
          <button type="button" onClick={onClose} className="bg-surface border border-hairline text-[13px] px-4 py-2.5 rounded-control">
            Cancel
          </button>
          <span className="ml-auto text-[11px] text-right">
            {blocker || (person && !template ? 'Their title needs a permission template' : '')}
          </span>
        </div>
      </aside>
    </>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.025em] mb-[3px]">{label}</div>
      <div className="text-[13px]">{children}</div>
    </div>
  )
}
