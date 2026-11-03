'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { LeadIcon } from '@/components/layout/lead-icons'
import { leadMediaLinks, removeTemplate, saveLibraryItem, saveTemplate } from '@/lib/leads/actions'
import { infoEntries, type LeadInfo } from '@/lib/leads/info'
import { createClient } from '@/lib/supabase/client'
import { wrapMark } from '@/lib/leads/rich'
import {
  ALSO_MAX, BACK_LABEL, OPTION_MAX, RETRY_PHONE, SAVE_AS, doneOf, freshId, fromLibrary, templateProblem, toLibrary, updateFromLibrary, usedBy, walkAnswer, walkFrom,
  type LibraryItem, type ReplyRules, type ReplyTemplate, type StepFile, type StepKind, type TemplateStep, type Walk,
} from '@/lib/leads/template'
import { ATTACH_ACCEPT, NODE, STEP_TYPES, edgePath, extOf, inPort, isImage, mapPlaced, mapRows, placeMissing, nodeHeight, rowPort, sizeLabel, typeOf } from '@/lib/leads/template-map'
import Modal from './ui/Modal'
import RichText from './RichText'
import s from './templates.module.css'

/**
 * Lead View v2 › Reply templates (2026-11-02, the v2 handoff §7.6): the templates; the chosen one's name, "Used by",
 * List | Flow map and Save; the steps as a straight list or as a map in columns (zoom, Fit, drag a node, drag a row's
 * dot to another node); the same step editor in both (name, message, a photo or file, the buttons and where each goes,
 * Then, Done); "+ Add step" with the six types and FROM LIBRARY; right-click → Edit, Save to library, Duplicate, Delete;
 * and the preview rail (collapsed by default) running the template from the picked step as the customer sees it.
 * Kept though the reference does not draw them (the user's point 2), behind the editor's "More": bold / italic,
 * General info fields, picking more than one, an option's other replies, keeping an answer, the phone's retry,
 * closing messages; and on a template's right-click its description, closing message, Duplicate and Delete.
 * Saved as a whole (lead_save_template).
 */

type Draft = Pick<ReplyTemplate, 'id' | 'name' | 'description' | 'endMsg' | 'steps'>
const blank = (): Draft => ({
  id: `new-${Date.now().toString(36)}`, name: 'New template', description: '', endMsg: '',
  steps: mapPlaced([{ id: 's1', kind: 'question', name: 'Welcome', text: 'Hi {name}! What are you looking for today?', buttons: [{ label: 'Option 1', next: '' }] }]),
})
const draftOf = (t: ReplyTemplate): Draft => ({ id: t.id, name: t.name, description: t.description ?? '', endMsg: t.endMsg ?? '', steps: mapPlaced(t.steps) })
const tileStyle = (k: StepKind) => { const t = typeOf(k); return { ['--tint' as string]: `var(${t.tint})`, ['--fg' as string]: `var(${t.fg})` } as CSSProperties }
const FILE_LIMIT = 25 * 1024 * 1024

export default function TemplatesView({ templates, rules, ads, brands, library, info, today, ready, initialId, canEdit }: {
  templates: ReplyTemplate[]
  rules: ReplyRules
  ads: Array<{ adId: string; name: string }>
  brands: Array<{ id: string; name: string }>
  library: LibraryItem[]
  info: LeadInfo | null
  today: string
  ready: boolean
  initialId: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [list, setList] = useState(templates)
  useEffect(() => { setList(templates) }, [templates])
  const firstId = initialId && templates.some(t => t.id === initialId) ? initialId : templates[0]?.id ?? null
  const [draft, setDraft] = useState<Draft>(() => { const t = templates.find(x => x.id === firstId); return t ? draftOf(t) : blank() })
  const [past, setPast] = useState<Draft[]>([])
  const [future, setFuture] = useState<Draft[]>([])
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [sel, setSel] = useState<string | null>(draft.steps[0]?.id ?? null)
  const [editing, setEditing] = useState<string | null>(null)
  const [mode, setMode] = useState<'list' | 'map'>('list')
  const [railOpen, setRailOpen] = useState(false)
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null)
  const [tplCtx, setTplCtx] = useState<{ t: ReplyTemplate; x: number; y: number } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!dirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])

  const change = useCallback((fn: (d: Draft) => Draft) => {
    setDraft(d => { setPast(p => [...p.slice(-49), d]); setFuture([]); return fn(d) })
    setDirty(true)
    setError('')
  }, [])
  const setStep = useCallback((id: string, o: Partial<TemplateStep> | ((x: TemplateStep) => Partial<TemplateStep>)) =>
    change(d => ({ ...d, steps: d.steps.map(x => (x.id === id ? { ...x, ...(typeof o === 'function' ? o(x) : o) } : x)) })), [change])
  const undo = () => { if (!past.length) return; setFuture(f => [draft, ...f]); setDraft(past[past.length - 1]); setPast(p => p.slice(0, -1)); setDirty(true) }
  const redo = () => { if (!future.length) return; setPast(p => [...p, draft]); setDraft(future[0]); setFuture(f => f.slice(1)); setDirty(true) }

  const isNew = draft.id.startsWith('new-')
  const brandName = (id: string) => brands.find(b => b.id === id)?.name ?? '—'
  const adName = (id: string) => ads.find(a => a.adId === id)?.name || `Ad ${id}`
  const libById = useMemo(() => new Map(library.map(l => [l.id, l])), [library])
  const libIds = useMemo(() => new Set(library.map(l => l.id)), [library])

  // Photos and files: signed links for the saved ones (an hour), the browser's own for those just picked.
  const [links, setLinks] = useState<Record<string, string>>({})
  const paths = useMemo(() => [...new Set(draft.steps.map(x => x.file?.path).filter((p): p is string => !!p))].sort().join('|'), [draft.steps])
  useEffect(() => {
    const want = paths ? paths.split('|').filter(p => !links[p] && !localUrls[p]) : []
    if (!want.length) return
    let live = true
    leadMediaLinks(want).then(r => { if (live && r.ok) setLinks(l => ({ ...l, ...r.data })) })
    return () => { live = false }
  }, [paths, links, localUrls])
  const urlOf = (f: StepFile | null | undefined) => (f ? localUrls[f.path] ?? links[f.path] ?? '' : '')

  const open = (t: ReplyTemplate | null) => {
    if (!t && isNew && !dirty) return
    if (dirty && !window.confirm('Leave this template without saving its changes?')) return
    const d = t ? draftOf(t) : blank()
    setDraft(d); setPast([]); setFuture([]); setDirty(false); setSel(d.steps[0]?.id ?? null); setEditing(null); setError('')
    window.history.replaceState(null, '', t ? `/leads/flows?t=${t.id}` : '/leads/flows')
  }
  const save = () => {
    if (!(dirty || isNew) || busy) return
    const problem = templateProblem(draft.steps)
    if (problem) { setError(problem); return }
    start(async () => {
      const r = await saveTemplate(isNew ? null : draft.id, { name: draft.name, description: draft.description, endMsg: draft.endMsg, steps: draft.steps })
      if (!r.ok) { setError(r.reason); return }
      if (isNew) { setDraft(d => ({ ...d, id: r.data })); window.history.replaceState(null, '', `/leads/flows?t=${r.data}`) }
      setDirty(false)
      router.refresh()
    })
  }
  const removeTpl = (t: ReplyTemplate) => {
    if (!window.confirm(`Delete “${t.name}”? Rules that use it will need another reply.`)) return
    start(async () => {
      const r = await removeTemplate(t.id)
      if (!r.ok) { setError(r.reason); return }
      setList(l => l.filter(x => x.id !== t.id))
      if (draft.id === t.id) { setDirty(false); const next = list.find(x => x.id !== t.id) ?? null; const d = next ? draftOf(next) : blank(); setDraft(d); setSel(d.steps[0]?.id ?? null) }
      router.refresh()
    })
  }
  const copyTpl = (t: ReplyTemplate) => {
    if (dirty && !window.confirm('Leave this template without saving its changes?')) return
    const d = { ...draftOf(t), id: `new-${Date.now().toString(36)}`, name: `${t.name} copy`.slice(0, 60) }
    setDraft(d); setDirty(true); setSel(d.steps[0]?.id ?? null); setEditing(null)
  }

  const removeStep = (id: string) => {
    if (draft.steps.length <= 1) { setError('A template keeps at least one step.'); return }
    change(d => ({
      ...d,
      steps: d.steps.filter(x => x.id !== id).map(x => ({
        ...x,
        ...(x.buttons ? { buttons: x.buttons.map(b => ({ ...b, ...(b.next === id ? { next: '' } : {}), ...(b.also?.includes(id) ? { also: b.also.filter(a => a !== id) } : {}) })) } : {}),
        ...(x.next === id ? { next: '' } : {}),
        ...(x.failNext === id ? { failNext: 'person' } : {}),
      })),
    }))
    if (sel === id) setSel(null)
    if (editing === id) setEditing(null)
  }
  const duplicateStep = (id: string) => {
    const src = draft.steps.find(x => x.id === id)
    if (!src) return
    const nid = freshId(draft.steps)
    const copy: TemplateStep = { ...src, id: nid, name: `${src.name || typeOf(src.kind).label} copy`.slice(0, 40), pos: src.pos ? { x: src.pos.x + 30, y: src.pos.y + 30 } : undefined }
    delete copy.lib
    if (copy.buttons) copy.buttons = copy.buttons.map(b => ({ ...b }))
    change(d => { const i = d.steps.findIndex(x => x.id === id); return { ...d, steps: [...d.steps.slice(0, i + 1), copy, ...d.steps.slice(i + 1)] } })
    setSel(nid)
  }
  const toLib = (step: TemplateStep) => {
    if (step.lib && libById.has(step.lib.id)) return
    start(async () => {
      const r = await saveLibraryItem(null, { kind: 'step', name: (step.name || typeOf(step.kind).label).slice(0, 60), description: '', steps: toLibrary(draft.steps, step.id, false) })
      if (!r.ok) { setError(r.reason); return }
      setStep(step.id, { lib: { id: r.data, ver: 1 } })
      flash(`Saved “${step.name || typeOf(step.kind).label}” to Step library`)
      router.refresh()
    })
  }
  /** A new step: the reference names it by its type (or the library's name); in List view a Then-less last step leads to it. */
  const addStep = (kind: StepKind | null, item: LibraryItem | null, at: { x: number; y: number } | null) => {
    const last = draft.steps[draft.steps.length - 1]
    const where = at ?? (last?.pos ? { x: last.pos.x, y: last.pos.y + nodeHeight(last) + NODE.gap } : { x: NODE.start, y: NODE.start })
    let added: TemplateStep[]
    if (item) added = fromLibrary(draft.steps, item, where).map(x => ({ ...x, name: x.name || item.name }))
    else {
      const k = kind ?? 'question'
      added = [{ id: freshId(draft.steps), kind: k, name: typeOf(k).label, text: '', ...(k === 'question' ? { buttons: [{ label: 'Option 1', next: '' }] } : { next: '' }), ...(k === 'phone' ? { retryText: RETRY_PHONE, retryMax: '2', failNext: 'person' } : {}), pos: where }]
    }
    const first = added[0]
    change(d => ({
      ...d,
      steps: [...(at === null && last && ['phone', 'message', 'text'].includes(last.kind) && !last.next ? d.steps.map(x => (x.id === last.id ? { ...x, next: first.id } : x)) : d.steps), ...added],
    }))
    setSel(first.id)
    if (at === null) setEditing(first.id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const used = isNew ? 'Not used yet' : usedBy(draft.id, rules, brandName, adName)
  const ctxStep = ctx ? draft.steps.find(x => x.id === ctx.id) ?? null : null
  const inLib = ctxStep?.lib ? libById.has(ctxStep.lib.id) : false
  const editProps = { steps: draft.steps, canEdit, setStep, setLocalUrls, urlOf, libById, info, today, onDone: () => setEditing(null), onFlash: setError }

  return (
    <div className={s.grid} style={{ gridTemplateColumns: `280px minmax(0, 1fr) ${railOpen ? '380px' : '48px'}` }}>
      <section className={s.list} aria-label="Templates">
        <div className={s.listHead}>
          <span className={s.listTitle}>Templates</span>
          {canEdit ? <button type="button" className={s.newBtn} onClick={() => open(null)}><LeadIcon name="plus" size={14} />New</button> : null}
        </div>
        <div className={s.items}>
          {list.map(t => (
            <div key={t.id} className={s.item} role="button" tabIndex={0} aria-current={t.id === draft.id}
              onClick={() => { if (t.id !== draft.id) open(t) }} onKeyDown={e => { if (e.key === 'Enter' && t.id !== draft.id) open(t) }}
              onContextMenu={e => { if (!canEdit) return; e.preventDefault(); setTplCtx({ t, x: Math.min(e.clientX, window.innerWidth - 210), y: Math.min(e.clientY, window.innerHeight - 170) }) }}>
              <div className={s.itemTop}>
                <span className={s.itemName}>{t.id === draft.id ? draft.name : t.name}</span>
                <span className={s.itemCount}>{(t.id === draft.id ? draft.steps : t.steps).length} steps</span>
              </div>
              <span className={s.itemUsed}>{usedBy(t.id, rules, brandName, adName)}</span>
            </div>
          ))}
          {isNew ? (
            <div className={s.item} aria-current>
              <div className={s.itemTop}><span className={s.itemName}>{draft.name}</span><span className={s.itemCount}>{draft.steps.length} steps</span></div>
              <span className={s.itemUsed}>Not saved yet</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className={s.editor} aria-label="Template">
        <div className={s.head}>
          <div className={s.titles}>
            <input className={s.name} value={draft.name} maxLength={60} disabled={!canEdit} aria-label="Template name" onChange={e => change(d => ({ ...d, name: e.target.value }))} />
            <span className={s.used}>Used by {used}</span>
          </div>
          <div className={s.views} role="group" aria-label="View">
            <button type="button" className={s.view} aria-pressed={mode === 'list'} title="List" onClick={() => setMode('list')}><LeadIcon name="list" size={14} />List</button>
            <button type="button" className={s.view} aria-pressed={mode === 'map'} title="Flow map" onClick={() => setMode('map')}><LeadIcon name="workflow" size={14} />Flow map</button>
          </div>
          {canEdit ? (
            <button type="button" className={s.save} data-dirty={(dirty || isNew) && ready ? '' : undefined} disabled={!(dirty || isNew) || busy || !ready}
              title={!ready ? 'Waiting for the database update' : undefined} onClick={save}>{busy ? 'Saving…' : dirty || isNew ? 'Save changes' : 'Saved'}</button>
          ) : null}
        </div>
        {error ? <div className={s.alert} role="alert">{error}</div> : null}
        {mode === 'list' ? (
          <ListView steps={draft.steps} sel={sel} editing={editing} canEdit={canEdit} library={library} libIds={libIds} urlOf={urlOf}
            onPick={id => { setSel(id); if (canEdit) setEditing(id) }} onCtx={(id, x, y) => setCtx({ id, x, y })}
            onBlank={() => { setEditing(null); setSel(null) }}
            onAdd={(k, item) => addStep(k, item, null)} editor={id => <StepEditor key={id} step={draft.steps.find(x => x.id === id)!} {...editProps} />} />
        ) : (
          <FlowMap steps={placeMissing(draft.steps)}sel={sel} setSel={setSel} editing={editing} setEditing={setEditing} canEdit={canEdit} library={library} libIds={libIds}
            setStep={setStep} change={change} onCtx={(id, x, y) => setCtx({ id, x, y })} onDelete={removeStep} onAdd={(k, item, at) => addStep(k, item, at)}
            editor={id => <StepEditor key={id} step={draft.steps.find(x => x.id === id)!} {...editProps} />} />
        )}
      </section>

      <Rail open={railOpen} setOpen={setRailOpen} draft={draft} from={sel} brand={railBrand(draft.id, rules, brandName, brands)} urlOf={urlOf} />

      {ctx && ctxStep ? (
        <>
          <div className={s.ctxCatch} onClick={() => setCtx(null)} onContextMenu={e => { e.preventDefault(); setCtx(null) }} aria-hidden="true" />
          <div className={s.ctx} role="menu" style={{ left: Math.min(ctx.x, window.innerWidth - 210), top: Math.min(ctx.y, window.innerHeight - 160) }}>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { setCtx(null); setSel(ctxStep.id); setEditing(ctxStep.id) }}><LeadIcon name="pencil" size={14} />Edit</button>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { setCtx(null); duplicateStep(ctxStep.id) }}><LeadIcon name="copy" size={14} />Duplicate</button>
            <button type="button" role="menuitem" className={s.ctxItem} data-tone={inLib ? 'muted' : 'pos'} disabled={inLib || !ready}
              onClick={() => { setCtx(null); toLib(ctxStep) }}><LeadIcon name="blocks" size={14} />{inLib ? 'Already in library' : 'Save to library'}</button>
            <button type="button" role="menuitem" className={s.ctxItem} data-tone="rust" onClick={() => { setCtx(null); removeStep(ctxStep.id) }}><LeadIcon name="trash-2" size={14} />Delete</button>
          </div>
        </>
      ) : null}

      {tplCtx ? (
        <>
          <div className={s.ctxCatch} onClick={() => setTplCtx(null)} onContextMenu={e => { e.preventDefault(); setTplCtx(null) }} aria-hidden="true" />
          <div className={s.ctx} role="menu" style={{ left: tplCtx.x, top: tplCtx.y }}>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { const t = tplCtx.t; setTplCtx(null); if (t.id !== draft.id) open(t); setSettingsOpen(true) }}><LeadIcon name="pencil" size={14} />Description and closing</button>
            <button type="button" role="menuitem" className={s.ctxItem} onClick={() => { const t = tplCtx.t; setTplCtx(null); copyTpl(t) }}><LeadIcon name="copy" size={14} />Duplicate</button>
            <button type="button" role="menuitem" className={s.ctxItem} data-tone="rust" onClick={() => { const t = tplCtx.t; setTplCtx(null); removeTpl(t) }}><LeadIcon name="trash-2" size={14} />Delete</button>
          </div>
        </>
      ) : null}

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title={draft.name} width={440}
        foot={<button type="button" className={s.done} onClick={() => setSettingsOpen(false)}>Done</button>}>
        <label className={s.field}>Description
          <input className={s.edInput} value={draft.description} maxLength={300} placeholder="When to use this template" onChange={e => change(d => ({ ...d, description: e.target.value }))} />
        </label>
        <label className={s.field}>Closing message · sent when a chat reaches the end of a step that goes nowhere
          <textarea className={s.edText} rows={3} value={draft.endMsg} maxLength={1000} placeholder="e.g. Thanks! We’ll be in touch soon 😊" onChange={e => change(d => ({ ...d, endMsg: e.target.value }))} />
        </label>
      </Modal>
    </div>
  )
}

/** The brand the preview names: the first page or ad whose reply rules run the template, else the first brand. */
function railBrand(id: string, rules: ReplyRules, brandName: (id: string) => string, brands: Array<{ id: string; name: string }>): string {
  const p = rules.pages.find(x => x.work === id || x.after === id)
  return p ? brandName(p.brandId) : brands[0]?.name ?? 'Your page'
}

// ── List view ──

function ListView({ steps, sel, editing, canEdit, library, libIds, urlOf, onPick, onCtx, onBlank, onAdd, editor }: {
  steps: TemplateStep[]
  sel: string | null
  editing: string | null
  canEdit: boolean
  library: LibraryItem[]
  libIds: Set<string>
  urlOf: (f: StepFile | null | undefined) => string
  onPick: (id: string) => void
  onCtx: (id: string, x: number, y: number) => void
  /** A click on the blank around the steps closes the open one (the user, 2026-11-02: "点空白处可以关"). */
  onBlank: () => void
  onAdd: (k: StepKind | null, item: LibraryItem | null) => void
  editor: (id: string) => React.ReactNode
}) {
  const nameOf = (id: string) => steps.find(x => x.id === id)?.name || (id ? 'Untitled' : 'Not connected')
  return (
    <div className={s.listView} onClick={e => {
      const t = e.target as HTMLElement
      if (!t.closest(`.${s.card}, button, input, textarea, select, label, a, [role=menu], [role=dialog]`)) onBlank()
    }}>
      {steps.map((st, i) => {
        const t = typeOf(st.kind)
        const isEd = editing === st.id
        return (
          <div key={st.id} className={s.slot}>
            <div className={s.card} data-sel={sel === st.id || undefined} data-editing={isEd || undefined} role="button" tabIndex={0}
              onClick={() => { if (!isEd) onPick(st.id) }} onKeyDown={e => { if (e.key === 'Enter' && !isEd) onPick(st.id) }}
              onContextMenu={e => { if (!canEdit) return; e.preventDefault(); onCtx(st.id, e.clientX, e.clientY) }}>
              {isEd ? editor(st.id) : (
                <>
                  <div className={s.cardTop}>
                    <span className={s.tile} style={tileStyle(st.kind)}><LeadIcon name={t.icon} size={13} /></span>
                    <span className={s.cardName}>{st.name || 'Untitled'}</span>
                    {st.lib && libIds.has(st.lib.id) ? <span className={s.libMark} title="From step library"><LeadIcon name="blocks" size={13} /></span> : null}
                    <span className={s.type}>{t.label}</span>
                  </div>
                  <span className={s.text}>{st.text}</span>
                  {st.file ? <FileChip file={st.file} url={urlOf(st.file)} /> : null}
                  {st.kind === 'question' ? (
                    <div className={s.opts}>{(st.buttons ?? []).map((b, j) => <span key={j} className={s.opt}><span>{b.label}</span><span className={s.optTo}>→ {nameOf(b.next)}</span></span>)}</div>
                  ) : null}
                  {['phone', 'message', 'text'].includes(st.kind) && st.next ? <span className={s.then}>Then → {nameOf(st.next)}</span> : null}
                </>
              )}
            </div>
            {i < steps.length - 1 ? <span className={s.wire} aria-hidden="true" /> : null}
          </div>
        )
      })}
      {canEdit ? <AddStep up library={library} onAdd={onAdd} /> : null}
    </div>
  )
}

function FileChip({ file, url }: { file: StepFile; url: string }) {
  return (
    <div className={s.chipFile}>
      {isImage(file.mime) ? <span className={s.thumb} style={{ backgroundImage: url ? `url("${url}")` : undefined }} /> : <span className={s.ext}>{extOf(file.name)}</span>}
      <span>{file.name}</span>
    </div>
  )
}

/** "+ Add step": the six types, then FROM LIBRARY. Opens up in List view, down on the map; a click outside closes it. */
/** Room the Add step menu needs above its button to open upward: its six types, the library heading, a library row or two, the header. */
const ADD_MENU_ROOM = 420

function AddStep({ up, library, onAdd }: { up?: boolean; library: LibraryItem[]; onAdd: (k: StepKind | null, item: LibraryItem | null) => void }) {
  const [open, setOpen] = useState(false)
  // The List view's menu opens upward, unless the page has too little room above the button (a short list: the
  // menu ran under the header — 2026-11-03); then it opens below, still centred.
  const [below, setBelow] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const steps = library.filter(l => l.kind === 'step')
  const toggle = () => {
    if (!open && up && btn.current) setBelow(btn.current.getBoundingClientRect().top < ADD_MENU_ROOM)
    setOpen(o => !o)
  }
  return (
    <div className={up ? s.addWrap : undefined} style={up ? undefined : { position: 'relative' }}>
      <button ref={btn} type="button" className={s.addBtn} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><LeadIcon name="plus" size={14} />Add step</button>
      {open ? (
        <>
          <div className={s.catcher} onClick={() => setOpen(false)} aria-hidden="true" />
          <div className={s.addMenu} data-up={(up && !below) || undefined} data-under={(up && below) || undefined} data-down={up ? undefined : ''} role="menu">
            {STEP_TYPES.map(t => (
              <button key={t.kind} type="button" role="menuitem" className={s.addItem} onClick={() => { setOpen(false); onAdd(t.kind, null) }}><LeadIcon name={t.icon} size={14} />{t.label}</button>
            ))}
            <span className={s.addHead}>FROM LIBRARY</span>
            {steps.map(l => (
              <button key={l.id} type="button" role="menuitem" className={s.addItem} data-lib="" onClick={() => { setOpen(false); onAdd(null, l) }}><LeadIcon name="blocks" size={14} />{l.name}</button>
            ))}
            {!steps.length ? <span className={s.addNone}>Nothing in the library yet</span> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

// ── The step editor (List view inline; the map's floating panel) ──

function StepEditor({ step, steps, canEdit, setStep, setLocalUrls, urlOf, libById, info, today, onDone, onFlash }: {
  step: TemplateStep
  steps: TemplateStep[]
  canEdit: boolean
  setStep: (id: string, o: Partial<TemplateStep> | ((x: TemplateStep) => Partial<TemplateStep>)) => void
  setLocalUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>
  urlOf: (f: StepFile | null | undefined) => string
  libById: Map<string, LibraryItem>
  info: LeadInfo | null
  today: string
  onDone: () => void
  onFlash: (m: string) => void
}) {
  const t = typeOf(step.kind)
  const dis = !canEdit
  const set = (o: Partial<TemplateStep>) => setStep(step.id, o)
  const text = useRef<HTMLTextAreaElement>(null)
  const [uploading, setUploading] = useState(false)
  const [more, setMore] = useState(false)
  const lib = step.lib ? libById.get(step.lib.id) ?? null : null
  const targets = steps.filter(x => x.id !== step.id)
  const target = (value: string, onChange: (v: string) => void, label: string) => (
    <select className={s.edSelect} value={value} disabled={dis} aria-label={label} onChange={e => onChange(e.target.value)}>
      <option value="">Not connected</option>
      {targets.map(x => <option key={x.id} value={x.id}>{x.name || 'Untitled'}</option>)}
    </select>
  )
  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > FILE_LIMIT) { onFlash('A photo or file is 25 MB at most.'); return }
    setUploading(true)
    const name = file.name.replace(/[\\/]/g, '_').slice(-120) || 'file'
    const path = `chat/tpl/${crypto.randomUUID()}/${name}`
    const up = await createClient().storage.from('lead-media').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    setUploading(false)
    if (up.error) { onFlash('The file could not be uploaded. Please try again.'); return }
    setLocalUrls(u => ({ ...u, [path]: URL.createObjectURL(file) }))
    set({ file: { path, name, mime: file.type || 'application/octet-stream', size: file.size } })
  }
  const attach = (label: string) => (
    <label className={s.attachSm}><LeadIcon name="paperclip" size={13} />{label}
      <input type="file" accept={ATTACH_ACCEPT} className={s.hidden} disabled={dis || uploading} onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
  const rows = mapRows(step)
  return (
    <div className={s.ed} onClick={e => e.stopPropagation()}>
      <div className={s.cardTop}>
        <span className={s.tile} style={tileStyle(step.kind)}><LeadIcon name={t.icon} size={13} /></span>
        <input className={s.edName} value={step.name ?? ''} maxLength={40} disabled={dis} placeholder="Step name" aria-label="Step name" onChange={e => set({ name: e.target.value })} />
        <span className={s.type}>{t.label}</span>
      </div>
      <textarea ref={text} className={s.edText} rows={3} value={step.text ?? ''} maxLength={1000} disabled={dis} placeholder="Write the message…" aria-label="Message" onChange={e => set({ text: e.target.value })} />
      {step.kind === 'message' || step.file ? (
        step.file ? (
          <div className={s.fileBox}>
            {isImage(step.file.mime) ? <span className={s.thumb} data-size="40" style={{ backgroundImage: urlOf(step.file) ? `url("${urlOf(step.file)}")` : undefined }} /> : <span className={s.ext} data-size="40">{extOf(step.file.name)}</span>}
            <div className={s.fileText}><span className={s.fileName}>{step.file.name}</span><span className={s.fileMeta}>{sizeLabel(step.file.size)}</span></div>
            {canEdit ? (
              <>
                <label className={s.replace}>Replace<input type="file" accept={ATTACH_ACCEPT} className={s.hidden} onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} /></label>
                <button type="button" className={s.x} title="Remove" aria-label="Remove the file" onClick={() => set({ file: null })}><LeadIcon name="x" size={14} /></button>
              </>
            ) : null}
          </div>
        ) : canEdit ? attach(uploading ? 'Uploading…' : 'Attach photo or file') : null
      ) : null}
      {rows.map(r => (
        <div key={String(r.slot)} className={s.edRow}>
          {r.edit
            ? <input className={s.edInput} value={r.label} maxLength={OPTION_MAX} disabled={dis} aria-label={`Button ${Number(r.slot) + 1}`} onChange={e => set({ buttons: (step.buttons ?? []).map((b, j) => (j === r.slot ? { ...b, label: e.target.value } : b)) })} />
            : <span className={s.edFixed}>{r.label}</span>}
          <LeadIcon name="arrow-right" size={13} className={s.edArrow} />
          {target(r.to, v => set(r.slot === 'next' ? { next: v } : { buttons: (step.buttons ?? []).map((b, j) => (j === r.slot ? { ...b, next: v } : b)) }), `${r.label} goes to`)}
          {r.edit && canEdit ? (
            <button type="button" className={s.x} title="Remove button" aria-label="Remove button" disabled={(step.buttons ?? []).length <= 1}
              onClick={() => set({ buttons: (step.buttons ?? []).filter((_, j) => j !== r.slot) })}><LeadIcon name="x" size={14} /></button>
          ) : null}
        </div>
      ))}
      <div className={s.edFoot}>
        {step.kind === 'question' && canEdit ? (
          <button type="button" className={s.addOpt} disabled={(step.buttons ?? []).length >= 13}
            onClick={() => set({ buttons: [...(step.buttons ?? []), { label: `Option ${(step.buttons ?? []).length + 1}`, next: '' }] })}><LeadIcon name="plus" size={13} />Add button</button>
        ) : null}
        <button type="button" className={s.moreToggle} onClick={() => setMore(m => !m)} aria-expanded={more}><LeadIcon name={more ? 'chevron-down' : 'chevron-right'} size={12} />More</button>
        <span className={s.fill} />
        <button type="button" className={s.done} onClick={e => { e.stopPropagation(); onDone() }}>Done</button>
      </div>
      {more ? <MoreOptions step={step} steps={steps} canEdit={canEdit} set={set} setStep={setStep} lib={lib} info={info} today={today} text={text} /> : null}
    </div>
  )
}

/** Kept, not drawn (the user's point 2): what the step can also do, behind "More". */
function MoreOptions({ step, steps, canEdit, set, setStep, lib, info, today, text }: {
  step: TemplateStep
  steps: TemplateStep[]
  canEdit: boolean
  set: (o: Partial<TemplateStep>) => void
  setStep: (id: string, o: Partial<TemplateStep> | ((x: TemplateStep) => Partial<TemplateStep>)) => void
  lib: LibraryItem | null
  info: LeadInfo | null
  today: string
  text: React.RefObject<HTMLTextAreaElement | null>
}) {
  const dis = !canEdit
  const [infoOpen, setInfoOpen] = useState(false)
  const entries = info ? info.cards.flatMap(c => infoEntries({ ...info, cards: [c] }, c.brandId, today)) : []
  const mark = (m: '*' | '_') => {
    const el = text.current
    const v = step.text ?? ''
    const r = wrapMark(v, el?.selectionStart ?? v.length, el?.selectionEnd ?? v.length, m)
    set({ text: r.text.slice(0, 1000) })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(r.caret, r.caret) })
  }
  const insert = (token: string) => {
    const el = text.current
    const v = step.text ?? ''
    const at = el ? el.selectionStart ?? v.length : v.length
    set({ text: v.slice(0, at) + token + v.slice(at) })
    setInfoOpen(false)
  }
  const goes = (value: string | null | undefined, onChange: (v: string) => void, label: string, extra: Array<{ v: string; l: string }> = []) => (
    <select className={s.edSelect} value={value ?? ''} disabled={dis} aria-label={label} onChange={e => onChange(e.target.value)}>
      {extra.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      <option value="">Not connected</option>
      {steps.filter(x => x.id !== step.id).map(x => <option key={x.id} value={x.id}>{x.name || 'Untitled'}</option>)}
    </select>
  )
  const named = (id: string) => steps.find(x => x.id === id)?.name || 'Message'
  const closing = (value: string | undefined, onChange: (v: string) => void) => (
    <label className={s.field}>Closing message when it ends here
      <input className={s.edInput} value={value ?? ''} maxLength={1000} disabled={dis} placeholder="Empty: the template’s own" onChange={e => onChange(e.target.value)} />
    </label>
  )
  const setMulti = (on: boolean) => set(on
    ? { multi: true, buttons: (step.buttons ?? []).map(b => { const t = steps.find(x => x.id === b.next); return { ...b, next: '', also: [...(t?.kind === 'message' ? [t.id] : []), ...(b.also ?? [])].filter((id, k, a) => a.indexOf(id) === k).slice(0, ALSO_MAX) } }) }
    : { multi: false })
  return (
    <div className={s.more}>
      {lib && step.lib && lib.ver > step.lib.ver ? (
        <div className={s.libNote}>
          <span>The library has a newer version (v{lib.ver}).</span>
          <button type="button" className={s.libBtn} disabled={dis} onClick={() => setStep(step.id, x => updateFromLibrary(x, lib))}>Update</button>
          <button type="button" className={s.libBtnQuiet} disabled={dis} onClick={() => set({ lib: { id: lib.id, ver: lib.ver } })}>Keep mine</button>
        </div>
      ) : null}
      <div className={s.tools}>
        <button type="button" className={s.tool} disabled={dis} title="Bold — Messenger shows *words* in bold" onMouseDown={e => e.preventDefault()} onClick={() => mark('*')}><b>B</b></button>
        <button type="button" className={s.tool} disabled={dis} title="Italic — Messenger shows _words_ in italic" onMouseDown={e => e.preventDefault()} onClick={() => mark('_')}><i>I</i></button>
        <button type="button" className={s.tool} disabled={dis || !info} onClick={() => setInfoOpen(o => !o)}><LeadIcon name="book-open" size={12} />General info</button>
        {infoOpen ? (
          <>
            <div className={s.catcher} onClick={() => setInfoOpen(false)} aria-hidden="true" />
            <div className={s.infoMenu} role="menu">
              {entries.flatMap(e => e.fields.map(f => (
                <div key={f.token} className={s.infoRow}>
                  <span className={s.infoVal}><span className={s.infoLabel}>{e.card.name || e.card.code} · {f.label}</span><span>{f.value}</span></span>
                  <button type="button" className={s.tool} onClick={() => insert(f.token)}>Insert</button>
                </div>
              )))}
              {!entries.length ? <span className={s.busy}>Nothing in use on General info yet.</span> : null}
            </div>
          </>
        ) : null}
      </div>
      {step.kind === 'question' ? (
        <>
          <label className={s.check}><input type="checkbox" checked={!!step.multi} disabled={dis} onChange={e => setMulti(e.target.checked)} />Customer can pick more than one</label>
          {(step.buttons ?? []).map((b, j) => (
            <div key={j} className={s.field}>{b.label || `Button ${j + 1}`} · {step.multi ? 'replies with' : 'also sends first'}
              {b.also?.length ? (
                <span className={s.alsoChips}>{b.also.map(id => (
                  <span key={id} className={s.alsoChip}>{named(id)}
                    {canEdit ? <button type="button" className={s.x} aria-label="Take off" onClick={() => set({ buttons: step.buttons!.map((x, k) => (k === j ? { ...x, also: (x.also ?? []).filter(a => a !== id) } : x)) })}><LeadIcon name="x" size={12} /></button> : null}
                  </span>
                ))}</span>
              ) : null}
              {canEdit && (b.also?.length ?? 0) < ALSO_MAX ? (
                <select className={s.edSelect} value="" aria-label={`${b.label} also sends`} onChange={e => { const v = e.target.value; if (v) set({ buttons: step.buttons!.map((x, k) => (k === j ? { ...x, also: [...(x.also ?? []), v] } : x)) }) }}>
                  <option value="">+ Add a message step…</option>
                  {steps.filter(x => x.kind === 'message' && x.id !== step.id && !(b.also ?? []).includes(x.id)).map(x => <option key={x.id} value={x.id}>{x.name || 'Message'}</option>)}
                </select>
              ) : null}
              {!step.multi && !b.next ? closing(b.endMsg, v => set({ buttons: step.buttons!.map((x, k) => (k === j ? { ...x, endMsg: v } : x)) })) : null}
            </div>
          ))}
          {step.multi ? (
            <>
              <label className={s.field}>Finish button · 20 characters
                <input className={s.edInput} value={step.doneLabel ?? ''} maxLength={20} disabled={dis} placeholder="That's all" onChange={e => set({ doneLabel: e.target.value })} />
              </label>
              <label className={s.field}>When it comes back, it says
                <input className={s.edInput} value={step.againText ?? ''} maxLength={1000} disabled={dis} placeholder={`Anything else? Pick another, or tap "${doneOf(step)}".`} onChange={e => set({ againText: e.target.value })} />
              </label>
              <label className={s.field}>After “{doneOf(step)}”, goes to {goes(step.next, v => set({ next: v }), 'After the finish button, goes to')}</label>
            </>
          ) : null}
          <label className={s.field}>Keep the answer in
            <select className={s.edSelect} value={step.saveAs ?? ''} disabled={dis} onChange={e => set({ saveAs: (e.target.value || null) as TemplateStep['saveAs'] })}>
              <option value="">Don’t keep it</option>
              {SAVE_AS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </label>
        </>
      ) : null}
      {step.kind === 'text' ? (
        <label className={s.field}>Save the answer to
          <select className={s.edSelect} value={step.saveAs ?? 'note'} disabled={dis} onChange={e => set({ saveAs: e.target.value as TemplateStep['saveAs'] })}>
            {SAVE_AS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </label>
      ) : null}
      {step.kind === 'phone' ? (
        <>
          <label className={s.field}>If it’s not a phone, it says
            <textarea className={s.edText} rows={2} value={step.retryText ?? ''} maxLength={1000} disabled={dis} placeholder="Empty: the template stops and CS takes over" onChange={e => set({ retryText: e.target.value })} />
          </label>
          <label className={s.field}>Ask again up to
            <select className={s.edSelect} value={step.retryMax ?? ''} disabled={dis} onChange={e => set({ retryMax: e.target.value || null })}>
              {['1', '2', '3', '4', '5'].map(n => <option key={n} value={n}>{n} time{n === '1' ? '' : 's'}</option>)}
              <option value="">No limit</option>
            </select>
          </label>
          <label className={s.field}>Still wrong, goes to {goes(step.failNext ?? 'person', v => set({ failNext: v }), 'Still wrong', [{ v: 'person', l: 'Hand to a person' }])}</label>
        </>
      ) : null}
      {['question', 'text', 'phone'].includes(step.kind) ? (
        <label className={s.check} title="Not shown on the template's first step, or before the customer was asked anything">
          <input type="checkbox" checked={!!step.back} disabled={dis} onChange={e => set({ back: e.target.checked || undefined })} />Customer can go back (‹ Back button)
        </label>
      ) : null}
      {['phone', 'message', 'text'].includes(step.kind) && !step.next ? closing(step.endMsg, v => set({ endMsg: v })) : null}
      {step.kind === 'question' && step.multi && !step.next ? closing(step.endMsg, v => set({ endMsg: v })) : null}
    </div>
  )
}

// ── Flow map ──

type View = { x: number; y: number; z: number }
const clampZ = (z: number) => Math.min(2, Math.max(0.3, z))

function FlowMap({ steps, sel, setSel, editing, setEditing, canEdit, library, libIds, setStep, change, onCtx, onDelete, onAdd, editor }: {
  steps: TemplateStep[]
  sel: string | null
  setSel: (id: string | null) => void
  editing: string | null
  setEditing: (id: string | null) => void
  canEdit: boolean
  library: LibraryItem[]
  libIds: Set<string>
  setStep: (id: string, o: Partial<TemplateStep> | ((x: TemplateStep) => Partial<TemplateStep>)) => void
  change: (fn: (d: Draft) => Draft) => void
  onCtx: (id: string, x: number, y: number) => void
  onDelete: (id: string) => void
  onAdd: (k: StepKind | null, item: LibraryItem | null, at: { x: number; y: number }) => void
  editor: (id: string) => React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState<View>({ x: 0, y: 0, z: 1 })
  const [panning, setPanning] = useState(false)
  const [link, setLink] = useState<{ from: string; slot: number | 'next'; x: number; y: number; over: string | null } | null>(null)
  const byId = useMemo(() => new Map(steps.map(x => [x.id, x])), [steps])
  const toLayer = (cx: number, cy: number) => { const r = ref.current!.getBoundingClientRect(); return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z } }
  const zoomAt = (z: number, px: number, py: number) => setV(o => { const nz = clampZ(z); return { z: nz, x: px - (px - o.x) * (nz / o.z), y: py - (py - o.y) * (nz / o.z) } })
  const fit = useCallback(() => {
    const el = ref.current
    if (!el || !steps.length) return
    const xs = steps.map(x => x.pos!.x), ys = steps.map(x => x.pos!.y)
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const maxX = Math.max(...steps.map(x => x.pos!.x + NODE.w)), maxY = Math.max(...steps.map(x => x.pos!.y + nodeHeight(x)))
    const r = el.getBoundingClientRect()
    const z = clampZ(Math.min(1, (r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY)))
    setV({ z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z })
  }, [steps])
  useEffect(() => { fit() }, []) // eslint-disable-line react-hooks/exhaustive-deps -- once, on opening the map

  // Wheel zooms at the pointer (React's onWheel is passive: preventDefault needs a listener of our own).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-float]')) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      setV(o => { const nz = clampZ(o.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)), px = e.clientX - r.left, py = e.clientY - r.top; return { z: nz, x: px - (px - o.x) * (nz / o.z), y: py - (py - o.y) * (nz / o.z) } })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  const drag = (move: (e: MouseEvent) => void, up: (e: MouseEvent) => void) => {
    const m = (e: MouseEvent) => move(e)
    const u = (e: MouseEvent) => { window.removeEventListener('mousemove', m); window.removeEventListener('mouseup', u); up(e) }
    window.addEventListener('mousemove', m)
    window.addEventListener('mouseup', u)
  }
  const downBg = (e: ReactMouseEvent) => {
    if (e.button !== 0) return
    const sx = e.clientX, sy = e.clientY, v0 = v
    let moved = false
    setPanning(true)
    drag(ev => { if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true; setV({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy }) },
      () => { setPanning(false); if (!moved) setEditing(null) })
  }
  const downNode = (e: ReactMouseEvent, st: TemplateStep) => {
    if (e.button !== 0) return
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || (e.target as HTMLElement).closest('[data-port]')) { setSel(st.id); return }
    e.stopPropagation()
    setSel(st.id)
    if (!canEdit) return
    const sx = e.clientX, sy = e.clientY, p0 = st.pos!
    let first = true
    drag(ev => {
      const dx = (ev.clientX - sx) / v.z, dy = (ev.clientY - sy) / v.z
      if (first && Math.abs(dx) + Math.abs(dy) < 3) return
      const pos = { x: Math.round(p0.x + dx), y: Math.round(p0.y + dy) }
      if (first) { first = false; setStep(st.id, { pos }) } else change(d => ({ ...d, steps: d.steps.map(x => (x.id === st.id ? { ...x, pos } : x)) }))
    }, () => {})
  }
  const downPort = (e: ReactMouseEvent, st: TemplateStep, slot: number | 'next') => {
    if (!canEdit || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const at = toLayer(e.clientX, e.clientY)
    setLink({ from: st.id, slot, x: at.x, y: at.y, over: null })
    drag(ev => {
      const p = toLayer(ev.clientX, ev.clientY)
      const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-node]')?.getAttribute('data-node') ?? null
      setLink(l => (l ? { ...l, x: p.x, y: p.y, over: over !== st.id ? over : null } : l))
    }, ev => {
      const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-node]')?.getAttribute('data-node') ?? null
      setLink(null)
      if (!over || over === st.id) return
      setStep(st.id, slot === 'next' ? { next: over } : x => ({ buttons: (x.buttons ?? []).map((b, j) => (j === slot ? { ...b, next: over } : b)) }))
    })
  }

  const paths: Array<{ key: string; d: string; hot: boolean }> = []
  for (const st of steps) {
    mapRows(st).forEach((r, i) => {
      const t = r.to ? byId.get(r.to) : undefined
      if (!t) return
      const a = rowPort(st, i), b = inPort(t)
      paths.push({ key: `${st.id}-${i}`, d: edgePath(a.x, a.y, b.x, b.y), hot: st.id === sel || t.id === sel })
    })
  }
  const linkFrom = link ? byId.get(link.from) : undefined
  const center = () => { const r = ref.current?.getBoundingClientRect(); return r ? toLayer(r.left + r.width / 2, r.top + r.height / 2) : { x: 40, y: 40 } }

  return (
    <div ref={ref} className={s.map} data-panning={panning || undefined} onMouseDown={downBg}
      style={{ backgroundSize: `${20 * v.z}px ${20 * v.z}px`, backgroundPosition: `${v.x}px ${v.y}px` }}>
      <div className={s.layer} style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.z})` }}>
        <svg className={s.edges} aria-hidden="true">
          {paths.map(p => <path key={p.key} d={p.d} fill="none" stroke={p.hot ? 'rgb(var(--lv-accent))' : 'rgb(var(--lv-focus-line))'} strokeWidth={p.hot ? 2 : 1.5} />)}
          {link && linkFrom ? (() => { const a = link.slot === 'next' ? rowPort(linkFrom, 0) : rowPort(linkFrom, link.slot); return <path d={edgePath(a.x, a.y, link.x, link.y)} fill="none" stroke="rgb(var(--lv-accent))" strokeWidth={2} strokeDasharray="5 4" /> })() : null}
        </svg>
        {steps.map(st => {
          const t = typeOf(st.kind)
          const on = st.id === sel
          return (
            <div key={st.id} data-node={st.id} className={s.node} data-sel={on || undefined} data-drop={link?.over === st.id || undefined}
              style={{ left: st.pos!.x, top: st.pos!.y, height: nodeHeight(st) }}
              onMouseDown={e => downNode(e, st)}
              onDoubleClick={e => { const tag = (e.target as HTMLElement).tagName; if (tag !== 'INPUT' && tag !== 'TEXTAREA' && canEdit) setEditing(st.id) }}
              onContextMenu={e => { if (!canEdit) return; e.preventDefault(); e.stopPropagation(); setSel(st.id); onCtx(st.id, e.clientX, e.clientY) }}>
              <span className={s.inDot} aria-hidden="true" />
              <div className={s.nHead}>
                <span className={s.tile} style={tileStyle(st.kind)}><LeadIcon name={t.icon} size={13} /></span>
                <input className={s.nName} value={st.name ?? ''} placeholder="Untitled" maxLength={40} disabled={!canEdit} aria-label="Step name" onChange={e => setStep(st.id, { name: e.target.value })} />
                {st.lib && libIds.has(st.lib.id) ? <span className={s.libMark} title="From step library"><LeadIcon name="blocks" size={13} /></span> : null}
                {on && canEdit ? <button type="button" className={s.nDel} title="Delete step" aria-label="Delete step" onClick={e => { e.stopPropagation(); onDelete(st.id) }}><LeadIcon name="trash-2" size={13} /></button> : null}
              </div>
              <textarea className={s.nText} value={st.text ?? ''} placeholder="Write the message…" maxLength={1000} disabled={!canEdit} aria-label="Message" onChange={e => setStep(st.id, { text: e.target.value })} />
              {mapRows(st).map((r, i) => (
                <div key={String(r.slot)} className={s.nRow}>
                  {r.edit
                    ? <input className={s.nRowInput} value={r.label} maxLength={OPTION_MAX} disabled={!canEdit} aria-label={`Button ${i + 1}`} onChange={e => setStep(st.id, x => ({ buttons: (x.buttons ?? []).map((b, j) => (j === i ? { ...b, label: e.target.value } : b)) }))} />
                    : <span className={s.nRowFixed}>{r.label}</span>}
                  <span className={s.nTo} data-none={!r.to || !byId.has(r.to) || undefined}>{r.to && byId.has(r.to) ? `→ ${byId.get(r.to)!.name || 'Untitled'}` : 'Not connected'}</span>
                  <span className={s.port} data-port="" data-on={(r.to && byId.has(r.to)) || undefined} title="Drag to a step to connect" onMouseDown={e => downPort(e, st, r.slot)} />
                </div>
              ))}
              {st.kind === 'question' && canEdit ? (
                <button type="button" className={s.nAdd} disabled={(st.buttons ?? []).length >= 13}
                  onClick={e => { e.stopPropagation(); setStep(st.id, x => ({ buttons: [...(x.buttons ?? []), { label: `Option ${(x.buttons ?? []).length + 1}`, next: '' }] })) }}>
                  <LeadIcon name="plus" size={12} />Add button
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      {canEdit ? (
        <div className={s.mapAdd} onMouseDown={e => e.stopPropagation()}>
          <AddStep library={library} onAdd={(k, item) => { const c = center(); onAdd(k, item, { x: Math.round(c.x - NODE.w / 2), y: Math.round(c.y - 80) }) }} />
        </div>
      ) : null}
      <div className={s.zoom} onMouseDown={e => e.stopPropagation()}>
        <button type="button" className={s.zBtn} title="Zoom out" aria-label="Zoom out" onClick={() => { const r = ref.current!.getBoundingClientRect(); zoomAt(v.z / 1.2, r.width / 2, r.height / 2) }}><LeadIcon name="minus" size={14} /></button>
        <span className={s.zPct}>{Math.round(v.z * 100)}%</span>
        <button type="button" className={s.zBtn} title="Zoom in" aria-label="Zoom in" onClick={() => { const r = ref.current!.getBoundingClientRect(); zoomAt(v.z * 1.2, r.width / 2, r.height / 2) }}><LeadIcon name="plus" size={14} /></button>
        <button type="button" className={s.zText} onClick={fit}>Fit</button>
      </div>
      {editing && byId.has(editing) ? (
        <div className={s.floatEd} data-float="" onMouseDown={e => e.stopPropagation()}>{editor(editing)}</div>
      ) : null}
    </div>
  )
}

// ── The preview rail ──

type PvLine = { k: 'cust' | 'bot' | 'img' | 'doc' | 'btns' | 'wait'; text: string; url?: string; btns?: string[] }

function Rail({ open, setOpen, draft, from, brand, urlOf }: {
  open: boolean
  setOpen: (o: boolean) => void
  draft: Draft
  from: string | null
  brand: string
  urlOf: (f: StepFile | null | undefined) => string
}) {
  const [dev, setDev] = useState<'phone' | 'desk'>('phone')
  const startId = from && draft.steps.some(x => x.id === from) ? from : draft.steps[0]?.id ?? null
  const key = `${draft.id}|${startId}`
  const [run, setRun] = useState<{ key: string; picks: string[] }>({ key, picks: [] })
  const picks = useMemo(() => (run.key === key ? run.picks : []), [run, key])
  const add = (p: string) => setRun({ key, picks: [...picks, p] })
  const scroll = useRef<HTMLDivElement>(null)
  const lines = useMemo<PvLine[]>(() => {
    if (!startId) return []
    const t = { steps: draft.steps, endMsg: draft.endMsg }
    let w: Walk = walkFrom(t, startId)
    for (const p of picks) { if (!w.waiting) break; w = walkAnswer(t, w, p) }
    const out: PvLine[] = []
    for (const x of w.said) {
      if (x.from === 'customer') out.push({ k: 'cust', text: x.text })
      else if (x.from === 'system') out.push({ k: 'wait', text: x.text.startsWith('Goes to the AI') ? 'AI Agent takes over' : x.text.startsWith('Goes to a person') ? 'Handed to a person' : x.text })
      else if (x.file) out.push(isImage(x.file.mime) ? { k: 'img', text: x.file.name, url: urlOf(x.file) } : { k: 'doc', text: x.file.name })
      else out.push({ k: 'bot', text: x.text.replace(/\{name\}/g, 'Jason') })
    }
    const waiting = w.waiting ? draft.steps.find(x => x.id === w.waiting) : undefined
    const lastBtns = [...w.said].reverse().find(x => x.from === 'bot' && x.buttons)?.buttons
    const back = waiting?.kind !== 'question' && lastBtns?.includes(BACK_LABEL) ? [BACK_LABEL] : []
    if (waiting?.kind === 'question') {
      const shown = [...w.said].reverse().find(x => x.from === 'bot' && x.buttons)?.buttons ?? (waiting.buttons ?? []).map(b => b.label)
      if (shown.length) out.push({ k: 'btns', text: '', btns: waiting.multi ? [...shown, doneOf(waiting)] : shown })
    } else if (waiting?.kind === 'phone') out.push({ k: 'btns', text: '', btns: ['Send my number', ...back] })
    else if (waiting?.kind === 'text') out.push({ k: 'btns', text: '', btns: ['Type an answer', ...back] })
    return out
  }, [draft.steps, draft.endMsg, startId, picks, urlOf])
  const answer = (b: string) => add(b === 'Send my number' ? '012-338 4721' : b === 'Type an answer' ? 'Next Saturday afternoon' : b)
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) }, [lines, dev])

  if (!open) {
    return (
      <section className={s.rail} aria-label="Preview">
        <div className={s.railShut}><button type="button" className={s.railBtn} title="Show preview" aria-label="Show preview" onClick={() => setOpen(true)}><LeadIcon name="smartphone" size={16} /></button></div>
      </section>
    )
  }
  const body = (desk: boolean) => {
    const items = lines.map((m, i) => m.k === 'cust' ? <div key={i} className={s.cust}>{m.text}</div>
      : m.k === 'bot' ? <div key={i} className={s.bot}><RichText text={m.text} /></div>
      : m.k === 'img' ? <span key={i} className={s.img} style={{ backgroundImage: m.url ? `url("${m.url}")` : undefined }} role="img" aria-label={m.text} />
      : m.k === 'doc' ? <div key={i} className={s.doc}><span className={s.docExt}>{extOf(m.text)}</span>{m.text}</div>
      : m.k === 'btns' ? <div key={i} className={s.btns}>{m.btns!.map(b => <button key={b} type="button" className={s.pBtn} onClick={() => answer(b)}>{b}</button>)}</div>
      : <span key={i} className={s.wait}>{m.text}</span>)
    return (
      <div ref={scroll} className={s.msgs} data-desk={desk || undefined}>
        <div className={s.spacer} />
        {desk ? <div className={s.deskCol}>{items}</div> : items}
      </div>
    )
  }
  return (
    <section className={s.rail} aria-label="Preview">
      <div className={s.railHead}>
        <span className={s.fill} />
        <button type="button" className={s.railBtn} title="Hide preview" aria-label="Hide preview" onClick={() => setOpen(false)}><LeadIcon name="panel-right-close" size={16} /></button>
      </div>
      <div className={s.pvBody}>
        <div className={s.pvCtl}>
          <div className={s.devs} role="group" aria-label="Device">
            <button type="button" className={s.dev} title="Phone" aria-label="Phone" aria-pressed={dev === 'phone'} onClick={() => setDev('phone')}><LeadIcon name="smartphone" size={14} /></button>
            <button type="button" className={s.dev} title="Desktop" aria-label="Desktop" aria-pressed={dev === 'desk'} onClick={() => setDev('desk')}><LeadIcon name="monitor" size={14} /></button>
          </div>
          <button type="button" className={s.restart} title="Restart" aria-label="Restart" onClick={() => setRun({ key, picks: [] })}><LeadIcon name="rotate-ccw" size={14} /></button>
        </div>
        {dev === 'phone' ? (
          <div className={s.phone}>
            <div className={s.status}><span>9:41</span><span className={s.notch} /><span className={s.icons}><LeadIcon name="signal" size={14} /><LeadIcon name="wifi" size={14} /><LeadIcon name="battery-full" size={18} /></span></div>
            <div className={s.pHead}><span className={s.av}>H</span><span className={s.pBrand}>{brand}</span></div>
            {body(false)}
            <div className={s.home}><span /></div>
          </div>
        ) : (
          <div className={s.desk}>
            <div className={s.dBar}><span className={s.dDot} /><span className={s.dDot} /><span className={s.dDot} /><span className={s.dTitle}>Messenger</span></div>
            <div className={s.dHead}><span className={s.av} data-desk="">H</span><div className={s.dWho}><span className={s.pBrand}>{brand}</span><span className={s.dSub}>Typically replies within minutes</span></div></div>
            {body(true)}
            <div className={s.dComposer}>Aa</div>
          </div>
        )}
      </div>
    </section>
  )
}
