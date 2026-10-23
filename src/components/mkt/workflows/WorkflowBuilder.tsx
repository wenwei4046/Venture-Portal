'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cloneMktWorkflow, deleteMktWorkflow, publishMktWorkflow, saveMktWorkflow } from '@/lib/marketing/actions'
import { canvasProblems, canvasRemap, stageMap } from '@/lib/marketing/canvas'
import { sameGroup } from '@/lib/marketing/groups'
import { moveStage, removeStage } from '@/lib/marketing/tasks'
import {
  asRun, firstWfStage, newWfStage, nextTemplateName, picTimes, totalDays, wfActions, wfApprText, wfPatch, wfProblems, wfStagesPayload,
  wfWarnings, wfWhoText, WF_MAX_PROMISE, WF_MAX_STAGES, type WfEdit, type WfStage, type WfTemplate,
} from '@/lib/marketing/workflows'
import type { BuilderPerson } from '../builder/people'
import DeleteDraft from '../builder/DeleteDraft'
import StageList, { Fact } from '../builder/StageList'
import CanvasEditor from './CanvasEditor'
import TemplateSettings from './TemplateSettings'
import b from '../builder/builder.module.css'
import w from './workflows.module.css'

// The Workflow Builder (`Workflow Builder.dc.html`, not quick; the manager's — Marketing · Manage): the actions down the
// left, each with its templates (+ Add template, Clone, + a new action); the template's stages in the middle (drag to
// move them, + Add stage) with the lock over the whole workflow; the stage's settings on the right; at the foot the
// total, how often the PIC approves, the product's promise, the warnings, the projects that stay on the version they
// started on, and Publish. A draft is saved as it is typed — only what changed, never over somebody else's save. A
// template never published may be deleted (the user's answer 8, 2026-10-24), asked first.

type SaveState = { state: 'saved' } | { state: 'saving' } | { state: 'error'; reason: string; stale: boolean }

const editOf = (t: WfTemplate): WfEdit => ({ tname: t.tname, locked: t.locked, promise: t.promise, stages: t.draft, canvas: t.canvas })
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
/** "12 active tasks stay on v2" */
const stayOn = (n: number, version: number) => `${n} active task${n === 1 ? ' stays' : 's stay'} on v${version}`

export default function WorkflowBuilder({
  initial,
  first,
  people,
  approvers,
  team,
}: {
  initial: WfTemplate[]
  /** The template to open (?w=); else the first. */
  first: string | null
  people: BuilderPerson[]
  approvers: BuilderPerson[]
  /** Marketing's roster now: whoever a version names must be on it. */
  team: string[]
}) {
  const router = useRouter()
  const start = (first ? initial.find(t => t.id === first) : undefined) ?? initial[0] ?? null
  const [wfs, setWfs] = useState<WfTemplate[]>(initial)
  const [selId, setSelId] = useState<string | null>(start?.id ?? null)
  const [edit, setEdit] = useState<WfEdit | null>(start ? editOf(start) : null)
  const [stageAt, setStageAt] = useState(0)
  const [tab, setTab] = useState<'stages' | 'canvas'>('stages')
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [actOpen, setActOpen] = useState(initial.length === 0)
  const [actDraft, setActDraft] = useState('')

  // What the saves work from: the template open, the draft as typed, the draft as the database has it, its count.
  const selRef = useRef<string | null>(start?.id ?? null)
  const editRef = useRef<WfEdit | null>(start ? editOf(start) : null)
  const savedRef = useRef<WfEdit | null>(start ? editOf(start) : null)
  const revRef = useRef<number>(start?.rev ?? 1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((words: string) => {
    setToast(words)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  /** Every save waiting, made now and in turn; true when the draft open is as the database has it. */
  const flush = useCallback((): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const run = chain.current.then(async () => {
      const id = selRef.current
      const now = editRef.current
      const saved = savedRef.current
      if (!id || !now || !saved) return true
      const patch = wfPatch(saved, now)
      // Nothing left to send (a change and its undo before the save went): what is on screen is what is kept.
      if (!patch) {
        setSave(s => (s.state === 'error' ? s : { state: 'saved' }))
        return true
      }
      setSave({ state: 'saving' })
      const r = await saveMktWorkflow(id, revRef.current, patch)
      if (!r.ok) {
        setSave({ state: 'error', reason: r.reason, stale: /since you opened it/.test(r.reason) })
        return false
      }
      revRef.current = r.rev
      savedRef.current = now
      setWfs(list => list.map(t => (t.id === id ? { ...t, tname: now.tname.trim() || t.tname, locked: now.locked, promise: now.promise, draft: now.stages, canvas: now.canvas, rev: r.rev, changed: true } : t)))
      if (editRef.current === now) setSave({ state: 'saved' })
      return true
    })
    chain.current = run.catch(() => false)
    return run
  }, [])

  const change = (next: WfEdit) => {
    editRef.current = next
    setEdit(next)
    if (save.state === 'error' && save.stale) return // somebody saved since: nothing more is sent until it is reloaded
    setSave({ state: 'saving' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }

  // A draft still waiting is saved before the page goes; closing the tab with one asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || (savedRef.current && editRef.current && wfPatch(savedRef.current, editRef.current))) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [flush])

  const open = async (id: string, list: WfTemplate[] = wfs) => {
    if (id === selRef.current) return
    if (!(await flush())) {
      flash('This template is not saved — reload before opening another')
      return
    }
    const t = list.find(x => x.id === id)
    if (!t) return
    const e = editOf(t)
    selRef.current = id
    editRef.current = e
    savedRef.current = e
    revRef.current = t.rev
    setSelId(id)
    setEdit(e)
    setStageAt(0)
    setSave({ state: 'saved' })
    // Through the router: a URL changed behind its back is put back by the next save's refresh.
    router.replace(`/marketing/workflows?w=${id}`, { scroll: false })
  }

  const create = async (action: string, tname: string, emoji: string | null, done: string) => {
    if (busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await saveMktWorkflow(null, null, { action, tname, ...(emoji ? { emoji } : {}), stages: wfStagesPayload([firstWfStage(action)]) })
      if (!r.ok) return flash(r.reason)
      const list = r.workflows ?? wfs
      setWfs(list)
      await open(r.id, list)
      flash(done)
    } finally {
      setBusy(false)
    }
  }

  const addAction = async () => {
    const name = actDraft.trim()
    if (!name) return
    const had = wfs.find(t => t.action.toLowerCase() === name.toLowerCase())
    if (had) {
      setActDraft('')
      setActOpen(false)
      await open(had.id)
      return flash(`“${had.action}” is there already`)
    }
    await create(name, 'Standard', null, `Action “${name}” created with a Standard template`)
    setActDraft('')
    setActOpen(false)
  }

  const clone = async (t: WfTemplate) => {
    if (busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await cloneMktWorkflow(t.id)
      if (!r.ok) return flash(r.reason)
      const list = r.workflows ?? wfs
      setWfs(list)
      await open(r.id, list)
      flash(`Cloned “${t.tname}” · rename it, then publish`)
    } finally {
      setBusy(false)
    }
  }

  const sel = wfs.find(t => t.id === selId) ?? null
  const stages = edit?.stages ?? []
  const locked = edit?.locked ?? false
  const at = Math.min(stageAt, Math.max(0, stages.length - 1))
  const run = asRun(stages, locked)
  const teamSet = useMemo(() => new Set(team), [team])
  const problems = edit ? [...wfProblems(stages, locked, teamSet), ...canvasProblems(stages, edit.canvas)] : []
  const warnings = edit ? [...new Set([...wfWarnings(stages, locked, edit.promise), ...problems])] : []
  const next = (sel?.version ?? 0) + 1
  // Something new since the last version: saved since, or being saved now (Publish saves it first).
  const changed = !!sel?.changed || save.state === 'saving'
  const nameOf = (staff: string) => people.find(p => p.id === staff)?.first ?? approvers.find(p => p.id === staff)?.first ?? 'Someone who left'

  const setStages = (nextStages: WfStage[]) => edit && change({ ...edit, stages: nextStages })
  // A stage moved or taken out: the canvas's sections and fields follow it.
  const restage = (nextStages: WfStage[]) => edit && change({ ...edit, stages: nextStages, canvas: canvasRemap(edit.canvas, stageMap(stages, nextStages)) })
  const updStage = (patch: Partial<WfStage>) => setStages(stages.map((s, i) => (i === at ? { ...s, ...patch } : s)))
  /** Whom the canvas's staff view is drawn for at a stage: the first of its group. */
  const nameAt = (i: number) => people.find(p => sameGroup(p.group, stages[i]?.dept))?.first ?? 'the team'

  const publish = async () => {
    if (!sel || !edit || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await publishMktWorkflow(sel.id, revRef.current)
      if (!r.ok) return flash(r.reason)
      setWfs(list => list.map(t => (t.id === sel.id ? { ...t, version: r.version, changed: false, live: r.live } : t)))
      const stay = r.version > 1 ? `, ${stayOn(r.live, r.version - 1)}` : ''
      flash(`Published ${sel.action} · ${edit.tname.trim() || sel.tname} v${r.version} · new tasks use v${r.version}${stay}`)
    } finally {
      setBusy(false)
    }
  }
  /** A template never published, deleted — the next one opens (or none is left). */
  const remove = async () => {
    if (!sel || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await deleteMktWorkflow(sel.id, revRef.current)
      if (!r.ok) return flash(r.reason)
      const list = r.workflows ?? wfs.filter(t => t.id !== sel.id)
      setWfs(list)
      selRef.current = null
      editRef.current = null
      savedRef.current = null
      setSelId(null)
      setEdit(null)
      if (list[0]) await open(list[0].id, list)
      else router.replace('/marketing/workflows', { scroll: false })
      flash(`Deleted “${sel.action} · ${sel.tname}”`)
    } finally {
      setBusy(false)
    }
  }
  const publishOff = !sel || !changed || problems.length > 0 || save.state === 'error' || busy
  const publishWhy = !sel ? undefined : !changed ? `Nothing has changed since v${sel.version}` : problems[0] ?? (save.state === 'error' ? save.reason : undefined)

  return (
    <div className={w.page}>
      <div className={w.head}>
        <span className={w.headIcon} aria-hidden="true">🧩</span>
        <span className={w.title}>Workflow Builder</span>
        <div className={b.wbTabs} role="tablist" aria-label="Template">
          <button type="button" role="tab" aria-selected={tab === 'stages'} className={`${b.wbTab}${tab === 'stages' ? ` ${b.wbTabOn}` : ''}`} onClick={() => setTab('stages')}>Workflow stages</button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'canvas'}
            className={`${b.wbTab}${tab === 'canvas' ? ` ${b.wbTabOn}` : ''}${sel && edit ? '' : ` ${b.wbTabOff}`}`}
            disabled={!sel || !edit}
            onClick={() => setTab('canvas')}
          >
            Canvas template
          </button>
        </div>
        <span className={w.grow} />
        {edit ? (
          <button
            type="button"
            role="switch"
            aria-checked={locked}
            className={`${w.lock}${locked ? ` ${w.lockOn}` : ''}`}
            onClick={() => change({ ...edit, locked: !locked })}
          >
            <span className={w.lockTrack}><span className={w.lockKnob} /></span>
            <span>🔒 Lock whole workflow</span>
          </button>
        ) : null}
      </div>

      {tab === 'canvas' && sel && edit ? (
        <CanvasEditor
          title={`${sel.action} · ${edit.tname.trim() || sel.tname}`}
          version={next}
          stages={stages}
          canvas={edit.canvas}
          saveState={save.state === 'error' ? (
            <span className={w.notSaved} role="alert">
              Not saved · {save.reason}
              {save.stale ? <button type="button" className={w.reload} onClick={() => window.location.reload()}>Reload</button> : null}
            </span>
          ) : (
            <span className={w.saved}>{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
          )}
          nameAt={nameAt}
          onStages={setStages}
          onCanvas={canvas => change({ ...edit, canvas })}
          onEditStage={i => {
            setStageAt(i)
            setTab('stages')
          }}
        />
      ) : (
      <div className={w.grid}>
        <nav className={w.actions} aria-label="Actions">
          <div className={w.actHead}>
            <span className={w.actLabel}>Actions</span>
            <button type="button" className={w.actPlus} title="New action" aria-label="New action" onClick={() => { setActOpen(o => !o); setActDraft('') }}>+</button>
          </div>
          {actOpen ? (
            <div className={w.actAdd}>
              <input
                className={w.actInput}
                value={actDraft}
                autoFocus
                maxLength={60}
                placeholder="New action, e.g. Design photo"
                aria-label="New action"
                onChange={e => setActDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void addAction()
                  if (e.key === 'Escape') {
                    setActOpen(false)
                    setActDraft('')
                  }
                }}
              />
              <button type="button" className={w.actGo} disabled={!actDraft.trim() || busy} onClick={() => void addAction()}>Add</button>
            </div>
          ) : null}
          {wfActions(wfs).map(a => (
            <div key={a.action} className={w.act}>
              <div className={w.actRow}>
                <span className={w.actEmoji} aria-hidden="true">{a.emoji}</span>
                <span className={w.actName}>{a.action}</span>
                <span className={w.actCount}>{a.templates.length}</span>
              </div>
              {a.templates.map(t => {
                const on = t.id === selId
                const count = on ? stages.length : t.draft.length
                return (
                  <div key={t.id} className={`${w.tpl}${on ? ` ${w.tplOn}` : ''}`}>
                    <button type="button" className={w.tplPick} aria-current={on ? 'true' : undefined} onClick={() => void open(t.id)}>
                      <span className={w.tplName}>{on ? edit?.tname || t.tname : t.tname}</span>
                      <span className={w.tplMeta}>{t.version ? `v${t.version}` : 'draft'} · {plural(count, 'stage')}</span>
                    </button>
                    <button type="button" className={w.clone} title="Clone as a new template of this action" disabled={busy} onClick={() => void clone(t)}>Clone</button>
                  </div>
                )
              })}
              <button
                type="button"
                className={w.addTpl}
                disabled={busy}
                onClick={() => void create(a.action, nextTemplateName(a.templates.map(t => t.tname)), a.emoji, `New template added to “${a.action}”`)}
              >
                + Add template
              </button>
            </div>
          ))}
        </nav>

        <div className={w.center}>
          {sel && edit ? (
            <>
              <div className={w.tplHead}>
                <span className={w.actTitle}>{sel.action}</span>
                <span className={w.slash}>/</span>
                <input className={w.tname} value={edit.tname} maxLength={60} aria-label="Template name" onChange={e => change({ ...edit, tname: e.target.value })} />
                <span className={w.ver}>Draft v{next}</span>
                {save.state === 'error' ? (
                  <span className={w.notSaved} role="alert">
                    Not saved · {save.reason}
                    {save.stale ? <button type="button" className={w.reload} onClick={() => window.location.reload()}>Reload</button> : null}
                  </span>
                ) : (
                  <span className={w.saved}>{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
                )}
                {sel.note ? <span className={w.note}>{sel.note}</span> : null}
              </div>
              {locked ? <div className={w.lockNote}>Whole workflow locked — every stage is assigned by the manager. No 🔓 handoffs, no subtasks.</div> : null}
              <div className={w.stages}>
                <StageList
                  stages={stages}
                  selected={at}
                  onSelect={setStageAt}
                  onMove={(from, to) => {
                    restage(moveStage(stages, from, to))
                    setStageAt(to)
                  }}
                  onAdd={stages.length < WF_MAX_STAGES ? () => {
                    setStages([...stages, newWfStage(stages[stages.length - 1])])
                    setStageAt(stages.length)
                  } : null}
                  facts={(_, i) => {
                    const x = run[i]
                    return (
                      <>
                        <Fact k="Who">{wfWhoText(x, nameOf)}</Fact>
                        <Fact k="SLA" mono>{x.sla}d</Fact>
                        <Fact k="Approval">{wfApprText(x.appr, nameOf)}</Fact>
                        <Fact k="Subtasks">{x.split ? '✓' : '✗'}</Fact>
                      </>
                    )
                  }}
                />
              </div>
            </>
          ) : (
            <div className={w.empty}>{wfs.length ? 'Pick a template' : 'No workflows yet'}</div>
          )}
        </div>

        <aside className={w.side} aria-label="Stage settings">
          {edit && stages[at] ? (
            <TemplateSettings
              key={stages[at].key}
              stage={stages[at]}
              at={at}
              stages={stages}
              locked={locked}
              people={people}
              approvers={approvers}
              nameOf={nameOf}
              onChange={updStage}
              onRemove={() => {
                restage(removeStage(stages, at))
                setStageAt(Math.max(0, at - 1))
              }}
            />
          ) : (
            <div className={b.wbEmptyPanel}>{edit ? 'Add a stage' : ''}</div>
          )}
        </aside>
      </div>
      )}

      {sel && edit ? (
        <div className={b.wbFoot}>
          <span className={b.wbFootItem}><span className={b.wbFootK}>Total</span> <strong className={b.wbFootV}>{plural(totalDays(run), 'working day')}</strong></span>
          <span className={b.wbFootRule} />
          <span className={b.wbFootItem}><span className={b.wbFootK}>PIC approves</span> <strong className={b.wbFootV}>{picTimes(run)}×</strong></span>
          <span className={b.wbFootRule} />
          <label className={b.wbFootItem}>
            <span className={b.wbFootK}>Product promise</span>{' '}
            <input
              className={w.promise}
              type="number"
              inputMode="numeric"
              min={1}
              max={WF_MAX_PROMISE}
              value={edit.promise ?? ''}
              placeholder="—"
              aria-label="Product promise, working days"
              onChange={e => {
                const n = e.target.value === '' ? null : Math.trunc(Number(e.target.value))
                if (n === null || (Number.isFinite(n) && n >= 1 && n <= WF_MAX_PROMISE)) change({ ...edit, promise: n })
              }}
            />{' '}
            <strong className={b.wbFootV}>days</strong>
          </label>
          {warnings.map(x => <span key={x} className={b.wbWarn}>⚠️ {x}</span>)}
          {warnings.length ? null : <span className={b.wbNoWarn}>No warnings</span>}
          <span className={w.grow} />
          {sel.version
            ? <span className={w.live}>{stayOn(sel.live, sel.version)}</span>
            : <DeleteDraft key={sel.id} what="template" busy={busy} onDelete={() => void remove()} />}
          <button type="button" className={w.publish} disabled={publishOff} title={publishWhy} onClick={() => void publish()}>Publish v{next}</button>
        </div>
      ) : null}

      {toast ? <div className={w.toast} role="status">{toast}</div> : null}
    </div>
  )
}
