'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { officeTime } from '@/lib/office-time'
import {
  SENSITIVE_FIELDS,
  type SensitiveField,
  describeExceptions,
  initialsOf,
  sameSensitive,
  sodWarnings,
} from '@/lib/permission-matrix'
import {
  TAB_VIEWS,
  grantsOfTicks,
  sameTicks,
  templateTicks,
  toggleBox,
  toggleRow,
  viewCount,
  type TabAction,
  type TabView,
} from '@/lib/permission-tabs'
import type { HistoryEntry } from '@/lib/permission-history'
import { btn, hv } from '@/components/hrv/kit'
import type { PermissionsData, TemplateLogin, TemplateRecord, TemplateTitle } from '../../_lib/permission-templates'
import TabMatrix from '../../_components/TabMatrix'
import { copyTemplate, deleteTemplate, loadPermissionHistory, saveTemplateTabs, setTitleTemplate } from '../permission-actions'
import p from './permissions.module.css'
import { Select } from '@/components/hrv/select'

interface Props {
  data: PermissionsData
  /** accounts.manage — everything here is read-only without it. */
  canManage: boolean
  /** Whether the reader may open the history (permissions_manage or audit_log). */
  canSeeHistory: boolean
  initialTemplateId: string | null
  onNotice: (message: string) => void
}

type Draft = { ticks: Set<string>; sensitive: SensitiveField[] }

/** The view a template opens on: the first it has a tab of, else the HR view. */
function firstView(ticks: ReadonlySet<string>): TabView {
  return TAB_VIEWS.find(v => viewCount(v.id, ticks).seen > 0)?.id ?? 'hr'
}

/**
 * People Management › Permissions (2026-10-11, the HR revamp — the user's
 * choice B): a title's template, ticked view by view and tab by tab — View,
 * Create, Edit, Approve — as the handoff draws it: the template picked at the
 * top with Delete and "+ New template" (a copy of the one open), the views on
 * the left, their tabs on the right, Save at the foot. The cells the database
 * asks for are worked out from the ticks on the server (lib/permission-tabs).
 *
 * Kept below the handoff's drawing because nothing else does them: the three
 * sensitive fields, which titles use the template, and who changed what.
 */
export default function PermissionTemplates({ data, canManage, canSeeHistory, initialTemplateId, onNotice }: Props) {
  const router = useRouter()
  const { templates, titles, logins, cellKeys, functions } = data
  const [selectedId, setSelectedId] = useState<string | null>(
    initialTemplateId && templates.some(t => t.id === initialTemplateId) ? initialTemplateId : (templates[0]?.id ?? null),
  )
  const template = templates.find(t => t.id === selectedId) ?? null
  const saved = useMemo(() => (template ? templateTicks(template, cellKeys) : new Set<string>()), [template, cellKeys])
  const [view, setView] = useState<TabView>(() => firstView(saved))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [mode, setMode] = useState<'idle' | 'adding' | 'deleting'>('idle')
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ticks = draft?.ticks ?? saved
  const sensitive = draft?.sensitive ?? template?.sensitive ?? []
  const dirty = !!template && !!draft && (!sameTicks(draft.ticks, saved) || !sameSensitive(draft.sensitive, template.sensitive))
  const warnings = useMemo(() => sodWarnings(grantsOfTicks(ticks), functions), [ticks, functions])

  const titlesOf = (id: string) => titles.filter(t => t.templateId === id)
  const peopleOn = (id: string) => titlesOf(id).reduce((n, t) => n + t.people, 0)

  function pick(id: string) {
    if (id === selectedId) return
    if (dirty && !window.confirm(`Discard your changes to ${template?.name}?`)) return
    const next = templates.find(t => t.id === id)
    setSelectedId(id)
    setDraft(null)
    setMode('idle')
    setError(null)
    if (next) setView(firstView(templateTicks(next, cellKeys)))
  }

  function edit(next: (d: Draft) => Draft) {
    if (!template || !canManage) return
    setDraft(d => next(d ?? { ticks: saved, sensitive: template.sensitive }))
  }

  function onSave() {
    if (!template || !draft || !dirty || pending) return
    setError(null)
    startTransition(async () => {
      const result = await saveTemplateTabs({ templateId: template.id, version: template.version, tabs: [...draft.ticks], sensitive: draft.sensitive })
      if (!result.ok) return setError(result.reason)
      setDraft(null)
      onNotice(`${template.name} saved — applies to ${result.titles} ${result.titles === 1 ? 'title' : 'titles'} at once.`)
      router.refresh()
    })
  }

  function onCreate() {
    if (!template || pending || !newName.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await copyTemplate({ name: newName, from: template.id })
      if (!result.ok) return setError(result.reason)
      setMode('idle')
      setNewName('')
      setSelectedId(result.id)
      setDraft(null)
      onNotice(`${newName.trim()} created as a copy of ${template.name}. Point titles at it below.`)
      router.refresh()
    })
  }

  function onDelete() {
    if (!template || pending) return
    setError(null)
    startTransition(async () => {
      const result = await deleteTemplate({ templateId: template.id, version: template.version })
      if (!result.ok) return setError(result.reason)
      const rest = templates.filter(t => t.id !== template.id)
      setMode('idle')
      setSelectedId(rest[0]?.id ?? null)
      setDraft(null)
      onNotice(`Template ${template.name} deleted.`)
      router.refresh()
    })
  }

  function moveTitle(title: TemplateTitle, templateId: string) {
    setError(null)
    startTransition(async () => {
      const result = await setTitleTemplate(title.id, templateId || null)
      if (!result.ok) return setError(result.reason)
      const to = templates.find(t => t.id === templateId)
      onNotice(to ? `${title.name} now follows ${to.name}.` : `${title.name} has no template now — its holders fall back to their account’s old role.`)
      router.refresh()
    })
  }

  if (!template) {
    return (
      <div className={hv.gtEmpty}>No permission templates yet.</div>
    )
  }

  const onTemplate = titlesOf(template.id)
  const unassigned = titles.filter(t => !t.templateId)
  const blockers = onTemplate.length

  return (
    <div className={p.wrap}>
      {error ? <div className={p.error} role="alert">{error}</div> : null}
      <div className={p.top}>
        <span className={p.topLabel}>Title template</span>
        <Select bare className={p.select} value={template.id} onChange={e => pick(e.target.value)} aria-label="Title template">
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        <span className={p.topLabel}>{templates.length} templates</span>
        <span className={p.spacer} />
        {canManage && mode === 'adding' ? (
          <span className={p.inline}>
            <input className={p.newName} value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} autoFocus
              placeholder="Template name, e.g. Area Manager" aria-label="New template's name"
              onKeyDown={e => { if (e.key === 'Enter') onCreate(); if (e.key === 'Escape') setMode('idle') }} />
            <span className={p.copies}>copies {template.name}</span>
            <button type="button" className={p.ghost} onClick={() => { setMode('idle'); setNewName('') }}>Cancel</button>
            <button type="button" className={p.primary} onClick={onCreate} disabled={pending || !newName.trim()}>{pending ? 'Creating…' : 'Create'}</button>
          </span>
        ) : null}
        {canManage && mode === 'deleting' ? (
          <span className={p.inline}>
            <span className={p.confirm}>
              {blockers > 0
                ? `${template.name} is on ${blockers} ${blockers === 1 ? 'title' : 'titles'} (${peopleOn(template.id)} people) — move ${blockers === 1 ? 'it' : 'them'} to another template first.`
                : `Delete ${template.name}?`}
            </span>
            <button type="button" className={p.ghost} onClick={() => setMode('idle')}>Keep</button>
            {blockers === 0 ? <button type="button" className={p.danger} onClick={onDelete} disabled={pending}>Delete</button> : null}
          </span>
        ) : null}
        {canManage && mode === 'idle' ? (
          <>
            <button type="button" className={p.deleteBtn} title="Delete this template" onClick={() => setMode('deleting')} disabled={templates.length <= 1}>Delete</button>
            <button type="button" className={p.ghostWide} onClick={() => setMode('adding')}>+ New template</button>
          </>
        ) : null}
      </div>
      <div className={p.lede}>
        Everyone holding <b>{template.name}</b> gets these, unless their own Permissions tab overrides one.
      </div>

      <TabMatrix
        ticks={ticks}
        view={view}
        onView={setView}
        canEdit={canManage}
        onToggle={(tabId, action: TabAction) => edit(d => ({ ...d, ticks: toggleBox(d.ticks, tabId, action) }))}
        onRow={tabId => edit(d => ({ ...d, ticks: toggleRow(d.ticks, tabId) }))}
      />

      <div className={p.foot}>
        <span className={p.footNote}>
          {dirty ? `Unsaved changes to ${template.name}` : `Applies to everyone holding ${template.name}`}
        </span>
        {canManage ? (
          <span className={p.footActions}>
            {dirty ? <button type="button" className={p.ghost} onClick={() => setDraft(null)} disabled={pending}>Discard</button> : null}
            <button type="button" className={p.primary} onClick={onSave} disabled={!dirty || pending}>{pending && dirty ? 'Saving…' : 'Save'}</button>
          </span>
        ) : (
          <span className={p.footNote}>Read-only — only whoever manages permissions changes a template.</span>
        )}
      </div>

      {warnings.length > 0 ? (
        <div className={p.warn}>
          <b>Maker and checker in one template.</b> {warnings.join(' ')}
        </div>
      ) : null}

      <section className={p.section}>
        <div className={p.sectHead}>
          <h2 className={p.h2}>Sensitive fields</h2>
          <span className={p.sectNote}>Hidden as •••• unless ticked, on every page this template can open</span>
        </div>
        <div className={p.sensitive}>
          {SENSITIVE_FIELDS.map(f => (
            <label key={f.key} className={p.sensItem}>
              <input
                type="checkbox"
                checked={sensitive.includes(f.key)}
                disabled={!canManage}
                onChange={() => edit(d => ({ ...d, sensitive: d.sensitive.includes(f.key) ? d.sensitive.filter(x => x !== f.key) : [...d.sensitive, f.key] }))}
              />
              <span>
                <span className={p.sensLabel}>{f.label}</span>
                <span className={p.sensNote}>{f.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <TitlesTable heading="Titles on this template" titles={onTemplate} logins={logins} templates={templates} canManage={canManage} pending={pending} onMove={moveTitle} />
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
    <section className={p.section}>
      <div className={p.sectHead}>
        <h2 className={p.h2}>{heading}</h2>
        <span className={p.sectCount}>{people} {people === 1 ? 'PERSON' : 'PEOPLE'}</span>
      </div>
      {note ? <p className={p.sectNote}>{note}</p> : null}
      {titles.length === 0 ? (
        <div className={hv.gtEmpty}>No title uses this template yet.</div>
      ) : (
        <div className="table-scroll">
          <table className="ledger-table tight">
            <thead>
              <tr>
                <th>Title</th>
                <th>Department</th>
                <th className="text-right w-[80px]">People</th>
                <th>Their own boxes</th>
                <th className="w-[210px]">Template</th>
              </tr>
            </thead>
            <tbody>
              {titles.map(t => {
                const own = logins
                  .filter(l => l.titleId === t.id && (l.boxes.length > 0 || Object.keys(l.cells).length > 0))
                  .map(l => (l.boxes.length ? `${initialsOf(l.name)} · ${l.boxes.length}` : describeExceptions(initialsOf(l.name), l.cells).join(', ')))
                return (
                  <tr key={t.id}>
                    <td>
                      <span className="font-medium">{t.name}</span>
                      {t.levelRank !== null ? <span className="font-mono text-[10px] ml-1.5">L{t.levelRank}</span> : null}
                    </td>
                    <td>{t.departmentName ?? '—'}</td>
                    <td className="num">{t.people}</td>
                    <td className="font-mono text-[11px]">{own.length > 0 ? own.join(', ') : '—'}</td>
                    <td>
                      <Select bare
                        key={t.templateId ?? 'none'}
                        defaultValue={t.templateId ?? ''}
                        disabled={!canManage || pending}
                        onChange={e => onMove(t, e.target.value)}
                        aria-label={`Template for ${t.name}`}
                        className={p.titleSelect}
                      >
                        {t.templateId ? null : <option value="">— None yet</option>}
                        {templates.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </Select>
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
    <section className={p.section}>
      <div className={p.sectHead}>
        <h2 className={p.h2}>History</h2>
        <span className={p.sectCount}>{entries ? `${entries.length} ${entries.length === 1 ? 'SAVE' : 'SAVES'}` : 'WHO CHANGED WHAT'}</span>
      </div>
      {error ? <div className={p.error}>{error}</div> : null}
      {!entries ? (
        <button type="button" onClick={load} disabled={pending} className={btn('outline')}>
          {pending ? 'Reading…' : 'Show history'}
        </button>
      ) : entries.length === 0 ? (
        <div className={hv.gtEmpty}>Nothing changed yet.</div>
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
                      {lines.map((l, i) => <div key={i}>{l}</div>)}
                      {e.lines.length > 6 ? (
                        <button
                          type="button"
                          className={p.link}
                          onClick={() => setOpen(s => {
                            const next = new Set(s)
                            if (next.has(e.txid)) next.delete(e.txid)
                            else next.add(e.txid)
                            return next
                          })}
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
