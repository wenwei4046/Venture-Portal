'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { removeTemplate, saveLibraryItem, saveTemplate } from '@/lib/leads/actions'
import { infoEntries, type LeadInfo } from '@/lib/leads/info'
import {
  CARD_W, KINDS, SIDE_W, clampSide, RETRY_PHONE, SAVE_AS, fromLibrary, kindOf, placed, rowsOf, runsOn, stepAfter, templateProblem, tidy, toLibrary,
  updateFromLibrary, walkAnswer, walkFrom, freshId, type LibraryItem, type ReplyRules, type ReplyTemplate, type StepKind, type TemplateStep, type Walk,
} from '@/lib/leads/template'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './replies.module.css'

/**
 * Lead View › Reply templates (2026-10-23, the redesign v2 handoff `Auto Reply.dc.html?view=template`): the templates on
 * the left; the chosen one's name, description, where the reply rules run it and its closing message; its steps as a
 * map (pan, zoom, Fit, Tidy up; drag a card by its head; "+" on an End row makes the next step; right-click a card for
 * the library); and the right panel — Edit step (message, General info tokens, what the customer does and where it
 * goes) or Test as customer (the runner's walk). Saved as a whole (lead_save_template). Kept for later, said in the
 * rules file: dragging a line's end to re-route it (the panel's "Goes to" does it), attachments (the Data Center's
 * files, step 5).
 */

type Draft = Pick<ReplyTemplate, 'id' | 'name' | 'description' | 'endMsg' | 'steps'>
const blank = (): Draft => ({
  id: `new-${Date.now().toString(36)}`, name: 'New template', description: '', endMsg: '',
  steps: [{ id: 's1', kind: 'question', name: 'Welcome', text: 'Hi {name}! What are you looking for today?', buttons: [{ label: 'Sofa', next: '' }, { label: 'Talk to a person', next: '' }], pos: { x: 40, y: 40 } }],
})
const draftOf = (t: ReplyTemplate): Draft => ({ id: t.id, name: t.name, description: t.description ?? '', endMsg: t.endMsg ?? '', steps: placed(t.steps) })
const toneStyle = (k: StepKind) => ({ ['--tone' as string]: `var(${kindOf(k).tone})` }) as CSSProperties

export default function TemplatesView({ templates, rules, ads, brands, library, info, today, ready, initialId, canEdit }: {
  templates: ReplyTemplate[]
  rules: ReplyRules
  ads: Array<{ adId: string; name: string }>
  brands: Array<{ id: string; name: string }>
  library: LibraryItem[]
  info: LeadInfo | null
  today: string
  /** Is step 4's migration applied? Before it, the canvas can be tried but not saved. */
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
  const [savedNote, setSavedNote] = useState('')
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  const [sel, setSel] = useState<string | null>(draft.steps[0]?.id ?? null)
  // Folded as drawn; whether it was left open is the viewer's (localStorage `ar-test-open`, the handoff's key).
  const [panel, setPanelState] = useState<'edit' | 'test' | null>(null)
  const setPanel = (p: 'edit' | 'test' | null) => {
    setPanelState(p)
    try { localStorage.setItem('ar-test-open', p ?? '') } catch { /* private window */ }
  }
  useEffect(() => {
    try { const v = localStorage.getItem('ar-test-open'); if (v === 'edit' || v === 'test') setPanelState(v) } catch { /* private window */ }
  }, [])
  const [toast, setToast] = useState('')
  // The right panel's width (2026-10-28 — the user: "做可调整宽度"): its left edge drags, 300–720px; the viewer's
  // (localStorage `ar-side-w`); a double-click puts it back.
  const [sideW, setSideW] = useState(SIDE_W.start)
  useEffect(() => {
    try { const v = Number(localStorage.getItem('ar-side-w')); if (v) setSideW(clampSide(v)) } catch { /* private window */ }
  }, [])
  const keepSide = (w: number) => { try { localStorage.setItem('ar-side-w', String(w)) } catch { /* private window */ } }
  const dragSide = (e: ReactMouseEvent) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = sideW
    let w = w0
    const move = (ev: MouseEvent) => { w = clampSide(w0 + (x0 - ev.clientX)); setSideW(w) }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); document.body.style.cursor = ''; keepSide(w) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.cursor = 'col-resize'
  }

  useEffect(() => {
    if (!dirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t) }, [toast])

  /** Every change goes through here: undo keeps the one before. */
  const change = useCallback((fn: (d: Draft) => Draft) => {
    setDraft(d => { setPast(p => [...p.slice(-49), d]); setFuture([]); return fn(d) })
    setDirty(true)
    setSavedNote('')
    setError('')
  }, [])
  const setStep = (id: string, o: Partial<TemplateStep> | ((x: TemplateStep) => Partial<TemplateStep>)) =>
    change(d => ({ ...d, steps: d.steps.map(x => (x.id === id ? { ...x, ...(typeof o === 'function' ? o(x) : o) } : x)) }))
  const undo = () => { if (!past.length) return; setFuture(f => [draft, ...f]); setDraft(past[past.length - 1]); setPast(p => p.slice(0, -1)); setDirty(true) }
  const redo = () => { if (!future.length) return; setPast(p => [...p, draft]); setDraft(future[0]); setFuture(f => f.slice(1)); setDirty(true) }

  const open = (t: ReplyTemplate | null) => {
    // Already on a new template nobody has touched: + New template has nothing to do (2026-10-27 — the user, asked to
    // leave without saving at every click: "我要加template 为什么会一直这样？").
    if (!t && draft.id.startsWith('new-') && !dirty) return
    if (dirty && !window.confirm('Leave this template without saving its changes?')) return
    const d = t ? draftOf(t) : blank()
    // A new template counts as changed only once something is edited; it can be saved as it stands (isNew below).
    setDraft(d); setPast([]); setFuture([]); setDirty(false); setSel(d.steps[0]?.id ?? null); setError(''); setSavedNote('')
    window.history.replaceState(null, '', t ? `/leads/flows?t=${t.id}` : '/leads/flows')
  }
  const removeStep = (id: string) => {
    change(d => ({
      ...d,
      steps: d.steps.filter(x => x.id !== id).map(x => ({
        ...x,
        ...(x.buttons ? { buttons: x.buttons.map(b => (b.next === id ? { ...b, next: '' } : b)) } : {}),
        ...(x.next === id ? { next: '' } : {}),
        ...(x.failNext === id ? { failNext: 'person' } : {}),
      })),
    }))
    setSel(null)
  }
  const save = () => {
    const problem = templateProblem(draft.steps)
    if (problem) { setError(problem); return }
    start(async () => {
      const isNew = draft.id.startsWith('new-')
      const r = await saveTemplate(isNew ? null : draft.id, { name: draft.name, description: draft.description, endMsg: draft.endMsg, steps: draft.steps })
      if (!r.ok) { setError(r.reason); return }
      if (isNew) { setDraft(d => ({ ...d, id: r.data })); window.history.replaceState(null, '', `/leads/flows?t=${r.data}`) }
      setDirty(false)
      setSavedNote('Saved · just now')
      router.refresh()
    })
  }
  const discard = () => {
    const t = list.find(x => x.id === draft.id)
    const d = t ? draftOf(t) : blank()
    setDraft(d); setDirty(false); setPast([]); setFuture([]); setError('')
  }
  const removeTpl = (t: ReplyTemplate) => {
    if (!window.confirm(`Delete “${t.name}”? Rules that use it will need another reply.`)) return
    start(async () => {
      const r = await removeTemplate(t.id)
      if (!r.ok) { setError(r.reason); return }
      setList(l => l.filter(x => x.id !== t.id))
      if (draft.id === t.id) { const next = list.find(x => x.id !== t.id) ?? null; setDirty(false); open(next) }
      router.refresh()
    })
  }
  const copyTpl = (t: ReplyTemplate) => {
    if (dirty && !window.confirm('Leave this template without saving its changes?')) return
    const d = { ...draftOf(t), id: `new-${Date.now().toString(36)}`, name: `${t.name} (copy)`.slice(0, 60) }
    setDraft(d); setDirty(false); setSel(d.steps[0]?.id ?? null)
  }

  // ── Library from the canvas ──
  const libById = useMemo(() => new Map(library.map(l => [l.id, l])), [library])
  const toLib = (step: TemplateStep, withAfter: boolean, asNew = false) => {
    const steps = toLibrary(draft.steps, step.id, withAfter)
    const linked = step.lib && libById.has(step.lib.id) && !asNew && !withAfter
    start(async () => {
      const r = await saveLibraryItem(linked ? step.lib!.id : null, {
        kind: steps.length > 1 ? 'flow' : 'step',
        name: (step.name || step.text).slice(0, 60) || 'Step',
        description: linked ? libById.get(step.lib!.id)!.description : '',
        steps,
      })
      if (!r.ok) { setError(r.reason); return }
      if (!withAfter) setStep(step.id, { lib: { id: r.data, ver: linked ? step.lib!.ver + 1 : 1 } })
      setToast(linked ? 'Saved to the library as a new version' : 'Saved to the library')
      router.refresh()
    })
  }

  const step = draft.steps.find(x => x.id === sel) ?? null
  const brandName = (id: string) => brands.find(b => b.id === id)?.name ?? '—'
  const adName = (id: string) => ads.find(a => a.adId === id)?.name || `Ad ${id}`
  const isNew = draft.id.startsWith('new-')

  // Keyboard: ←/→ steps, undo / redo, Delete.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (!canEdit && (e.key === 'Delete' || e.key === 'Backspace')) return
      const i = draft.steps.findIndex(x => x.id === sel)
      if (e.key === 'ArrowRight' && i < draft.steps.length - 1) setSel(draft.steps[i + 1].id)
      if (e.key === 'ArrowLeft' && i > 0) setSel(draft.steps[i - 1].id)
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && draft.steps.length > 1) removeStep(sel)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>REPLIES</span>
          <h1 className={s.title}>Reply templates</h1>
        </div>
        {canEdit ? <button type="button" className={s.btn} data-strong="" disabled={!(dirty || isNew) || busy || !ready} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button> : null}
      </div>
      <div className={s.panel}>
        <div className={s.split}>
          <aside className={s.list} aria-label="Templates">
            <span className={s.kicker} style={{ padding: '2px 4px 6px' }}>TEMPLATES</span>
            {list.map(t => (
              <button key={t.id} type="button" className={s.listItem} aria-current={t.id === draft.id} onClick={() => t.id !== draft.id && open(t)}>
                <span className={s.listName}>{t.id === draft.id ? draft.name : t.name}</span>
                <span className={s.listSub}>{t.steps.length} step{t.steps.length === 1 ? '' : 's'}</span>
                {canEdit ? (
                  <span className={s.listTools}>
                    <span role="button" tabIndex={0} className={s.cardIcon} title="Copy" onClick={e => { e.stopPropagation(); copyTpl(t) }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); copyTpl(t) } }}><LeadIcon name="copy" size={11} /></span>
                    <span role="button" tabIndex={0} className={s.cardIcon} title="Delete" onClick={e => { e.stopPropagation(); removeTpl(t) }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); removeTpl(t) } }}><LeadIcon name="trash" size={11} /></span>
                  </span>
                ) : null}
              </button>
            ))}
            {isNew ? <button type="button" className={s.listItem} aria-current><span className={s.listName}>{draft.name}</span><span className={s.listSub}>Not saved yet</span></button> : null}
            {canEdit ? <button type="button" className={s.link} style={{ padding: '6px 4px', textAlign: 'left' }} onClick={() => open(null)}>+ New template</button> : null}
          </aside>

          <section className={s.editor}>
            <div className={s.tplHead}>
              <div className={s.tplInfo}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input className={s.tplName} value={draft.name} maxLength={60} disabled={!canEdit} aria-label="Template name"
                    onChange={e => change(d => ({ ...d, name: e.target.value }))} />
                  <span style={{ color: 'rgb(var(--lv-accent-text))', display: 'flex' }}><LeadIcon name="filePen" size={14} /></span>
                </span>
                <input className={s.bare} value={draft.description} maxLength={300} disabled={!canEdit} placeholder="Add a description, e.g. when to use this template" aria-label="Description"
                  onChange={e => change(d => ({ ...d, description: e.target.value }))} />
                <span className={s.small}>{isNew ? 'Not used by any reply rule yet' : runsOn(draft.id, rules, brandName, adName)}</span>
                <span className={s.closing}>Closing message
                  <input className={s.bare} value={draft.endMsg} maxLength={1000} disabled={!canEdit} placeholder="Sent when a chat reaches End, e.g. Thanks! We'll be in touch soon 😊" aria-label="Closing message"
                    onChange={e => change(d => ({ ...d, endMsg: e.target.value }))} />
                </span>
              </div>
              {canEdit ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={s.hint} data-dirty={dirty || undefined}>{dirty ? 'Unsaved changes' : isNew ? 'New template — not saved yet' : savedNote || 'No changes yet'}</span>
                  <button type="button" className={s.btn} data-quiet="" disabled={!dirty || busy} onClick={discard}>Discard</button>
                  <button type="button" className={s.btn} data-strong="" disabled={!(dirty || isNew) || busy || !ready} onClick={save} title={!ready ? 'Waiting for the database update' : undefined}>{busy ? 'Saving…' : 'Save'}</button>
                </span>
              ) : null}
            </div>
            {!ready ? <div className={s.note} style={{ margin: '8px 14px 0' }}>Waiting for the database update — you can try the canvas, but nothing is saved yet.</div> : null}
            {error ? <div className={s.error} role="alert" style={{ margin: '8px 14px 0' }}>{error}</div> : null}
            <div className={s.tplBody}>
              <Canvas draft={draft} sel={sel} setSel={id => { setSel(id); if (id && panel === null) setPanel('edit') }} canEdit={canEdit} library={library} libById={libById}
                change={change} setStep={setStep} removeStep={removeStep} toLib={toLib} setPanel={setPanel} />
              {panel === null ? (
                <div className={s.sideClosed}>
                  <button type="button" className={s.cardIcon} title="Open the panel" onClick={() => setPanel('edit')}>«</button>
                  <button type="button" className={s.vertical} onClick={() => setPanel('edit')}>Edit step</button>
                  <button type="button" className={s.vertical} onClick={() => setPanel('test')}>Test as customer</button>
                </div>
              ) : (
                <aside className={s.side} aria-label="Step" style={{ width: sideW }}>
                  <div className={s.sideGrip} onMouseDown={dragSide} onDoubleClick={() => { setSideW(SIDE_W.start); keepSide(SIDE_W.start) }} title="Drag to resize · double-click to reset" aria-hidden="true" />
                  <div className={s.sideTabs}>
                    <button type="button" className={s.sideTab} aria-pressed={panel === 'edit'} onClick={() => setPanel('edit')}>Edit step</button>
                    <button type="button" className={s.sideTab} aria-pressed={panel === 'test'} onClick={() => setPanel('test')}>Test as customer</button>
                    <span className={s.fill} />
                    <button type="button" className={s.cardIcon} title="Close the panel" onClick={() => setPanel(null)}>»</button>
                  </div>
                  {panel === 'test' ? (
                    <TestChat key={draft.id + draft.steps.length} draft={draft} />
                  ) : step ? (
                    <EditStep key={step.id} step={step} draft={draft} setSel={setSel} canEdit={canEdit} setStep={setStep} removeStep={removeStep}
                      insertAfter={() => {
                        const n = stepAfter(draft.steps, step, 'New step')
                        change(d => ({ ...d, steps: [...d.steps, { ...n, name: '' }] }))
                        setSel(n.id)
                      }}
                      lib={step.lib ? libById.get(step.lib.id) ?? null : null} toLib={toLib} info={info} today={today} />
                  ) : (
                    <div className={s.sideBody}><span className={s.small}>Pick a step on the map to edit it.</span></div>
                  )}
                </aside>
              )}
              {toast ? <div className={s.toast} role="status">{toast}</div> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── The map ──

type Line = { key: string; d: string; tone: string; to: string; from: string; head: string }

function Canvas({ draft, sel, setSel, canEdit, library, libById, change, setStep, removeStep, toLib, setPanel }: {
  draft: Draft
  sel: string | null
  setSel: (id: string | null) => void
  canEdit: boolean
  library: LibraryItem[]
  libById: Map<string, LibraryItem>
  change: (fn: (d: Draft) => Draft) => void
  setStep: (id: string, o: Partial<TemplateStep> | ((x: TemplateStep) => Partial<TemplateStep>)) => void
  removeStep: (id: string) => void
  toLib: (step: TemplateStep, withAfter: boolean, asNew?: boolean) => void
  setPanel: (p: 'edit' | 'test' | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [hover, setHover] = useState<string | null>(null)
  const [addMenu, setAddMenu] = useState(false)
  const [libOpen, setLibOpen] = useState(false)
  const [libQ, setLibQ] = useState('')
  const [libKind, setLibKind] = useState<'all' | 'step' | 'flow'>('all')
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string } | null>(null)
  // A card being dragged: its place moves live; one undo step when let go.
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const posOf = (st: TemplateStep) => (dragPos?.id === st.id ? { x: dragPos.x, y: dragPos.y } : st.pos ?? { x: 40, y: 40 })

  // Lines: measured from the cards as drawn (rows' right edge → the target card's left, top).
  useLayoutEffect(() => {
    const w = world.current
    if (!w) return
    const at = (el: Element) => { const r = el.getBoundingClientRect(); const o = w.getBoundingClientRect(); return { x: (r.left - o.left) / zoom, y: (r.top - o.top) / zoom, w: r.width / zoom, h: r.height / zoom } }
    const next: Line[] = []
    for (const st of draft.steps) {
      const tone = kindOf(st.kind).tone
      const outs: Array<{ i: number; to: string }> = rowsOf(st).filter(r => r.next).map(r => ({ i: r.i, to: r.next }))
      if (st.kind === 'phone' && st.failNext && st.failNext !== 'person') outs.push({ i: -2, to: st.failNext })
      for (const o of outs) {
        const port = w.querySelector(`[data-port="${st.id}:${o.i === -2 ? -1 : o.i}"]`)
        const card = w.querySelector(`[data-card="${o.to}"]`)
        if (!port || !card) continue
        const p = at(port), c = at(card)
        const x1 = p.x + p.w, y1 = p.y + p.h / 2 + (o.i === -2 ? 4 : 0), x2 = c.x - 2, y2 = c.y + 14
        next.push({ key: `${st.id}:${o.i}:${o.to}`, d: orth(x1, y1, x2, y2), tone, to: o.to, from: st.id, head: `M${x2 - 7},${y2 - 4} L${x2},${y2} L${x2 - 7},${y2 + 4}` })
      }
    }
    setLines(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [zoom, draft.steps, dragPos])

  const fit = () => {
    const el = box.current
    if (!el || draft.steps.length === 0) return
    const xs = draft.steps.map(x => x.pos?.x ?? 0), ys = draft.steps.map(x => x.pos?.y ?? 0)
    const minX = Math.min(...xs) - 30, minY = Math.min(...ys) - 50, maxX = Math.max(...xs) + CARD_W + 40, maxY = Math.max(...ys) + 260
    // Readable first: never below 60%; the toolbar keeps its 48px at the top.
    const z = Math.max(0.6, Math.min(1, Math.min(el.clientWidth / (maxX - minX), (el.clientHeight - 48) / (maxY - minY))))
    setZoom(Math.round(z * 100) / 100)
    setPan({ x: -minX * z, y: -minY * z + 48 })
  }
  // A template opens at 100%, its first steps at the top left, as drawn; Fit is the button's.
  const place = () => {
    if (draft.steps.length === 0) return
    const minX = Math.min(...draft.steps.map(x => x.pos?.x ?? 0)) - 30, minY = Math.min(...draft.steps.map(x => x.pos?.y ?? 0)) - 50
    setZoom(1)
    setPan({ x: -minX, y: -minY + 48 })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { place() }, [draft.id])

  const onBgDown = (e: ReactMouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-card],[data-ui]')) return
    setSel(null); setLibOpen(false); setAddMenu(false)
    const x0 = e.clientX, y0 = e.clientY, p0 = pan
    setPanning(true)
    const move = (ev: MouseEvent) => setPan({ x: p0.x + ev.clientX - x0, y: p0.y + ev.clientY - y0 })
    const up = () => { setPanning(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const onCardDrag = (e: ReactMouseEvent, st: TemplateStep) => {
    if (e.button !== 0 || !canEdit || (e.target as HTMLElement).closest('button,input')) return
    e.preventDefault()
    setSel(st.id)
    const x0 = e.clientX, y0 = e.clientY, p0 = st.pos ?? { x: 40, y: 40 }
    let last = p0
    const move = (ev: MouseEvent) => { last = { x: Math.round(p0.x + (ev.clientX - x0) / zoom), y: Math.round(p0.y + (ev.clientY - y0) / zoom) }; setDragPos({ id: st.id, ...last }) }
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      setDragPos(null)
      if (last.x !== p0.x || last.y !== p0.y) setStep(st.id, { pos: last })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) { setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY })); return }
    const z = Math.max(0.4, Math.min(1.6, zoom * (e.deltaY > 0 ? 0.9 : 1.1)))
    setZoom(Math.round(z * 100) / 100)
  }
  const worldPoint = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect()
    return { x: Math.round((clientX - r.left - pan.x) / zoom), y: Math.round((clientY - r.top - pan.y) / zoom) }
  }
  const centre = () => { const el = box.current!; return worldPoint(el.getBoundingClientRect().left + el.clientWidth / 2 - CARD_W / 2, el.getBoundingClientRect().top + 80) }
  const addBlank = () => {
    const at = centre()
    const id = freshId(draft.steps)
    change(d => ({ ...d, steps: [...d.steps, { id, kind: 'message', name: '', text: '', next: '', pos: at }] }))
    setSel(id); setPanel('edit'); setAddMenu(false)
  }
  const addFromLib = (item: LibraryItem, at = centre()) => {
    const copies = fromLibrary(draft.steps, item, at)
    change(d => ({ ...d, steps: [...d.steps, ...copies] }))
    setSel(copies[0]?.id ?? null); setAddMenu(false)
  }
  const shownLib = library.filter(l => (libKind === 'all' || l.kind === libKind) && (!libQ.trim() || `${l.name} ${l.description}`.toLowerCase().includes(libQ.trim().toLowerCase())))

  return (
    <div ref={box} className={s.canvas} data-panning={panning || undefined} onMouseDown={onBgDown} onWheel={onWheel}
      onDragOver={e => { if (e.dataTransfer.types.includes('text/lead-lib')) e.preventDefault() }}
      onDrop={e => { const id = e.dataTransfer.getData('text/lead-lib'); const item = library.find(l => l.id === id); if (item && canEdit) { e.preventDefault(); addFromLib(item, worldPoint(e.clientX, e.clientY)) } }}>
      {canEdit ? (
        <div className={s.toolbar} data-ui="">
          <span style={{ position: 'relative' }}>
            <button type="button" className={s.toolBtn} onClick={() => setAddMenu(o => !o)} aria-expanded={addMenu}><LeadIcon name="plus" size={13} />Step<LeadIcon name="chevronDown" size={12} /></button>
            {addMenu ? (
              <>
                <div className={s.scrim} onClick={() => setAddMenu(false)} aria-hidden="true" />
                <div className={s.menu} style={{ top: 32, left: 0 }} role="menu">
                  <button type="button" className={s.menuItem} onClick={addBlank}>Blank step</button>
                  {library.length ? <div className={s.menuGroup}>FROM LIBRARY</div> : null}
                  {library.slice(0, 5).map(l => <button key={l.id} type="button" className={s.menuItem} onClick={() => addFromLib(l)}>{l.name}<span className={s.small}>{l.kind === 'flow' ? `${l.steps.length} steps` : kindOf(l.steps[0]?.kind ?? 'message').short}</span></button>)}
                  <div className={s.menuRule} />
                  <button type="button" className={s.menuItem} onClick={() => { setLibOpen(true); setAddMenu(false) }}>Browse library…</button>
                </div>
              </>
            ) : null}
          </span>
          <button type="button" className={s.toolBtn} data-plain="" aria-pressed={libOpen} onClick={() => setLibOpen(o => !o)}><LeadIcon name="bookOpen" size={13} />Library</button>
        </div>
      ) : null}
      {libOpen ? (
        <div className={s.libPanel} data-ui="">
          <div className={s.libSideHead}>
            <input className={s.input} value={libQ} onChange={e => setLibQ(e.target.value)} placeholder="Search steps and flows" aria-label="Search the library" />
            <span className={s.seg}>
              {(['all', 'step', 'flow'] as const).map(k => <button key={k} type="button" className={s.segBtn} aria-pressed={libKind === k} onClick={() => setLibKind(k)}>{k === 'all' ? 'All' : k === 'step' ? 'Steps' : 'Flows'}</button>)}
            </span>
          </div>
          <div className={s.libList}>
            {shownLib.length === 0 ? <span className={s.small}>Nothing in the library yet — right-click a step to save it here.</span> : shownLib.map(l => (
              <div key={l.id} className={s.libCard} draggable onDragStart={e => e.dataTransfer.setData('text/lead-lib', l.id)} title="Drag onto the map, or Add">
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span className={s.listName}>{l.name}</span>
                  <span className={s.listSub}>{l.kind === 'flow' ? `Flow · ${l.steps.length} steps` : `${kindOf(l.steps[0]?.kind ?? 'message').short} step`} · v{l.ver}</span>
                </span>
                <button type="button" className={s.link} onClick={() => addFromLib(l)}>Add</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div ref={world} className={s.world} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className={s.lines} width={1} height={1} aria-hidden="true">
          {lines.map(l => {
            const on = hover === l.key || sel === l.from || sel === l.to
            return (
              <g key={l.key} style={{ color: `rgb(var(${l.tone}))`, opacity: on ? 1 : 0.7 }}>
                <path d={l.d} fill="none" stroke="currentColor" strokeWidth={on ? 2.25 : 1.4} />
                <path d={l.head} fill="none" stroke="currentColor" strokeWidth={on ? 2.25 : 1.4} />
                <path d={l.d} fill="none" stroke="transparent" strokeWidth={10} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onMouseEnter={() => setHover(l.key)} onMouseLeave={() => setHover(null)} onClick={() => setSel(l.to)} />
              </g>
            )
          })}
        </svg>
        {draft.steps.map((st, idx) => {
          const p = posOf(st)
          const linked = st.lib ? libById.get(st.lib.id) : undefined
          const rows = rowsOf(st)
          return (
            <div key={st.id} data-card={st.id} className={s.card} style={{ left: p.x, top: p.y, ...toneStyle(st.kind) }} aria-selected={sel === st.id}
              onMouseDown={e => { if (e.button === 0) setSel(st.id) }}
              onContextMenu={e => { if (!canEdit) return; e.preventDefault(); const r = box.current!.getBoundingClientRect(); setCtx({ x: e.clientX - r.left, y: e.clientY - r.top, id: st.id }) }}>
              <div className={s.cardHead} onMouseDown={e => onCardDrag(e, st)}>
                <span className={s.num} data-start={idx === 0 || undefined} title={idx === 0 ? 'Start' : undefined}>{idx + 1}</span>
                {st.lib ? <span className={s.libDot} data-old={linked && linked.ver > st.lib.ver ? '' : undefined} title={linked ? `From library · ${linked.name} · v${st.lib.ver}${linked.ver > st.lib.ver ? ` (v${linked.ver} is newer)` : ''}` : 'From the library (item removed)'}><LeadIcon name="bookOpen" size={12} /></span> : null}
                <span className={s.cardName}>{st.name || kindOf(st.kind).label}</span>
                <button type="button" className={s.cardIcon} title="Edit step" onClick={() => { setSel(st.id); setPanel('edit') }}><LeadIcon name="filePen" size={11} /></button>
                {canEdit && draft.steps.length > 1 ? <button type="button" className={s.cardIcon} title="Delete step" onClick={() => removeStep(st.id)}><LeadIcon name="trash" size={11} /></button> : null}
              </div>
              <div className={s.cardText} data-empty={st.text?.trim() ? undefined : ''}>{st.text?.trim() || (st.kind === 'handoff' || st.kind === 'ai' ? 'No message' : 'Write the message…')}</div>
              {rows.length ? (
                <div className={s.rows}>
                  {rows.map(r => (
                    <div key={r.i} className={s.row}>
                      <span className={s.pill} data-summary={r.i === -1 ? '' : undefined}>{r.label || '—'}</span>
                      <span className={s.target}>{r.next ? `→ ${draft.steps.findIndex(x => x.id === r.next) + 1}` : 'End'}</span>
                      {!r.next && canEdit ? (
                        <button type="button" className={s.plus} title="Add the next step"
                          onClick={() => {
                            const n = stepAfter(draft.steps, st, r.i === -1 ? '' : r.label)
                            change(d => ({
                              ...d,
                              steps: [...d.steps.map(x => (x.id !== st.id ? x : r.i === -1 ? { ...x, next: n.id } : { ...x, buttons: x.buttons!.map((b, j) => (j === r.i ? { ...b, next: n.id } : b)) })), { ...n, pos: { x: n.pos!.x, y: p.y + (r.i > 0 ? r.i * 40 : 0) } }],
                            }))
                            setSel(n.id); setPanel('edit')
                          }}><LeadIcon name="plus" size={10} /></button>
                      ) : null}
                      {r.next ? <span className={s.port} data-port={`${st.id}:${r.i}`} /> : <span data-port={`${st.id}:${r.i}`} style={{ width: 0 }} />}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={s.waitRow}>{st.kind === 'ai' ? '→ AI Agent drafts · waits for CS' : '→ Waiting in the Inbox'}</div>
              )}
            </div>
          )
        })}
      </div>

      {ctx ? (() => {
        const st = draft.steps.find(x => x.id === ctx.id)
        if (!st) return null
        const linked = st.lib && libById.get(st.lib.id)
        return (
          <>
            <div className={s.scrim} onClick={() => setCtx(null)} onContextMenu={e => { e.preventDefault(); setCtx(null) }} aria-hidden="true" />
            <div className={s.menu} style={{ left: ctx.x, top: ctx.y }} role="menu" data-ui="">
              {linked ? (
                <>
                  <button type="button" className={s.menuItem} onClick={() => { toLib(st, false); setCtx(null) }}>Save my changes to the library</button>
                  <button type="button" className={s.menuItem} onClick={() => { toLib(st, false, true); setCtx(null) }}>Save as a new library item</button>
                  <a className={s.menuItem} href={`/leads/library?i=${linked.id}`}>Open in library</a>
                  <button type="button" className={s.menuItem} onClick={() => { setStep(st.id, { lib: undefined }); setCtx(null) }}>Unlink from library</button>
                </>
              ) : (
                <>
                  <button type="button" className={s.menuItem} onClick={() => { toLib(st, false); setCtx(null) }}>Save to library</button>
                  <button type="button" className={s.menuItem} onClick={() => { toLib(st, true); setCtx(null) }}>Save with the steps after it</button>
                </>
              )}
              <div className={s.menuRule} />
              <button type="button" className={s.menuItem} onClick={() => { setSel(st.id); setPanel('edit'); setCtx(null) }}>Edit step</button>
            </div>
          </>
        )
      })() : null}

      <div className={s.zoom} data-ui="">
        <button type="button" onClick={() => setZoom(z => Math.max(0.4, Math.round((z - 0.1) * 100) / 100))} aria-label="Zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => Math.min(1.6, Math.round((z + 0.1) * 100) / 100))} aria-label="Zoom in">+</button>
        <button type="button" onClick={fit}>Fit</button>
        {canEdit ? <button type="button" onClick={() => { change(d => ({ ...d, steps: tidy(d.steps) })); setTimeout(fit, 0) }}>Tidy up</button> : null}
      </div>
    </div>
  )
}

/** An orthogonal line with rounded corners: right from the row, then to the card's left edge (around it when behind). */
function orth(x1: number, y1: number, x2: number, y2: number): string {
  const r = 6
  const pts: Array<[number, number]> = x2 > x1 + 24
    ? [[x1, y1], [x1 + Math.max(16, (x2 - x1) / 2), y1], [x1 + Math.max(16, (x2 - x1) / 2), y2], [x2, y2]]
    : [[x1, y1], [x1 + 18, y1], [x1 + 18, y1 + (y2 > y1 ? 1 : -1) * Math.max(30, Math.abs(y2 - y1) / 2)], [x2 - 18, y1 + (y2 > y1 ? 1 : -1) * Math.max(30, Math.abs(y2 - y1) / 2)], [x2 - 18, y2], [x2, y2]]
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1]
    const k1 = Math.min(r, Math.hypot(cx - px, cy - py) / 2), k2 = Math.min(r, Math.hypot(nx - cx, ny - cy) / 2)
    const ax = cx - Math.sign(cx - px) * k1, ay = cy - Math.sign(cy - py) * k1
    const bx = cx + Math.sign(nx - cx) * k2, by = cy + Math.sign(ny - cy) * k2
    d += ` L${ax},${ay} Q${cx},${cy} ${bx},${by}`
  }
  const last = pts[pts.length - 1]
  return `${d} L${last[0]},${last[1]}`
}

// ── Edit step ──

function EditStep({ step, draft, setSel, canEdit, setStep, removeStep, insertAfter, lib, toLib, info, today }: {
  step: TemplateStep
  draft: Draft
  setSel: (id: string | null) => void
  canEdit: boolean
  setStep: (id: string, o: Partial<TemplateStep> | ((x: TemplateStep) => Partial<TemplateStep>)) => void
  removeStep: (id: string) => void
  insertAfter: () => void
  lib: LibraryItem | null
  toLib: (step: TemplateStep, withAfter: boolean, asNew?: boolean) => void
  info: LeadInfo | null
  today: string
}) {
  const i = draft.steps.findIndex(x => x.id === step.id)
  const dis = !canEdit
  const set = (o: Partial<TemplateStep>) => setStep(step.id, o)
  const text = useRef<HTMLTextAreaElement>(null)
  const [kindOpen, setKindOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [infoCard, setInfoCard] = useState(0)
  // Every live card, whatever its brand: a template may run on any page.
  const allEntries = info ? info.cards.flatMap(c => infoEntries({ ...info, cards: [c] }, c.brandId, today)) : []
  const insertToken = (token: string) => {
    const el = text.current
    const v = step.text ?? ''
    const at = el ? el.selectionStart ?? v.length : v.length
    set({ text: v.slice(0, at) + token + v.slice(at) })
    setInfoOpen(false)
  }
  const goes = (value: string | null | undefined, onChange: (v: string) => void, label: string, extra: Array<{ v: string; l: string }> = []) => (
    <select className={s.select} value={value ?? ''} disabled={dis} aria-label={label} onChange={e => onChange(e.target.value)}>
      {extra.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      <option value="">End here</option>
      {draft.steps.map((x, j) => <option key={x.id} value={x.id}>{j + 1} · {x.name || kindOf(x.kind).label}</option>)}
    </select>
  )
  const closing = (value: string | undefined, onChange: (v: string) => void) => (
    <label className={s.field}>Closing message when it ends here · empty uses the template’s
      <input className={s.input} value={value ?? ''} maxLength={1000} disabled={dis} placeholder={draft.endMsg || 'e.g. Thanks! Our salesperson will WhatsApp you soon 😊'} onChange={e => onChange(e.target.value)} />
    </label>
  )
  const setKind = (k: StepKind) => {
    const o: Partial<TemplateStep> = { kind: k }
    if (k === 'question' && !(step.buttons ?? []).length) o.buttons = [{ label: 'Option 1', next: step.next ?? '' }]
    if (k !== 'question') o.next = step.next ?? step.buttons?.[0]?.next ?? ''
    if (k === 'phone' && !step.retryText) { o.retryText = RETRY_PHONE; o.retryMax = '2'; o.failNext = 'person' }
    set(o)
  }

  return (
    <>
      <div className={s.sideHead} style={toneStyle(step.kind)}>
        <span className={s.num} data-start={i === 0 || undefined}>{i + 1}</span>
        <input className={s.input} style={{ flex: 1 }} value={step.name ?? ''} maxLength={40} disabled={dis} placeholder={kindOf(step.kind).label} aria-label="Step name" onChange={e => set({ name: e.target.value })} />
        <button type="button" className={s.cardIcon} disabled={i <= 0} title="Previous step" onClick={() => setSel(draft.steps[i - 1].id)}>‹</button>
        <span className={s.small}>{i + 1} / {draft.steps.length}</span>
        <button type="button" className={s.cardIcon} disabled={i >= draft.steps.length - 1} title="Next step" onClick={() => setSel(draft.steps[i + 1].id)}>›</button>
        {canEdit ? (
          <>
            <button type="button" className={s.cardIcon} title={step.lib && lib ? 'Save changes to library' : 'Save to library'} onClick={() => toLib(step, false)}><LeadIcon name="bookOpen" size={11} /></button>
            <button type="button" className={s.cardIcon} title="Insert a step after" onClick={insertAfter}><LeadIcon name="plus" size={11} /></button>
            {draft.steps.length > 1 ? <button type="button" className={s.cardIcon} title="Delete step" onClick={() => removeStep(step.id)}><LeadIcon name="trash" size={11} /></button> : null}
          </>
        ) : null}
      </div>
      <div className={s.sideBody}>
        {step.lib ? <div className={s.libBox}>From library · {lib?.name ?? 'an item since removed'} · v{step.lib.ver}</div> : null}
        {step.lib && lib && lib.ver > step.lib.ver ? (
          <div className={s.oldBox}>
            The library has a newer version (v{lib.ver}). Update this step?
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={s.btn} data-strong="" disabled={dis} onClick={() => setStep(step.id, x => updateFromLibrary(x, lib))}>Update</button>
              <button type="button" className={s.btn} data-quiet="" disabled={dis} onClick={() => set({ lib: { id: lib.id, ver: lib.ver } })}>Keep mine</button>
            </span>
          </div>
        ) : null}

        <span className={s.label}>MESSAGE</span>
        <textarea ref={text} className={s.textarea} rows={4} value={step.text ?? ''} maxLength={1000} disabled={dis} aria-label="Message"
          placeholder={step.kind === 'handoff' ? 'Optional — e.g. One of our team will reply shortly.' : 'What the customer reads'} onChange={e => set({ text: e.target.value })} />
        <span style={{ display: 'flex', gap: 8, position: 'relative' }}>
          <button type="button" className={s.toolBtn} data-plain="" disabled={dis || !info} onClick={() => setInfoOpen(o => !o)} title={!info ? 'General info waits for its database update' : undefined}><LeadIcon name="bookOpen" size={12} />General info<LeadIcon name="chevronDown" size={12} /></button>
          <button type="button" className={s.toolBtn} data-plain="" disabled title="Attachments come with the Data Center’s files (step 5)"><LeadIcon name="paperclip" size={12} />Attach</button>
          {infoOpen ? (
            <>
              <div className={s.scrim} onClick={() => setInfoOpen(false)} aria-hidden="true" />
              <div className={s.menu} style={{ top: 32, left: 0, width: 320 }}>
                <span style={{ display: 'flex', alignItems: 'center', padding: '6px 8px' }}><span className={s.label} style={{ flex: 1 }}>INSERT GENERAL INFO</span><button type="button" className={s.x} onClick={() => setInfoOpen(false)}>×</button></span>
                {allEntries.length === 0 ? <span className={s.small} style={{ padding: 8 }}>Nothing in use on General info yet.</span> : (
                  <>
                    <select className={s.select} style={{ margin: '0 8px 6px' }} value={infoCard} onChange={e => setInfoCard(Number(e.target.value))} aria-label="Info card">
                      {allEntries.map((e2, j) => <option key={e2.card.id} value={j}>{e2.card.name || e2.card.code}</option>)}
                    </select>
                    {(allEntries[infoCard]?.fields ?? []).map(f => (
                      <div key={f.token} className={s.menuItem} style={{ cursor: 'default' }}>
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <span className={s.small}>{f.label}</span>
                          <span style={{ whiteSpace: 'normal', fontSize: 12 }}>{f.value}</span>
                        </span>
                        <button type="button" className={s.chip} onClick={() => insertToken(f.token)}>+ Insert</button>
                      </div>
                    ))}
                    <span className={s.small} style={{ padding: '6px 8px', display: 'flex', gap: 8 }}>Inserts a live field · updates when General info changes<a className={s.link} href="/leads/info">Edit ↗</a></span>
                  </>
                )}
              </div>
            </>
          ) : null}
        </span>

        <span className={s.label}>THEN</span>
        {/* A dropdown, as drawn (the user, 2026-10-23: "原本应该是下拉式的"): the step's type, opening the radio list. */}
        <div className={s.kindPick}>
          <button type="button" className={s.kindTrigger} style={toneStyle(step.kind)} disabled={dis} aria-haspopup="listbox" aria-expanded={kindOpen} onClick={() => setKindOpen(o => !o)}>
            <span className={s.kindDot} />
            <span className={s.kindText}>{KINDS.find(k => k.kind === step.kind)?.label}<span className={s.kindHint}>{KINDS.find(k => k.kind === step.kind)?.hint}</span></span>
            <LeadIcon name="chevronDown" size={14} />
          </button>
          {kindOpen ? (
            <>
              <div className={s.kindScrim} onClick={() => setKindOpen(false)} aria-hidden="true" />
              <div className={s.kinds} data-menu="" role="radiogroup" aria-label="Then">
                {KINDS.map(k => (
                  <button key={k.kind} type="button" role="radio" aria-checked={step.kind === k.kind} className={s.kind} style={toneStyle(k.kind)} disabled={dis} onClick={() => { if (step.kind !== k.kind) setKind(k.kind); setKindOpen(false) }}>
                    <span className={s.kindDot} />
                    <span className={s.kindText}>{k.label}<span className={s.kindHint}>{k.hint}</span></span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>

        {step.kind === 'question' ? (
          <>
            {(step.buttons ?? []).map((b, j) => (
              <div key={j} className={s.option}>
                <span className={s.optionTop}>
                  <span className={s.num}>{j + 1}</span>
                  <input className={s.input} style={{ flex: 1 }} value={b.label} maxLength={20} disabled={dis} aria-label={`Option ${j + 1}`}
                    onChange={e => set({ buttons: step.buttons!.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} />
                  {canEdit && step.buttons!.length > 1 ? <button type="button" className={s.x} title="Remove option" onClick={() => set({ buttons: step.buttons!.filter((_, k) => k !== j) })}>×</button> : null}
                </span>
                <label className={s.field}>↳ Goes to {goes(b.next, v => set({ buttons: step.buttons!.map((x, k) => (k === j ? { ...x, next: v } : x)) }), `Option ${j + 1} goes to`)}</label>
                {!b.next ? closing(b.endMsg, v => set({ buttons: step.buttons!.map((x, k) => (k === j ? { ...x, endMsg: v } : x)) })) : null}
              </div>
            ))}
            {canEdit ? (
              <span style={{ display: 'flex', gap: 14 }}>
                <button type="button" className={s.link} disabled={(step.buttons ?? []).length >= 13} onClick={() => set({ buttons: [...(step.buttons ?? []), { label: `Option ${(step.buttons ?? []).length + 1}`, next: '' }] })}>+ Add option</button>
                <button type="button" className={s.link} onClick={() => set({ buttons: step.buttons!.map(x => ({ ...x, next: step.buttons![0].next })) })}>Same for all</button>
              </span>
            ) : null}
            <label className={s.field}>Keep the answer in
              <select className={s.select} value={step.saveAs ?? ''} disabled={dis} onChange={e => set({ saveAs: (e.target.value || null) as TemplateStep['saveAs'] })}>
                <option value="">Don’t keep it</option>
                {SAVE_AS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </label>
          </>
        ) : null}

        {step.kind === 'text' ? (
          <>
            <label className={s.field}>Save answer to
              <select className={s.select} value={step.saveAs ?? 'note'} disabled={dis} onChange={e => set({ saveAs: e.target.value as TemplateStep['saveAs'] })}>
                {SAVE_AS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </label>
            <label className={s.field}>Then go to {goes(step.next, v => set({ next: v }), 'Then go to')}</label>
            {!step.next ? closing(step.endMsg, v => set({ endMsg: v })) : null}
          </>
        ) : null}

        {step.kind === 'phone' ? (
          <>
            <span className={s.small}>When they send a valid number, it’s saved to the Phone card and the chat moves on.</span>
            <label className={s.field}>Next step {goes(step.next, v => set({ next: v }), 'Next step')}</label>
            {!step.next ? closing(step.endMsg, v => set({ endMsg: v })) : null}
            <span className={s.label}>IF IT’S NOT A PHONE</span>
            <textarea className={s.textarea} rows={2} value={step.retryText ?? ''} maxLength={1000} disabled={dis} placeholder="Empty: the template stops and CS takes over" aria-label="Retry message" onChange={e => set({ retryText: e.target.value })} />
            <label className={s.field}>Ask again up to
              <select className={s.select} value={step.retryMax ?? ''} disabled={dis} onChange={e => set({ retryMax: e.target.value || null })}>
                {['1', '2', '3', '4', '5'].map(n => <option key={n} value={n}>{n} time{n === '1' ? '' : 's'}</option>)}
                <option value="">No limit</option>
              </select>
            </label>
            <label className={s.field}>Still wrong {goes(step.failNext ?? 'person', v => set({ failNext: v }), 'Still wrong', [{ v: 'person', l: 'Hand to a person' }])}</label>
          </>
        ) : null}

        {step.kind === 'message' ? (
          <>
            <label className={s.field}>Then go to {goes(step.next, v => set({ next: v }), 'Then go to')}</label>
            {!step.next ? closing(step.endMsg, v => set({ endMsg: v })) : null}
          </>
        ) : null}
        {step.kind === 'handoff' ? <span className={s.small}>The chat moves to Waiting in the Inbox. The message above, if any, is sent first.</span> : null}
        {step.kind === 'ai' ? <span className={s.small}>The brand’s AI Agent takes it from here — a copilot today: it drafts, CS sends. <a className={s.link} href="/leads/ai">Edit this AI Agent →</a></span> : null}
      </div>
    </>
  )
}

// ── Test as customer ──

function TestChat({ draft }: { draft: Draft }) {
  const begin = () => (draft.steps[0] ? walkFrom(draft, draft.steps[0].id) : { said: [], waiting: null, tries: 0, ended: 'done' as const })
  const [w, setW] = useState<Walk>(begin)
  const [typed, setTyped] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [w.said.length])
  const waiting = draft.steps.find(x => x.id === w.waiting)
  const answer = (v: string) => { if (!v.trim()) return; setW(x => walkAnswer(draft, x, v)); setTyped('') }
  return (
    <>
      <div className={s.chat}>
        {w.said.map((m, i) => m.from === 'system' ? <span key={i} className={s.sys}>{m.text}</span> : (
          <div key={i} style={{ display: 'contents' }}>
            <div className={s.bubble} data-from={m.from}>{m.text}</div>
            {m.buttons && i === w.said.length - 1 && waiting?.kind === 'question' ? (
              <div className={s.chips}>{m.buttons.map(b => <button key={b} type="button" className={s.chip} onClick={() => answer(b)}>{b}</button>)}</div>
            ) : null}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className={s.chatInput} onSubmit={e => { e.preventDefault(); answer(typed) }}>
        <input className={s.input} style={{ flex: 1 }} value={typed} onChange={e => setTyped(e.target.value)} disabled={!w.waiting}
          placeholder={w.waiting ? (waiting?.kind === 'phone' ? 'e.g. 012-345 6789 or 〇一二…' : 'Type as the customer') : 'The chat ended'} aria-label="Type as the customer" />
        <button type="submit" className={s.btn} disabled={!w.waiting || !typed.trim()}>Send</button>
        <button type="button" className={s.btn} data-quiet="" onClick={() => setW(begin())}>Restart</button>
      </form>
    </>
  )
}
