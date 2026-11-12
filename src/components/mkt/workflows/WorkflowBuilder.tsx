'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addMktGroup, addMktWfCategory, cloneMktWorkflow, deleteMktWfCategory, deleteMktWorkflow, editMktWfCategory, publishMktWorkflow,
  renameMktWorkflow, saveMktWorkflow,
} from '@/lib/marketing/actions'
import {
  canvasForStages, duplicateStageSections, ensureStageSections, renameStageSection, stageFillCount, type WfCanvas,
} from '@/lib/marketing/canvas'
import { GIF_MAX_BYTES, GIF_TYPES } from '@/lib/marketing/flow'
import type { OptionLists } from '@/lib/marketing/options'
import type { PreviewDraft } from '@/lib/marketing/task-flow-sample'
import {
  activeNote, asRun, duplicateStage, editOf, endWhen, firstWfStage, gifPath, groupNameOf, insertWfStage, lockNote, mayApprove,
  moveWfStage, newWfStage, nextIcon, nextTemplateName, publishDiff, publishImpact, removeWfStage, timeBar, wfCategories, wfPatch,
  wfProblems, wfStagesPayload, wfWarnings, WF_MAX_STAGES, type WfBook, type WfEdit, type WfFix, type WfPerson, type WfStage, type WfTemplate,
} from '@/lib/marketing/workflows'
import { officeTime } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/client'
import BuilderFoot from './BuilderFoot'
import BuilderToast from './BuilderToast'
import CanvasEditor from './CanvasEditor'
import CtxMenu, { type CtxItem } from './CtxMenu'
import EndSettings from './EndSettings'
import FlowRow from './FlowRow'
import OverdueSettings from './OverdueSettings'
import PreviewTab from './PreviewTab'
import PublishReview from './PublishReview'
import SummaryRow from './SummaryRow'
import TemplatePicker, { PUBLISHED_STAYS, type PickTarget, type Renaming } from './TemplatePicker'
import TemplateSettings, { type Section } from './TemplateSettings'
import w from './workflows.module.css'

// The Workflow Builder 2a (`docs/design_handoff_workflow_builder/` › Workflow Builder v2 #2a; the manager's — Marketing
// · Manage): the header (the template picker with its categories, Draft vN, saved or not, the three tabs, the
// Assignment control), the summary row, the flow row of stage cards and the 🏁 Done card, the right panel (a stage's
// settings, the End settings or the Overdue settings), the foot (Preview, Save draft, Publish vN → the review).
// A draft is saved as it is typed (0.7 s, only what changed, never over somebody else's save — "Not saved · … Reload");
// Save draft saves at once. Deleting a stage, a template or a category shows Undo for 6 s: a stage is put back from
// the snapshot; a template's or a category's delete reaches the database only when the 6 s are over (or the page is
// left), so Undo has nothing to undo there — and a published template is never deleted (the user's answer 8).

type SaveState = { state: 'saved' } | { state: 'saving' } | { state: 'error'; reason: string; stale: boolean }
type Tab = 'stages' | 'canvas' | 'preview'
type Sel = number | 'end' | 'overdue'
type MenuTarget = { type: 'stage'; at: number } | PickTarget
interface Menu {
  x: number
  y: number
  target: MenuTarget
  confirm: boolean
}
interface Pending {
  kind: 'tpl' | 'cat'
  id: string
  timer: ReturnType<typeof setTimeout>
  run: () => Promise<void>
}

const UNDO_MS = 6000
const TOAST_MS = 2600

/** A template as the builder opens it: every stage with a section of its own on the canvas. */
const openEdit = (t: WfTemplate): WfEdit => {
  const e = editOf(t)
  return { ...e, canvas: ensureStageSections(e.canvas, e.stages) }
}

export default function WorkflowBuilder({
  initial,
  first,
  people,
  team,
  lists: initialLists = {},
}: {
  initial: WfBook
  /** The template to open (?w=); else the first. */
  first: string | null
  /** Marketing's roster with each one's load (shortlists, approvers, names). */
  people: WfPerson[]
  /** Marketing's roster now: whoever a version names must be on it. */
  team: string[]
  /** The shared option lists (③d-2) a choice may take its options from. */
  lists?: OptionLists
}) {
  const router = useRouter()
  const [lists, setLists] = useState<OptionLists>(initialLists)
  const [book, setBook] = useState<WfBook>(initial)
  const bookRef = useRef(book)
  bookRef.current = book
  const start = (first ? initial.templates.find(t => t.id === first) : undefined) ?? initial.templates[0] ?? null
  const [selId, setSelId] = useState<string | null>(start?.id ?? null)
  const [edit, setEdit] = useState<WfEdit | null>(start ? openEdit(start) : null)
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('stages')
  const [sel, setSel] = useState<Sel>(0)
  const [section, setSection] = useState<Section>('basics')
  const [pickOpen, setPickOpen] = useState(false)
  const [renaming, setRenaming] = useState<Renaming | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [toast, setToast] = useState<{ text: string; undo: (() => void) | null } | null>(null)
  const [pubOpen, setPubOpen] = useState(false)
  const [hidden, setHidden] = useState<string[]>([])

  // What the saves work from: the template open, the draft as typed, the draft as the database has it, its count.
  const selRef = useRef<string | null>(start?.id ?? null)
  const editRef = useRef<WfEdit | null>(edit)
  const savedRef = useRef<WfEdit | null>(edit)
  const revRef = useRef<number>(start?.rev ?? 1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Pending | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const flash = useCallback((text: string, undo: (() => void) | null = null) => {
    setToast({ text, undo })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), undo ? UNDO_MS : TOAST_MS)
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
      setBook(b => ({
        ...b,
        templates: b.templates.map(t => (t.id === id ? {
          ...t, tname: now.tname.trim() || t.tname, locked: now.locked, promise: now.promise, draft: now.stages, canvas: now.canvas,
          overdue: now.overdue, finish: now.finish, rev: r.rev, changed: true,
        } : t)),
      }))
      setSavedAt(officeTime().format('HH:mm'))
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

  /** A template's or a category's delete waiting out its Undo, carried out now. */
  const finishPending = useCallback(() => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    void p.run()
  }, [])

  // A draft still waiting is saved before the page goes, and a delete waiting out its Undo is carried out; closing
  // the tab with an unsaved draft asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || pending.current || (savedRef.current && editRef.current && wfPatch(savedRef.current, editRef.current))) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
      finishPending()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [flush, finishPending])

  // Esc closes the menus.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenu(null)
      setPickOpen(false)
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  const openTemplate = async (id: string | null, templates: WfTemplate[] = bookRef.current.templates) => {
    if (id && id === selRef.current) return true
    if (!(await flush())) {
      flash('This template is not saved — reload before opening another')
      return false
    }
    const t = id ? templates.find(x => x.id === id) : undefined
    const e = t ? openEdit(t) : null
    selRef.current = t?.id ?? null
    editRef.current = e
    savedRef.current = e
    revRef.current = t?.rev ?? 1
    setSelId(t?.id ?? null)
    setEdit(e)
    setSel(0)
    setSection('basics')
    setSave({ state: 'saved' })
    setSavedAt(null)
    // Through the router: a URL changed behind its back is put back by the next save's refresh.
    router.replace(t ? `/marketing/workflows?w=${t.id}` : '/marketing/workflows', { scroll: false })
    return true
  }

  const tpl = book.templates.find(t => t.id === selId) ?? null
  const stages = useMemo(() => edit?.stages ?? [], [edit])
  const locked = edit?.locked ?? false
  const run = useMemo(() => asRun(stages, locked), [stages, locked])
  const at = typeof sel === 'number' ? Math.min(sel, Math.max(0, stages.length - 1)) : null
  const teamSet = useMemo(() => new Set(team), [team])
  const approverSet = useMemo(() => new Set(people.filter(p => mayApprove(p.title)).map(p => p.id)), [people])
  const nameOf = useCallback((id: string) => people.find(p => p.id === id)?.first ?? 'Someone who left', [people])
  const groupName = (key: string) => groupNameOf(book.groups, key)
  const visible = wfCategories({
    categories: book.categories.filter(c => !hidden.includes(c.id)),
    templates: book.templates.filter(t => !hidden.includes(t.id) && !hidden.includes(t.categoryId)),
  })
  const category = tpl ? book.categories.find(c => c.id === tpl.categoryId) ?? null : null
  const next = (tpl?.version ?? 0) + 1
  const dirty = save.state === 'saving'
  const warnings = edit ? wfWarnings(stages, locked, edit.promise) : []
  const problems = edit ? wfProblems(stages, locked, teamSet, approverSet, edit.canvas) : []
  const changed = !!tpl?.changed || dirty
  const publishOff = !tpl || !changed || problems.length > 0 || save.state === 'error' || busy
  const publishWhy = !tpl ? undefined : !changed ? `Nothing has changed since v${tpl.version}` : problems[0] ?? (save.state === 'error' ? save.reason : undefined)

  // ── Templates and categories ───────────────────────────────────────────────────
  const withBusy = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }
  const addTemplate = (categoryId: string) => withBusy(async () => {
    const cat = book.categories.find(c => c.id === categoryId)
    if (!cat || !(await flush())) return
    const taken = book.templates.filter(t => t.categoryId === categoryId).map(t => t.tname)
    const r = await saveMktWorkflow(null, null, { category: categoryId, tname: nextTemplateName(taken), promise: 3, stages: wfStagesPayload([firstWfStage(cat.name)]) })
    if (!r.ok) return flash(r.reason)
    const b = r.book ?? book
    setBook(b)
    setPickOpen(false)
    await openTemplate(r.id, b.templates)
    flash(`New template added to “${cat.name}”`)
  })
  const clone = (id: string) => withBusy(async () => {
    const t = book.templates.find(x => x.id === id)
    if (!t || !(await flush())) return
    const r = await cloneMktWorkflow(id)
    if (!r.ok) return flash(r.reason)
    const b = r.book ?? book
    setBook(b)
    setPickOpen(false)
    await openTemplate(r.id, b.templates)
    flash(`Cloned “${t.tname}” · rename it, then publish`)
  })
  const newCategory = (name: string) => withBusy(async () => {
    if (book.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) return flash(`“${name}” already exists`)
    if (!(await flush())) return
    const r = await addMktWfCategory(name, null)
    if (!r.ok) return flash(r.reason)
    const b = r.book ?? book
    setBook(b)
    setPickOpen(false)
    await openTemplate(r.id, b.templates)
    flash(`Category “${name}” added with a Standard template`)
  })
  const rename = (target: PickTarget, name: string) => withBusy(async () => {
    if (target.type === 'tpl') {
      if (target.id === selRef.current && edit) return change({ ...edit, tname: name })
      const r = await renameMktWorkflow(target.id, name)
      if (!r.ok) return flash(r.reason)
      setBook(b => ({ ...b, templates: b.templates.map(t => (t.id === target.id ? { ...t, tname: name, rev: r.rev, changed: true } : t)) }))
      return
    }
    const r = await editMktWfCategory(target.id, { name })
    if (!r.ok) return flash(r.reason)
    if (r.book) setBook(r.book)
  })
  const changeIcon = (id: string) => withBusy(async () => {
    const cat = book.categories.find(c => c.id === id)
    if (!cat) return
    const r = await editMktWfCategory(id, { emoji: nextIcon(cat.emoji) })
    if (!r.ok) return flash(r.reason)
    if (r.book) setBook(r.book)
  })

  /** A template or a category deleted after 6 s of Undo; until then only hidden here. */
  const scheduleDelete = async (kind: 'tpl' | 'cat', id: string) => {
    finishPending()
    if (!(await flush())) return flash('This template is not saved — reload before deleting')
    const b = bookRef.current
    const gone = (t: WfTemplate) => (kind === 'tpl' ? t.id === id : t.categoryId === id)
    const label = kind === 'tpl'
      ? `template “${b.templates.find(t => t.id === id)?.tname ?? ''}”`
      : (() => {
          const n = b.templates.filter(gone).length
          return `category “${b.categories.find(c => c.id === id)?.name ?? ''}” and its ${n} template${n === 1 ? '' : 's'}`
        })()
    const wasOpen = selRef.current
    const hits = !!wasOpen && b.templates.some(t => t.id === wasOpen && gone(t))
    setHidden(h => [...h, id])
    setMenu(null)
    if (hits) {
      const rest = b.templates.filter(t => !gone(t) && !hidden.includes(t.id) && !hidden.includes(t.categoryId))
      await openTemplate(rest[0]?.id ?? null)
    }
    const unhide = () => setHidden(h => h.filter(x => x !== id))
    const runIt = async () => {
      const now = bookRef.current
      const r = kind === 'tpl' ? await deleteMktWorkflow(id, now.templates.find(t => t.id === id)?.rev ?? 1) : await deleteMktWfCategory(id)
      if (!r.ok) {
        unhide()
        flash(r.reason)
        return
      }
      setBook(cur => r.book ?? {
        ...cur,
        categories: kind === 'cat' ? cur.categories.filter(c => c.id !== id) : cur.categories,
        templates: cur.templates.filter(t => !gone(t)),
      })
      unhide()
    }
    const t = setTimeout(() => {
      if (pending.current?.id !== id) return
      pending.current = null
      void runIt()
    }, UNDO_MS)
    pending.current = { kind, id, timer: t, run: runIt }
    flash(`Deleted ${label} · active tasks keep running on their version`, () => {
      if (pending.current?.id === id) {
        clearTimeout(pending.current.timer)
        pending.current = null
      }
      unhide()
      if (hits && wasOpen) void openTemplate(wasOpen)
      flash('Restored')
    })
  }
  const deleteTemplate = (id: string) => {
    const t = book.templates.find(x => x.id === id)
    if (!t) return
    if (t.version > 0) return flash(PUBLISHED_STAYS)
    void scheduleDelete('tpl', id)
  }
  const deleteCategory = (id: string) => {
    const pub = book.templates.find(t => t.categoryId === id && t.version > 0)
    if (pub) return flash(`“${pub.tname}” was published — a published template stays, its versions are kept`)
    void scheduleDelete('cat', id)
  }

  // ── Stages ─────────────────────────────────────────────────────────────────────
  const restage = (nextStages: WfStage[], canvas?: WfCanvas) => {
    if (!edit) return
    change({ ...edit, stages: nextStages, canvas: ensureStageSections(canvasForStages(canvas ?? edit.canvas, nextStages), nextStages) })
  }
  const patchStage = (i: number, patch: Partial<WfStage>) => {
    if (!edit) return
    const s = stages[i]
    const nextStages = stages.map((x, j) => (j === i ? { ...x, ...patch } : x))
    const canvas = patch.name !== undefined && s ? renameStageSection(edit.canvas, s.sid, s.name, patch.name) : edit.canvas
    change({ ...edit, stages: nextStages, canvas })
  }
  const addStage = (i: number) => {
    if (stages.length >= WF_MAX_STAGES) return flash(`A workflow has at most ${WF_MAX_STAGES} stages`)
    restage(insertWfStage(stages, i, newWfStage(stages[Math.min(i, stages.length - 1)] ?? stages[i - 1])))
    setSel(i)
    setSection('basics')
  }
  const duplicate = (i: number) => {
    if (!edit || stages.length >= WF_MAX_STAGES) return
    const copy = duplicateStage(stages[i])
    restage(insertWfStage(stages, i + 1, copy), duplicateStageSections(edit.canvas, stages[i].sid, copy.sid, copy.name))
    setSel(i + 1)
  }
  const removeAt = (i: number) => {
    if (!edit || stages.length <= 1) return
    const snap = edit
    const name = stages[i].name || 'Untitled stage'
    restage(removeWfStage(stages, i))
    setSel(Math.max(0, Math.min(i, stages.length - 2)))
    flash(`Deleted “${name}”`, () => {
      change(snap)
      setSel(i)
      flash('Restored')
    })
  }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= stages.length) return
    restage(moveWfStage(stages, from, to))
    setSel(to)
  }
  const fix = (f: NonNullable<WfFix>) => {
    setSel(f.at)
    setSection(f.section)
  }

  // ── The right-click menu ───────────────────────────────────────────────────────
  const openMenu = (x: number, y: number, target: MenuTarget) => {
    const box = boardRef.current
    if (!box) return
    const rc = box.getBoundingClientRect()
    setMenu({
      x: Math.max(0, Math.min(x - rc.left, rc.width - 220)),
      y: Math.max(0, Math.min(y - rc.top, rc.height - 180)),
      target,
      confirm: false,
    })
    if (target.type === 'stage') setSel(target.at)
  }
  const menuItems = (m: Menu): { title: string; items: CtxItem[] } => {
    const t = m.target
    if (t.type === 'stage') {
      const one = stages.length <= 1
      return {
        title: `Stage ${t.at + 1} · ${stages[t.at]?.name || 'Untitled stage'}`,
        items: [
          { icon: '←', label: 'Add stage before', onClick: () => { setMenu(null); addStage(t.at) } },
          { icon: '→', label: 'Add stage after', onClick: () => { setMenu(null); addStage(t.at + 1) } },
          { icon: '⧉', label: 'Duplicate', onClick: () => { setMenu(null); duplicate(t.at) } },
          { icon: '✕', label: one ? 'Delete (last stage left)' : 'Delete', red: true, sep: true, disabled: one, onClick: () => { setMenu(null); removeAt(t.at) } },
        ],
      }
    }
    const confirm = (live: number, published: boolean, go: () => void): CtxItem => published
      ? { icon: '✕', label: 'Delete… · published, stays', red: true, sep: true, disabled: true, onClick: () => undefined }
      : m.confirm
        ? { icon: '✕', label: live ? `Click to confirm · ${live} active` : 'Click to confirm', red: true, sep: true, onClick: go }
        : { icon: '✕', label: 'Delete…', red: true, sep: true, onClick: () => setMenu({ ...m, confirm: true }) }
    if (t.type === 'tpl') {
      const x = book.templates.find(y => y.id === t.id)
      if (!x) return { title: '', items: [] }
      return {
        title: `${x.category} / ${x.tname}`,
        items: [
          { icon: '↗', label: 'Open', onClick: () => { setMenu(null); setPickOpen(false); void openTemplate(x.id) } },
          { icon: '✎', label: 'Rename', onClick: () => { setMenu(null); setPickOpen(true); setRenaming({ type: 'tpl', id: x.id, draft: x.id === selId ? edit?.tname ?? x.tname : x.tname }) } },
          { icon: '⧉', label: 'Clone', onClick: () => { setMenu(null); void clone(x.id) } },
          confirm(x.live, x.version > 0, () => deleteTemplate(x.id)),
        ],
      }
    }
    const cat = book.categories.find(c => c.id === t.id)
    if (!cat) return { title: '', items: [] }
    const tpls = book.templates.filter(y => y.categoryId === cat.id)
    return {
      title: cat.name,
      items: [
        { icon: '✎', label: 'Rename', onClick: () => { setMenu(null); setPickOpen(true); setRenaming({ type: 'cat', id: cat.id, draft: cat.name }) } },
        { icon: cat.emoji, label: 'Change icon', onClick: () => void changeIcon(cat.id) },
        { icon: '+', label: 'Add template', onClick: () => { setMenu(null); void addTemplate(cat.id) } },
        confirm(tpls.reduce((n, y) => n + y.live, 0), tpls.some(y => y.version > 0), () => deleteCategory(cat.id)),
      ],
    }
  }

  // ── Publishing ─────────────────────────────────────────────────────────────────
  const publish = () => withBusy(async () => {
    if (!tpl || !edit || !(await flush())) return
    const r = await publishMktWorkflow(tpl.id, revRef.current)
    if (!r.ok) return flash(r.reason)
    setBook(b => ({ ...b, templates: b.templates.map(t => (t.id === tpl.id ? { ...t, version: r.version, changed: false, live: r.live, published: { stages: run, promise: edit.promise } } : t)) }))
    setPubOpen(false)
    flash(`Published ${tpl.category} · ${edit.tname.trim() || tpl.tname} v${r.version} · new tasks use v${r.version}`)
  })
  const saveNow = async () => {
    if (!edit || !savedRef.current || (!timer.current && !wfPatch(savedRef.current, edit))) return flash('No changes to save')
    if (await flush()) flash('Draft saved · not live until you publish')
  }

  // ── The celebration GIF ────────────────────────────────────────────────────────
  const uploadGif = async (file: File): Promise<string | null> => {
    if (!(GIF_TYPES as readonly string[]).includes(file.type)) {
      flash('A GIF, WebP or APNG')
      return null
    }
    if (file.size > GIF_MAX_BYTES) {
      flash('File is over 4 MB')
      return null
    }
    const path = gifPath(file.name, crypto.randomUUID())
    const put = await (createClient() as unknown as SupabaseClient).storage.from('marketing').upload(path, file, { contentType: file.type })
    if (put.error) {
      flash(put.error.message || `${file.name} could not be uploaded.`)
      return null
    }
    flash('GIF uploaded · it plays when the task is done')
    return path
  }

  const addGroup = async (name: string): Promise<string | null> => {
    const r = await addMktGroup(name)
    if (!r.ok) {
      flash(r.reason)
      return null
    }
    setBook(b => ({ ...b, groups: [...b.groups, r.group] }))
    flash(`Group “${r.group.name}” added`)
    return r.group.key
  }

  const previewDraft: PreviewDraft | null = edit && tpl ? {
    category: tpl.category, tname: edit.tname, version: next, promise: edit.promise, overdue: edit.overdue, finish: edit.finish,
    stages: run, canvas: edit.canvas,
  } : null
  const bar = timeBar(run, edit?.promise ?? null)
  const saveLabel = save.state === 'error' ? (
    <span className={w.notSaved} role="alert">
      Not saved · {save.reason}
      {save.stale ? <button type="button" className={w.reload} onClick={() => window.location.reload()}>Reload</button> : null}
    </span>
  ) : (
    <span className={`${w.saveLabel}${dirty ? ` ${w.saveDirty}` : ''}`}>{dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt}` : 'Saved'}</span>
  )
  const m = menu ? menuItems(menu) : null

  return (
    <div
      ref={boardRef}
      className={w.board}
      onClick={() => {
        if (pickOpen) setPickOpen(false)
        if (menu) setMenu(null)
      }}
      onContextMenu={(e: MouseEvent) => {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault()
      }}
    >
      {menu && m ? <CtxMenu x={menu.x} y={menu.y} title={m.title} items={m.items} /> : null}

      <div className={w.head}>
        <span className={w.headIcon} aria-hidden="true">🧩</span>
        <span className={w.title}>Workflow Builder</span>
        <TemplatePicker
          categories={visible}
          current={tpl && edit ? { id: tpl.id, emoji: category?.emoji ?? tpl.emoji, category: category?.name ?? tpl.category, tname: edit.tname } : null}
          open={pickOpen}
          busy={busy}
          renaming={renaming}
          onToggle={() => { setMenu(null); setPickOpen(o => !o) }}
          onOpen={id => { setPickOpen(false); void openTemplate(id) }}
          onClone={id => void clone(id)}
          onDelete={deleteTemplate}
          onAddTemplate={id => void addTemplate(id)}
          onNewCategory={name => void newCategory(name)}
          onRename={(target, name) => void rename(target, name)}
          onRenaming={setRenaming}
          onMenu={(x, y, target) => openMenu(x, y, target)}
        />
        {tpl ? <span className={w.draftChip}>Draft v{next}</span> : null}
        {tpl ? saveLabel : null}
        <div className={`${w.seg} ${w.segTabs}`} role="tablist" aria-label="Template">
          {([['stages', 'Workflow stages'], ['canvas', 'Canvas template'], ['preview', '▶ Preview']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} disabled={!edit}
              className={`${w.segBtn}${tab === k ? ` ${w.segOn}` : ''}`} onClick={() => setTab(k)}>
              <span className={w.stable} data-label={label}><span>{label}</span></span>
            </button>
          ))}
        </div>
        <span className={w.grow} />
        {edit ? (
          <div className={w.assign}>
            <span className={w.assignLabel}>Assignment</span>
            <div className={w.seg} role="radiogroup" aria-label="Assignment">
              {([[false, 'Handoffs allowed', 'Stages can be 🔓 handed off and split into subtasks'], [true, '🔒 MM assigns every stage', 'No handoffs, no subtasks']] as const).map(([v, label, hint]) => (
                <button key={label} type="button" role="radio" aria-checked={locked === v} title={hint}
                  className={`${w.segBtn} ${w.segBtnSm}${locked === v ? ` ${w.segOn}` : ''}`}
                  onClick={() => {
                    if (locked === v) return
                    change({ ...edit, locked: v })
                    flash(v ? 'MM now assigns every stage' : 'Handoffs and subtasks are back on')
                  }}>
                  <span className={w.stable} data-label={label}><span>{label}</span></span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {!edit || !tpl ? (
        <div className={w.empty}>{visible.length ? 'Pick a template' : 'No workflows yet — + New category in the picker'}</div>
      ) : tab === 'canvas' ? (
        <CanvasEditor
          title={`${tpl.category} · ${edit.tname.trim() || tpl.tname}`}
          version={next}
          stages={stages}
          canvas={edit.canvas}
          people={people}
          onCanvas={canvas => change({ ...edit, canvas })}
          lists={lists}
          onList={(name, opts) => setLists(l => ({ ...l, [name]: opts }))}
          say={text => flash(text)}
        />
      ) : tab === 'preview' && previewDraft ? (
        <PreviewTab draft={previewDraft} people={people.map(p => ({ id: p.id, first: p.first, group: p.title }))} />
      ) : (
        <div className={w.stagesGrid}>
          <div className={w.left}>
            <SummaryRow
              stages={run}
              groups={book.groups}
              promise={edit.promise}
              overdue={edit.overdue}
              overdueOn={sel === 'overdue'}
              warnings={warnings}
              selected={at}
              lockNote={locked ? lockNote(stages) : null}
              onPromise={n => change({ ...edit, promise: n })}
              onOverdue={() => setSel('overdue')}
              onFix={fix}
              onSelect={i => setSel(i)}
            />
            <FlowRow
              stages={run}
              selected={at}
              endOn={sel === 'end'}
              finish={edit.finish}
              groups={book.groups}
              people={people}
              nameOf={nameOf}
              onSelect={(i, s) => {
                setSel(i)
                if (s) setSection(s)
              }}
              onMenu={(x, y, i) => openMenu(x, y, { type: 'stage', at: i })}
              onEnd={() => setSel('end')}
            />
          </div>
          <div className={w.right}>
            {sel === 'overdue' ? (
              <OverdueSettings cfg={edit.overdue} onChange={overdue => change({ ...edit, overdue })} />
            ) : sel === 'end' ? (
              <EndSettings
                finish={edit.finish}
                category={tpl.category}
                doneWhen={endWhen(run, nameOf)}
                onChange={finish => change({ ...edit, finish })}
                onUpload={uploadGif}
                onPreview={() => setTab('preview')}
              />
            ) : at !== null && stages[at] ? (
              <TemplateSettings
                key={stages[at].sid}
                stage={stages[at]}
                at={at}
                stages={stages}
                locked={locked}
                section={section}
                startDay={bar.starts[at] ?? 0}
                groups={book.groups}
                people={people}
                fills={stageFillCount(edit.canvas, stages[at].sid)}
                nameOf={nameOf}
                onSection={setSection}
                onPatch={p => patchStage(at, p)}
                onRemove={stages.length > 1 ? () => removeAt(at) : null}
                onMove={to => move(at, to)}
                onOpenCanvas={() => setTab('canvas')}
                onAddGroup={addGroup}
              />
            ) : null}
          </div>
        </div>
      )}

      {edit && tpl ? (
        <BuilderFoot
          problems={problems}
          activeNote={activeNote(tpl.version, tpl.live)}
          next={next}
          dirty={dirty}
          publishOff={publishOff}
          publishWhy={publishWhy}
          onPreview={() => setTab('preview')}
          onSave={() => void saveNow()}
          onPublish={() => setPubOpen(true)}
        />
      ) : null}

      {pubOpen && tpl && edit ? (
        <PublishReview
          title={`Publish v${next} · ${tpl.category} / ${edit.tname.trim() || tpl.tname}`}
          sub={tpl.version ? `Compared with v${tpl.version}, the version running now` : 'First version of this template'}
          changes={publishDiff(tpl.published, { stages: run, promise: edit.promise }, nameOf, groupName)}
          impact={publishImpact(tpl.version, tpl.live)}
          warnings={warnings.map(x => x.text)}
          next={next}
          busy={busy || publishOff}
          onCancel={() => setPubOpen(false)}
          onPublish={() => void publish()}
        />
      ) : null}

      {toast ? <BuilderToast text={toast.text} onUndo={toast.undo} /> : null}
    </div>
  )
}
