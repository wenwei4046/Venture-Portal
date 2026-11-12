'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteMktMinutes, deleteMktMinutesFolder, discardMktMinutes, duplicateMktMinutes, moveMktMinutes, publishMktMinutes, saveMktMinutes,
  saveMktMinutesFolder,
} from '@/lib/marketing/actions'
import {
  countChanges, dropFolder, minutesFieldsPayload, minutesPatch, minutesProblems, minutesSummary, minutesWarnings, newMinutesFields, newMinutesName,
  NEW_RULES, RULES, type MinutesEdit, type MinutesField, type MinutesFolder, type MinutesTemplate,
} from '@/lib/marketing/minutes'
import DeleteDraft from '../builder/DeleteDraft'
import MinutesFields from './MinutesFields'
import MinutesPreview from './MinutesPreview'
import MinutesRail, { type RailActions, type Renaming } from './MinutesRail'
import MinutesRules from './MinutesRules'
import Steady from './Steady'
import m from './minutes.module.css'

// The Minutes Builder v2 (`docs/design_handoff_minutes_builder_v2/`; the manager's — Marketing · Manage): the templates
// rail (folders, search, right-click), the template open — its name, version, what uses it, the Fields and Completion
// rules tabs — and the live preview beside it (a drawer below 1180px). At the foot what it asks, what publishing
// refuses (Fix) and warns of (⚠️), the changes since the version published, Discard changes, Delete draft, Publish.
// A draft is saved as it is typed — 700 ms after the last change, only what changed, never over somebody else's save.

type SaveState = { state: 'saved' } | { state: 'saving' } | { state: 'error'; reason: string; stale: boolean }
type Tab = 'fields' | 'rules'

const editOf = (t: MinutesTemplate): MinutesEdit => ({ name: t.name, fields: t.fields, rules: t.rules })

export default function MinutesBuilder({ initial, folders: firstFolders = [], first, attendees }: {
  initial: MinutesTemplate[]
  folders?: MinutesFolder[]
  /** The template to open (?t=); else the first. */
  first: string | null
  /** Who the preview's minutes list as attending. */
  attendees: string[]
}) {
  const router = useRouter()
  const start = (first ? initial.find(t => t.id === first) : undefined) ?? initial[0] ?? null
  const [list, setList] = useState<MinutesTemplate[]>(initial)
  const [folders, setFolders] = useState<MinutesFolder[]>(firstFolders)
  const [selId, setSelId] = useState<string | null>(start?.id ?? null)
  const [edit, setEdit] = useState<MinutesEdit | null>(start ? editOf(start) : null)
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('fields')
  const [fsel, setFsel] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<Renaming>(null)
  const [pvOpen, setPvOpen] = useState(false)
  const [scrollTick, setScrollTick] = useState(0)
  const [reveal, setReveal] = useState<{ key: string; n: number } | null>(null)

  const selRef = useRef<string | null>(start?.id ?? null)
  const editRef = useRef<MinutesEdit | null>(start ? editOf(start) : null)
  const savedRef = useRef<MinutesEdit | null>(start ? editOf(start) : null)
  const revRef = useRef<number>(start?.rev ?? 1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const staleRef = useRef(false)

  const flash = useCallback((words: string) => {
    setToast(words)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

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
      const patch = minutesPatch(saved, now)
      // Nothing left to send (a change and its undo before the save went): what is on screen is what is kept.
      if (!patch) {
        setSave(s => (s.state === 'error' ? s : { state: 'saved' }))
        return true
      }
      setSave({ state: 'saving' })
      const r = await saveMktMinutes(id, revRef.current, patch)
      if (!r.ok) {
        const stale = /since you opened it/.test(r.reason)
        staleRef.current = stale
        setSave({ state: 'error', reason: r.reason, stale })
        return false
      }
      revRef.current = r.rev
      savedRef.current = now
      setList(l => l.map(t => (t.id === id ? { ...t, name: now.name.trim() || t.name, fields: now.fields, rules: now.rules, rev: r.rev, changed: true } : t)))
      if (editRef.current === now) setSave({ state: 'saved' })
      return true
    })
    chain.current = run.catch(() => false)
    return run
  }, [])

  const change = (next: MinutesEdit) => {
    editRef.current = next
    setEdit(next)
    // Somebody saved this template since: nothing more is sent until it is reloaded.
    if (staleRef.current) return
    setSave({ state: 'saving' })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (timer.current || (savedRef.current && editRef.current && minutesPatch(savedRef.current, editRef.current))) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (timer.current) void flush()
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [flush])

  const show = (t: MinutesTemplate) => {
    const e = editOf(t)
    selRef.current = t.id
    editRef.current = e
    savedRef.current = e
    revRef.current = t.rev
    staleRef.current = false
    setSelId(t.id)
    setEdit(e)
    setFsel(null)
    setAdding(false)
    setSave({ state: 'saved' })
    // Through the router: a URL changed behind its back is put back by the next save's refresh.
    router.replace(`/marketing/minutes?t=${t.id}`, { scroll: false })
  }

  const open = async (id: string, from: MinutesTemplate[] = list) => {
    if (id === selRef.current) return
    if (!(await flush())) {
      flash('This template is not saved — reload before opening another')
      return
    }
    const t = from.find(x => x.id === id)
    if (t) show(t)
  }

  const sel = list.find(t => t.id === selId) ?? null
  const fields = edit?.fields ?? []
  const rules = edit?.rules ?? NEW_RULES
  const changes = sel && edit ? countChanges(edit, sel.published) : null
  const dirty = changes === null || changes > 0
  const problems = edit ? minutesProblems(fields) : []
  const warnings = edit ? minutesWarnings(fields, rules) : []
  const verLabel = !sel ? '' : !sel.published ? 'Draft v1' : dirty ? `Draft v${sel.version + 1}` : `v${sel.version} · live`
  const rulesOn = RULES.filter(r => rules[r.key]).length
  const pageEdit = (t: MinutesTemplate): MinutesEdit => (t.id === selId && edit ? edit : editOf(t))
  const used = !sel ? '' : sel.usedBy.length ? `Used by ${sel.usedBy.join(', ')} · ${sel.open} open minutes`
    : sel.published ? `Used by new minutes · ${sel.open} open minutes` : 'Not used yet · publish to make it available'

  const setFields = (next: MinutesField[]) => edit && change({ ...edit, fields: next })
  const pick = (key: string | null) => {
    setFsel(key)
    if (key) {
      setTab('fields')
      setAdding(false)
    }
  }
  /** Picked from the preview or a Fix chip: the builder brings it into view too. */
  const pickFar = (key: string) => {
    pick(key)
    setReveal({ key, n: Date.now() })
  }

  // ── Templates ──
  const makeTemplate = async (folder: string | null) => {
    if (busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const name = newMinutesName(list.map(t => t.name))
      const r = await saveMktMinutes(null, null, { name, fields: minutesFieldsPayload(newMinutesFields()), rules: NEW_RULES, ...(folder ? { folder } : {}) })
      if (!r.ok) return flash(r.reason)
      const fresh = r.templates ?? list
      setList(fresh)
      const t = fresh.find(x => x.id === r.id)
      if (t) show(t)
      setTab('fields')
      setAdding(true)
    } finally {
      setBusy(false)
    }
  }

  const duplicate = async (id: string) => {
    if (busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await duplicateMktMinutes(id)
      if (!r.ok) return flash(r.reason)
      const fresh = r.templates ?? list
      setList(fresh)
      const t = fresh.find(x => x.id === r.id)
      if (t) show(t)
      flash('Duplicated · the copy is a new draft')
    } finally {
      setBusy(false)
    }
  }

  const removeTemplate = async (id: string) => {
    const t = list.find(x => x.id === id)
    if (!t || busy) return
    setBusy(true)
    try {
      if (id === selRef.current && !(await flush())) return
      const r = await deleteMktMinutes(id, id === selRef.current ? revRef.current : t.rev)
      if (!r.ok) return flash(r.reason)
      const fresh = r.templates ?? list.filter(x => x.id !== id)
      setList(fresh)
      if (id === selRef.current) {
        selRef.current = null
        editRef.current = null
        savedRef.current = null
        setSelId(null)
        setEdit(null)
        if (fresh[0]) show(fresh[0])
        else router.replace('/marketing/minutes', { scroll: false })
      }
      flash(`Deleted “${t.name}”`)
    } finally {
      setBusy(false)
    }
  }

  const move = async (id: string, folder: string | null) => {
    const t = list.find(x => x.id === id)
    if (!t || t.folder === folder) return
    setList(l => l.map(x => (x.id === id ? { ...x, folder } : x)))
    const r = await moveMktMinutes(id, folder)
    if (!r.ok) {
      setList(l => l.map(x => (x.id === id ? { ...x, folder: t.folder } : x)))
      return flash(r.reason)
    }
    flash(folder ? `Moved to ${folders.find(f => f.id === folder)?.name ?? 'the folder'}` : 'Moved out of its folder')
  }

  // ── Folders ──
  const newFolder = async (parent: string | null, moveTpl?: string) => {
    const r = await saveMktMinutesFolder(null, parent, 'New folder')
    if (!r.ok) return flash(r.reason)
    setFolders(f => [...f, r.folder])
    setRenaming({ kind: 'folder', id: r.folder.id, draft: r.folder.name })
    if (moveTpl) await move(moveTpl, r.folder.id)
  }

  const removeFolder = async (id: string) => {
    const fo = folders.find(f => f.id === id)
    if (!fo) return
    const before = { folders, list }
    const after = dropFolder(id, folders, list)
    setFolders(after.folders)
    setList(after.tpls)
    const r = await deleteMktMinutesFolder(id)
    if (!r.ok) {
      setFolders(before.folders)
      setList(before.list)
      return flash(r.reason)
    }
    if (r.book) setFolders(r.book.folders)
    flash(`Deleted folder “${fo.name}” · its templates moved up`)
  }

  const rename = async (kind: 'tpl' | 'folder', id: string, name: string) => {
    if (kind === 'folder') {
      const fo = folders.find(f => f.id === id)
      if (!fo || fo.name === name) return
      setFolders(f => f.map(x => (x.id === id ? { ...x, name } : x)))
      const r = await saveMktMinutesFolder(id, fo.parent, name)
      if (!r.ok) {
        setFolders(f => f.map(x => (x.id === id ? fo : x)))
        flash(r.reason)
      }
      return
    }
    // The template open renames through its draft (saved as typed); another one on its own count.
    if (id === selRef.current && edit) {
      if (edit.name !== name) change({ ...edit, name })
      return
    }
    const t = list.find(x => x.id === id)
    if (!t || t.name === name) return
    const r = await saveMktMinutes(id, t.rev, { name })
    if (!r.ok) return flash(r.reason)
    setList(l => l.map(x => (x.id === id ? { ...x, name, rev: r.rev, changed: true } : x)))
  }

  const railAct: RailActions = {
    open: id => void open(id),
    newTemplate: folder => void makeTemplate(folder),
    newFolder: (parent, moveTpl) => void newFolder(parent, moveTpl),
    duplicate: id => void duplicate(id),
    move: (id, folder) => void move(id, folder),
    deleteTemplate: id => void removeTemplate(id),
    deleteFolder: id => void removeFolder(id),
    rename: (kind, id, name) => void rename(kind, id, name),
  }

  // ── The foot ──
  const publish = async () => {
    if (!sel || !edit || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await publishMktMinutes(sel.id, revRef.current)
      if (!r.ok) return flash(r.reason)
      const snap = editRef.current ?? edit
      setList(l => l.map(t => (t.id === sel.id ? { ...t, version: r.version, changed: false, published: { name: snap.name.trim(), fields: snap.fields, rules: snap.rules } } : t)))
      flash(`${snap.name.trim() || sel.name} v${r.version} published · new minutes use it from now`)
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    if (!sel?.published || busy) return
    setBusy(true)
    try {
      // What is waiting to be saved is what is being thrown away: the save in flight, if any, lands first.
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      await chain.current
      const r = await discardMktMinutes(sel.id, revRef.current)
      if (!r.ok) return flash(r.reason)
      const back = (r.templates ?? []).find(t => t.id === sel.id) ?? { ...sel, ...sel.published, rev: r.rev, changed: false }
      setList(l => (r.templates ? r.templates : l.map(t => (t.id === sel.id ? back : t))))
      show(back)
      flash(`Back to v${sel.version}`)
    } finally {
      setBusy(false)
    }
  }

  const removeDraft = () => sel && void removeTemplate(sel.id)

  const publishOff = !sel || !dirty || problems.length > 0 || save.state === 'error' || busy
  const publishWhy = !sel ? undefined : !dirty ? `Nothing has changed since v${sel.version}` : problems[0]?.text ?? (save.state === 'error' ? save.reason : undefined)
  const pubHint = !sel ? '' : !sel.published ? 'Never published'
    : dirty ? `${changes} change${changes === 1 ? '' : 's'} since v${sel.version}${sel.openOnLive ? ` · ${sel.openOnLive} open minutes stay on v${sel.version}` : ''}` : ''
  const pubLabel = !sel ? '' : dirty ? `Publish v${sel.version + 1}` : 'Published ✓'

  return (
    <div className={m.page}>
      <div className={m.head}>
        <span className={m.headIcon} aria-hidden="true">📝</span>
        <div className={m.headWords}><div className={m.title}>Minutes Builder</div></div>
        <button type="button" className={m.newBtn} disabled={busy} onClick={() => void makeTemplate(null)}>+ New minutes template</button>
      </div>

      <div className={m.body}>
        <MinutesRail templates={list} folders={folders} selId={selId} editOf={pageEdit} renaming={renaming} setRenaming={setRenaming} act={railAct} />

        <div className={m.center} onScroll={() => setScrollTick(n => n + 1)}>
          {sel && edit ? (
            <div className={m.centerIn}>
              <div className={m.titleBlock}>
                <div className={m.titleRow}>
                  <input className={m.name} value={edit.name} maxLength={60} aria-label="Template name" onChange={e => change({ ...edit, name: e.target.value })} />
                  <span className={`${m.ver} ${dirty ? m.verDirty : m.verLive}`}>{verLabel}</span>
                  {save.state === 'error' ? (
                    <span className={m.notSaved} role="alert">
                      Not saved · {save.reason}
                      {save.stale ? <button type="button" className={m.reload} onClick={() => window.location.reload()}>Reload</button> : null}
                    </span>
                  ) : (
                    <span className={m.saveState}><Steady show={save.state === 'saving' ? 'Saving…' : 'Saved'} also={['Saving…', 'Saved']} /></span>
                  )}
                  <button type="button" className={m.pvToggle} onClick={() => setPvOpen(true)}>👁 Live preview</button>
                </div>
                <div className={m.used}>{used}</div>
              </div>

              <div className={m.tabs} role="tablist">
                {([['fields', 'Fields', String(fields.length)], ['rules', 'Completion rules', `${rulesOn} on`]] as const).map(([k, label, count]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    className={`${m.tab}${tab === k ? ` ${m.tabOn}` : ''}`}
                    onClick={() => {
                      setTab(k)
                      setAdding(false)
                    }}
                  >
                    <Steady show={label} bold />
                    <span className={m.tabCount}>{count}</span>
                  </button>
                ))}
              </div>

              {tab === 'fields' ? (
                <MinutesFields
                  fields={fields}
                  selKey={fsel}
                  reveal={reveal}
                  problems={problems}
                  adding={adding}
                  closeTick={scrollTick}
                  onFields={setFields}
                  onSelect={pick}
                  setAdding={setAdding}
                  flash={flash}
                />
              ) : (
                <MinutesRules rules={rules} onRules={next => change({ ...edit, rules: next })} />
              )}
            </div>
          ) : (
            <div className={m.empty}>{list.length ? 'Pick a template' : 'No minutes templates yet'}</div>
          )}
        </div>

        {sel && edit ? (
          <MinutesPreview
            key={sel.id}
            name={edit.name}
            version={verLabel}
            fields={fields}
            rules={rules}
            attendees={attendees}
            selKey={fsel}
            onSelect={pickFar}
            open={pvOpen}
            onClose={() => setPvOpen(false)}
          />
        ) : <div />}
      </div>

      {sel && edit ? (
        <div className={m.foot}>
          <span className={m.summary}>{minutesSummary(fields)}</span>
          {problems.map(p => (
            <button
              key={p.text}
              type="button"
              className={`${m.issue} ${m.issueFix}`}
              title="Show me"
              onClick={() => {
                setTab('fields')
                setAdding(!p.key && p.text === 'Add a Title') // no title yet: the type cards open, Title first
                if (p.key) pickFar(p.key)
              }}
            >
              <span className={m.issueTag}>Fix</span>{p.text}
            </button>
          ))}
          {warnings.map(w => (
            <button key={w.text} type="button" className={`${m.issue} ${m.issueWarn}`} title="Show me" onClick={() => { setTab(w.tab); setAdding(false) }}>
              <span className={m.issueTag}>⚠️</span>{w.text}
            </button>
          ))}
          <span className={m.grow} />
          {pubHint ? <span className={m.pubHint}>{pubHint}</span> : null}
          {sel.published && dirty ? <button type="button" className={m.discard} disabled={busy} onClick={() => void discard()}>Discard changes</button> : null}
          {sel.version ? null : <DeleteDraft key={sel.id} what="template" busy={busy || list.length < 2} onDelete={removeDraft} />}
          <button type="button" className={m.publish} disabled={publishOff} title={publishWhy} onClick={() => void publish()}>
            <Steady show={pubLabel} also={[`Publish v${sel.version + 1}`, 'Published ✓']} />
          </button>
        </div>
      ) : null}

      {toast ? <div className={m.toastWrap}><div className={m.toast} role="status">{toast}</div></div> : null}
    </div>
  )
}
