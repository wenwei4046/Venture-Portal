'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { officeTime } from '@/lib/office-time'
import {
  ACTIONS,
  CELL_LABEL,
  SECTIONS,
  SENSITIVE_FIELDS,
  type Action,
  type Grants,
  type PermFunction,
  type SensitiveField,
  cellOf,
  cycleNext,
  describeExceptions,
  exceptionsOnChangedCells,
  grantsToRows,
  heldCells,
  initialsOf,
  keyList,
  parseCellKey,
  sameGrants,
  sameSensitive,
  sectionTally,
  setCell,
  sodWarnings,
} from '@/lib/permission-matrix'
import type { HistoryEntry } from '@/lib/permission-history'
import type { PermissionsData, TemplateLogin, TemplateRecord, TemplateTitle } from '../../_lib/permission-templates'
import PermissionCell from '../../_components/PermissionCell'
import { createTemplate, loadPermissionHistory, saveTemplate, setTitleTemplate } from '../permission-actions'

interface Props {
  data: PermissionsData
  /** accounts.manage — everything here is read-only without it. */
  canManage: boolean
  /** Whether the reader may open the history (permissions_manage or audit_log). */
  canSeeHistory: boolean
  initialTemplateId: string | null
  onNotice: (message: string) => void
}

type Draft = { grants: Grants; sensitive: SensitiveField[] }

/** Somebody on the template whose own cells sit on a cell this save changes. */
interface Affected {
  login: TemplateLogin
  titleName: string
  cells: string[]
}

/**
 * People Management › Permissions (2026-10-08): the permission templates, as
 * drawn in the Claude Design handoff — the rail of templates on the left, the
 * selected one's matrix on the right (function × action, each cell a reach:
 * Own · Dept · All), its sensitive fields, its keys, and the titles that use it.
 *
 * Beyond the drawing, three things the user asked for on the way: a save that
 * would change a cell somebody has their own value on asks, person by person,
 * whether to keep theirs or put them back on the template; every change is in
 * the History below; and a cell the database cannot honour yet (lib/
 * permission-matrix.ts `heldCells`) is listed with its reason, never silent.
 */
export default function PermissionTemplates({ data, canManage, canSeeHistory, initialTemplateId, onNotice }: Props) {
  const router = useRouter()
  const { functions, templates, titles, logins, cellKeys } = data
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTemplateId && templates.some(t => t.id === initialTemplateId) ? initialTemplateId : (templates[0]?.id ?? null),
  )
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showKeys, setShowKeys] = useState(false)
  const [showHeld, setShowHeld] = useState(false)
  const [creating, setCreating] = useState(false)
  const [ask, setAsk] = useState<{ affected: Affected[]; reset: Set<string> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const template = templates.find(t => t.id === selectedId) ?? null
  const grants = draft?.grants ?? template?.grants ?? {}
  const sensitive = draft?.sensitive ?? template?.sensitive ?? []
  const dirty =
    !!template && !!draft && (!sameGrants(draft.grants, template.grants, functions) || !sameSensitive(draft.sensitive, template.sensitive))

  const titlesOf = (id: string) => titles.filter(t => t.templateId === id)
  const peopleOn = (id: string) => titlesOf(id).reduce((n, t) => n + t.people, 0)

  function pick(id: string) {
    if (id === selectedId) return
    if (dirty && !window.confirm(`Discard your changes to ${template?.name}?`)) return
    setSelectedId(id)
    setDraft(null)
    setError(null)
  }

  function edit(next: (d: Draft) => Draft) {
    if (!template || !canManage) return
    setDraft(d => next(d ?? { grants: template.grants, sensitive: template.sensitive }))
  }

  function onCell(fn: PermFunction, action: Action) {
    edit(d => ({ ...d, grants: setCell(d.grants, fn, action, cycleNext(fn, cellOf(d.grants, fn.key, action))) }))
  }

  function onSave() {
    if (!template || !draft || !dirty || pending) return
    const titleById = new Map(titles.map(t => [t.id, t]))
    const onIt = logins.filter(l => l.titleId && titleById.get(l.titleId)?.templateId === template.id)
    const affected: Affected[] = exceptionsOnChangedCells(onIt, template.grants, draft.grants, functions).map(a => ({
      login: a.person,
      titleName: titleById.get(a.person.titleId!)!.name,
      cells: a.cells,
    }))
    if (affected.length > 0) {
      setAsk({ affected, reset: new Set() })
      return
    }
    commit([])
  }

  function commit(reset: Array<{ userId: string; functionKey: string; action: string }>) {
    if (!template || !draft) return
    setError(null)
    startTransition(async () => {
      const result = await saveTemplate({
        templateId: template.id,
        version: template.version,
        grants: grantsToRows(draft.grants, functions),
        sensitive: draft.sensitive,
        reset,
      })
      if (!result.ok) {
        setError(result.reason)
        return
      }
      setAsk(null)
      setDraft(null)
      onNotice(`${template.name} saved — applies to ${result.titles} ${result.titles === 1 ? 'title' : 'titles'} at once.`)
      router.refresh()
    })
  }

  function moveTitle(title: TemplateTitle, templateId: string) {
    setError(null)
    startTransition(async () => {
      const result = await setTitleTemplate(title.id, templateId || null)
      if (!result.ok) {
        setError(result.reason)
        return
      }
      const to = templates.find(t => t.id === templateId)
      onNotice(to ? `${title.name} now follows ${to.name}.` : `${title.name} has no template now — its holders fall back to their account’s old role.`)
      router.refresh()
    })
  }

  const warnings = useMemo(() => sodWarnings(grants, functions), [grants, functions])
  const keys = useMemo(() => keyList(grants, sensitive, functions), [grants, sensitive, functions])
  const held = useMemo(
    () => (template ? heldCells(grants, sensitive, template.baseRole, cellKeys, functions) : []),
    [grants, sensitive, template, cellKeys, functions],
  )
  const sections = SECTIONS.map(section => ({ section, fns: functions.filter(f => f.section === section) })).filter(s => s.fns.length > 0)
  const unassigned = titles.filter(t => !t.templateId)

  if (!template) {
    return (
      <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
        <p className="text-sm">No permission templates yet.</p>
      </div>
    )
  }

  const onTemplate = titlesOf(template.id)

  return (
    <div className="mb-12">
      {error ? <div className="sheet-danger mt-0 mb-4">{error}</div> : null}
      <div className="perm-layout">
        <aside className="perm-rail" aria-label="Permission templates">
          <div className="perm-band">
            <span className="label">Permission templates</span>
            <span className="n">{templates.length}</span>
          </div>
          <div className="perm-rail-list">
            {templates.map(t => {
              const ts = titlesOf(t.id)
              const on = t.id === template.id
              const g = on ? grants : t.grants
              return (
                <button key={t.id} type="button" className="perm-rail-item" aria-current={on} onClick={() => pick(t.id)}>
                  <span className="flex items-center gap-2">
                    <span className="name">{t.name}</span>
                    {sodWarnings(g, functions).length > 0 ? (
                      <span className="perm-sod" title="Maker and checker in one template">SoD</span>
                    ) : null}
                  </span>
                  <span className="meta">
                    {keyList(g, on ? sensitive : t.sensitive, functions).length} keys · {ts.length} {ts.length === 1 ? 'title' : 'titles'} ·{' '}
                    {peopleOn(t.id)} people
                  </span>
                  <span className="titles">{ts.map(x => x.name).join(', ') || 'No titles yet'}</span>
                </button>
              )
            })}
          </div>
          {canManage ? (
            <div className="perm-rail-foot">
              {creating ? (
                <NewTemplateForm
                  templates={templates}
                  startFrom={template.id}
                  onCancel={() => setCreating(false)}
                  onCreated={(id, name) => {
                    setCreating(false)
                    setSelectedId(id)
                    setDraft(null)
                    onNotice(`${name} created. Point titles at it below, or from Hierarchy › Roles.`)
                    router.refresh()
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="w-full bg-surface hover:bg-surface-2 border border-hairline text-[12px] px-2.5 py-[7px] rounded-control transition-colors"
                >
                  + New template
                </button>
              )}
            </div>
          ) : null}
        </aside>

        <div className="flex flex-col gap-5 min-w-0">
          <div className="perm-frame">
            <div className="perm-frame-head">
              <div className="min-w-0">
                <div className="perm-eyebrow">Template · {template.key}</div>
                <div className="sheet-heading">{template.name}</div>
                {template.description ? <div className="sheet-subtitle !mt-1 max-w-[640px]">{template.description}</div> : null}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <span className="text-[11px] mr-0.5">Used by</span>
                  {onTemplate.length === 0 ? (
                    <span className="text-[11px]">no title yet</span>
                  ) : (
                    onTemplate.map(t => (
                      <Link key={t.id} href="/team/hierarchy?tab=roles" className="perm-chip no-underline">
                        {t.name}
                      </Link>
                    ))
                  )}
                </div>
              </div>
              {canManage ? (
                <div className="flex items-center gap-3 shrink-0">
                  {dirty ? (
                    <button type="button" className="perm-link text-[11px]" onClick={() => setDraft(null)}>
                      Discard changes
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={!dirty || pending}
                    className="bg-accent hover:bg-accent-hover text-ink text-[13px] font-medium px-4 py-2 rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
                  >
                    {pending && dirty ? 'Saving…' : dirty ? 'Save template' : 'Saved'}
                  </button>
                </div>
              ) : (
                <span className="text-[11px] max-w-[220px] text-right shrink-0">
                  Read-only — only whoever manages permissions changes a template.
                </span>
              )}
            </div>

            <div className="perm-legend">
              <span className="font-bold">Scope</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="perm-cell own swatch">Own</span>their own records
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="perm-cell dept swatch">Dept</span>their department
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="perm-cell all swatch">All</span>whole company
              </span>
              <span className="ml-auto">Click a cell to change it. Any action brings View up with it.</span>
            </div>

            {warnings.length > 0 ? (
              <div className="perm-warn">
                <div className="font-bold mb-0.5">Maker and checker in one template</div>
                {warnings.map(w => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            ) : null}

            <div className="perm-matrix-wrap">
              <table className="perm-matrix">
                <thead>
                  <tr>
                    <th>Function</th>
                    {ACTIONS.map(a => (
                      <th key={a.key}>{a.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sections.map(({ section, fns }) => (
                    <Fragment key={section}>
                      <tr>
                        <td className="section" colSpan={ACTIONS.length + 1}>
                          <span>{section}</span>
                          <span className="tally">{sectionTally(grants, fns)}</span>
                        </td>
                      </tr>
                      {fns.map((fn, i) => (
                        <tr key={fn.key} className={`fn ${i % 2 ? 'zebra' : ''}`}>
                          <td>
                            <div className="fn-label" title={fn.description ?? undefined}>
                              {fn.label}
                            </div>
                            <div className="fn-key">
                              {fn.key}
                              {fn.scopes.length > 1 ? ` · ${fn.scopes.join('/')}` : ''}
                            </div>
                          </td>
                          {ACTIONS.map(a => (
                            <td key={a.key}>
                              <PermissionCell
                                fn={fn}
                                action={a.key}
                                cell={cellOf(grants, fn.key, a.key)}
                                onClick={canManage ? () => onCell(fn, a.key) : undefined}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="perm-sensitive">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] mb-2.5">
                Sensitive fields
                <span className="font-normal normal-case tracking-normal text-[11px] ml-1.5">
                  Hidden as •••• unless ticked, on every page this template can open
                </span>
              </div>
              <div className="grid3">
                {SENSITIVE_FIELDS.map(f => (
                  <label key={f.key}>
                    <input
                      type="checkbox"
                      checked={sensitive.includes(f.key)}
                      disabled={!canManage}
                      onChange={() =>
                        edit(d => ({
                          ...d,
                          sensitive: d.sensitive.includes(f.key) ? d.sensitive.filter(x => x !== f.key) : [...d.sensitive, f.key],
                        }))
                      }
                    />
                    <span>
                      <span className="text-[12.5px] font-medium">{f.label}</span>
                      <span className="block text-[11px] leading-[1.45] mt-0.5">{f.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="perm-keys">
              <span className="font-mono">{keys.length} permission keys</span>
              <button type="button" className="perm-link" onClick={() => setShowKeys(s => !s)}>
                {showKeys ? 'Hide keys' : 'Show keys'}
              </button>
              {held.length > 0 ? (
                <>
                  <span className="font-mono">· {held.length} held for now</span>
                  <button type="button" className="perm-link" onClick={() => setShowHeld(s => !s)}>
                    {showHeld ? 'Hide why' : 'Why'}
                  </button>
                </>
              ) : null}
            </div>
            {showHeld && held.length > 0 ? (
              <div className="perm-held">
                Saved as drawn, but not in force yet — the pages still read one key per module, so these stay closed
                until each action and reach is enforced on its own:
                <ul className="mt-1">
                  {held.map(h => (
                    <li key={h.key}>
                      <b className="font-bold">{h.label}</b> — {h.reason}.
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {showKeys ? <pre className="perm-keylist">{keys.join('\n')}</pre> : null}
          </div>

          <TitlesTable
            heading="Titles on this template"
            titles={onTemplate}
            logins={logins}
            templates={templates}
            canManage={canManage}
            pending={pending}
            onMove={moveTitle}
          />
          {unassigned.length > 0 ? (
            <TitlesTable
              heading="Titles with no template yet"
              note="Their holders still follow the role their account was created with. Pick a template to move them onto it."
              titles={unassigned}
              logins={logins}
              templates={templates}
              canManage={canManage}
              pending={pending}
              onMove={moveTitle}
            />
          ) : null}

          {canSeeHistory ? <History /> : null}
        </div>
      </div>

      {ask ? (
        <ResetDialog
          templateName={template.name}
          ask={ask}
          functions={functions}
          before={template.grants}
          after={grants}
          pending={pending}
          onToggle={(key, reset) =>
            setAsk(a => {
              if (!a) return a
              const next = new Set(a.reset)
              if (reset) next.add(key)
              else next.delete(key)
              return { ...a, reset: next }
            })
          }
          onCancel={() => setAsk(null)}
          onConfirm={() =>
            commit(
              ask.affected.flatMap(a =>
                a.cells
                  .filter(c => ask.reset.has(`${a.login.userId}|${c}`))
                  .flatMap(c => {
                    const parsed = parseCellKey(c)
                    return parsed ? [{ userId: a.login.userId, functionKey: parsed.fn, action: parsed.action }] : []
                  }),
              ),
            )
          }
        />
      ) : null}
    </div>
  )
}


function TitlesTable({
  heading,
  note,
  titles,
  logins,
  templates,
  canManage,
  pending,
  onMove,
}: {
  heading: string
  note?: string
  titles: TemplateTitle[]
  logins: TemplateLogin[]
  templates: TemplateRecord[]
  canManage: boolean
  pending: boolean
  onMove: (title: TemplateTitle, templateId: string) => void
}) {
  const people = titles.reduce((n, t) => n + t.people, 0)
  return (
    <div>
      <div className="flex items-baseline gap-4 mb-3">
        <h2 className="m-0 text-[15px] font-bold tracking-[-0.01em] shrink-0">{heading}</h2>
        <span className="flex-1 h-px bg-[rgb(var(--sheet-divider))] -translate-y-1" aria-hidden />
        <span className="font-mono text-[10px] tracking-[0.08em] uppercase shrink-0">
          {people} {people === 1 ? 'PERSON' : 'PEOPLE'}
        </span>
      </div>
      {note ? <p className="text-[12px] leading-[1.6] -mt-1 mb-3 max-w-3xl">{note}</p> : null}
      {titles.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-5 text-center">
          <p className="text-sm">No title uses this template yet.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table tight">
            <thead>
              <tr>
                <th>Title</th>
                <th>Department</th>
                <th className="text-right w-[80px]">People</th>
                <th>Personal exceptions</th>
                <th className="w-[210px]">Template</th>
              </tr>
            </thead>
            <tbody>
              {titles.map(t => {
                const exceptions = logins
                  .filter(l => l.titleId === t.id)
                  .flatMap(l => describeExceptions(initialsOf(l.name), l.cells))
                return (
                  <tr key={t.id}>
                    <td>
                      <span className="font-medium">{t.name}</span>
                      {t.levelRank !== null ? <span className="font-mono text-[10px] ml-1.5">L{t.levelRank}</span> : null}
                    </td>
                    <td>{t.departmentName ?? '—'}</td>
                    <td className="num">{t.people}</td>
                    <td className="font-mono text-[11px]">{exceptions.length > 0 ? exceptions.join(', ') : '—'}</td>
                    <td>
                      <select
                        key={t.templateId ?? 'none'}
                        defaultValue={t.templateId ?? ''}
                        disabled={!canManage || pending}
                        onChange={e => onMove(t, e.target.value)}
                        aria-label={`Template for ${t.name}`}
                        className="w-full px-2 py-[5px] bg-surface border border-hairline rounded-control text-[12px]"
                      >
                        {t.templateId ? null : <option value="">— None yet</option>}
                        {templates.map(o => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NewTemplateForm({
  templates,
  startFrom,
  onCancel,
  onCreated,
}: {
  templates: TemplateRecord[]
  startFrom: string
  onCancel: () => void
  onCreated: (id: string, name: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [copyFrom, setCopyFrom] = useState(startFrom)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await createTemplate({ name, description, copyFrom: copyFrom || null })
      if (!result.ok) setError(result.reason)
      else onCreated(result.id, name.trim())
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="block">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] mb-1">Name</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={80}
          autoFocus
          placeholder="e.g. Finance · Viewer"
          className="w-full px-2 py-1.5 bg-surface border border-hairline rounded-control text-xs"
        />
      </label>
      <label className="block">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] mb-1">What it is for</span>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={400}
          rows={2}
          className="w-full px-2 py-1.5 bg-surface border border-hairline rounded-control text-xs resize-y"
        />
      </label>
      <label className="block">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] mb-1">Start from</span>
        <select
          value={copyFrom}
          onChange={e => setCopyFrom(e.target.value)}
          className="w-full px-2 py-1.5 bg-surface border border-hairline rounded-control text-xs"
        >
          <option value="">Nothing ticked</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              A copy of {t.name}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !name.trim()}
          className="bg-accent hover:bg-accent-hover text-ink text-xs font-medium px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create'}
        </button>
        <button type="button" onClick={onCancel} className="perm-link text-[11px]">
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * The user's rule (2026-10-08): a template saved for everybody must not
 * quietly overwrite what was set for one person — ask, person by person,
 * whether they keep theirs or go back to the template.
 */
function ResetDialog({
  templateName,
  ask,
  functions,
  before,
  after,
  pending,
  onToggle,
  onCancel,
  onConfirm,
}: {
  templateName: string
  ask: { affected: Affected[]; reset: Set<string> }
  functions: PermFunction[]
  before: Grants
  after: Grants
  pending: boolean
  onToggle: (key: string, reset: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const label = (key: string) => {
    const parsed = parseCellKey(key)
    if (!parsed) return key
    const fn = functions.find(f => f.key === parsed.fn)
    return `${fn?.label ?? parsed.fn} · ${ACTIONS.find(a => a.key === parsed.action)!.label}`
  }
  const all = ask.affected.flatMap(a => a.cells.map(c => `${a.login.userId}|${c}`))
  return (
    <div className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-center justify-center p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="People with their own permissions"
        className="bg-surface border border-hairline rounded-panel shadow-modal w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3 border-b border-hairline">
          <div className="sheet-heading">Some people have their own setting here</div>
          <p className="sheet-subtitle !mt-1">
            Saving {templateName} changes cells that {ask.affected.length === 1 ? 'one person on it has' : `${ask.affected.length} people on it have`} set
            for them alone. Keep theirs, or put them back on the template?
          </p>
          <div className="flex gap-3 mt-2 text-[11px]">
            <button type="button" className="perm-link" onClick={() => all.forEach(k => onToggle(k, false))}>
              Keep everybody’s
            </button>
            <button type="button" className="perm-link" onClick={() => all.forEach(k => onToggle(k, true))}>
              Reset everybody to the template
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <table className="ledger-table tight">
            <thead>
              <tr>
                <th>Person</th>
                <th>Cell</th>
                <th>Theirs</th>
                <th>Template now</th>
                <th className="w-[190px]">Keep or reset</th>
              </tr>
            </thead>
            <tbody>
              {ask.affected.flatMap(a =>
                a.cells.map(c => {
                  const key = `${a.login.userId}|${c}`
                  const parsed = parseCellKey(c)!
                  const reset = ask.reset.has(key)
                  return (
                    <tr key={key}>
                      <td>
                        <span className="font-medium">{a.login.name}</span>
                        <span className="block text-[11px]">{a.titleName}</span>
                      </td>
                      <td>{label(c)}</td>
                      <td className="font-mono text-[11px]">{(a.login.cells[c] ?? 'none') === 'none' ? '✕' : CELL_LABEL[a.login.cells[c]!]}</td>
                      <td className="font-mono text-[11px]">
                        {CELL_LABEL[cellOf(before, parsed.fn, parsed.action)]} → {CELL_LABEL[cellOf(after, parsed.fn, parsed.action)]}
                      </td>
                      <td>
                        <span className="inline-flex rounded-control border border-hairline overflow-hidden text-[11px]">
                          <button
                            type="button"
                            onClick={() => onToggle(key, false)}
                            aria-pressed={!reset}
                            className={`px-2.5 py-1 ${!reset ? 'bg-accent-bg font-semibold' : 'bg-surface'}`}
                          >
                            Keep theirs
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggle(key, true)}
                            aria-pressed={reset}
                            className={`px-2.5 py-1 border-l border-hairline ${reset ? 'bg-accent-bg font-semibold' : 'bg-surface'}`}
                          >
                            Reset
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-hairline bg-[rgb(var(--sheet-foot))] px-5 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="bg-accent hover:bg-accent-hover text-ink text-[13px] font-medium px-4 py-2 rounded-control transition-colors disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save template'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="bg-surface hover:bg-surface-2 border border-hairline text-[13px] px-4 py-2 rounded-control transition-colors"
          >
            Back
          </button>
          <span className="ml-auto text-[11px]">
            {ask.reset.size} of {all.length} reset
          </span>
        </div>
      </div>
    </div>
  )
}

/** Who changed what, save by save — read on demand, newest first. */
function History() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [pending, startTransition] = useTransition()

  function load() {
    setError(null)
    startTransition(async () => {
      const result = await loadPermissionHistory()
      if (result.ok) setEntries(result.entries)
      else setError(result.reason)
    })
  }

  return (
    <section>
      <div className="flex items-baseline gap-4 mb-3">
        <h2 className="m-0 text-[15px] font-bold tracking-[-0.01em] shrink-0">History</h2>
        <span className="flex-1 h-px bg-[rgb(var(--sheet-divider))] -translate-y-1" aria-hidden />
        <span className="font-mono text-[10px] tracking-[0.08em] uppercase shrink-0">
          {entries ? `${entries.length} ${entries.length === 1 ? 'SAVE' : 'SAVES'}` : 'WHO CHANGED WHAT'}
        </span>
      </div>
      {error ? <div className="sheet-danger mt-0">{error}</div> : null}
      {!entries ? (
        <button
          type="button"
          onClick={load}
          disabled={pending}
          className="bg-surface hover:bg-surface-2 border border-hairline text-xs px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
        >
          {pending ? 'Reading…' : 'Show history'}
        </button>
      ) : entries.length === 0 ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-5 text-center">
          <p className="text-sm">Nothing changed yet.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table tight">
            <thead>
              <tr>
                <th className="w-[120px]">When</th>
                <th className="w-[150px]">Who</th>
                <th>What changed</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const expanded = open.has(e.txid)
                const lines = expanded ? e.lines : e.lines.slice(0, 6)
                return (
                  <tr key={e.txid}>
                    <td className="font-mono text-[11px] whitespace-nowrap align-top" title={officeTime(e.at).format('D MMM YYYY HH:mm:ss')}>
                      {officeTime(e.at).format('D MMM YY HH:mm')}
                    </td>
                    <td className="align-top">{e.actor}</td>
                    <td className="align-top">
                      {lines.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                      {e.lines.length > 6 ? (
                        <button
                          type="button"
                          className="perm-link text-[11px] mt-1"
                          onClick={() =>
                            setOpen(s => {
                              const next = new Set(s)
                              if (next.has(e.txid)) next.delete(e.txid)
                              else next.add(e.txid)
                              return next
                            })
                          }
                        >
                          {expanded ? 'Show fewer' : `Show all ${e.lines.length}`}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
