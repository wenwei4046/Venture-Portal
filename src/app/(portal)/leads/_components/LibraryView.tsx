'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { removeLibraryItem, saveLibraryItem } from '@/lib/leads/actions'
import { KINDS, RETRY_PHONE, freshId, kindOf, templateProblem, type LibraryItem, type StepKind, type TemplateStep } from '@/lib/leads/template'
import { LeadIcon } from '@/components/layout/lead-icons'
import s from './replies.module.css'

/**
 * Lead View › Step library (2026-10-23, the redesign v2 handoff `Auto Reply.dc.html?view=library`): steps and short flows
 * to copy into templates. The list on the left (search, All / Steps / Flows, "+ New step", "+ New flow"); the item on
 * the right — its name, when to use it, its steps, and USED IN: each template holding a copy, and how many wait to
 * update. Saving makes the next version (lead_save_library_item); templates keep their copies and are asked first.
 */

type Draft = Pick<LibraryItem, 'id' | 'kind' | 'name' | 'description' | 'steps'> & { ver: number }
const newDraft = (kind: 'step' | 'flow'): Draft => ({
  id: `new-${Date.now().toString(36)}`, kind, ver: 0, name: kind === 'step' ? 'New step' : 'New flow', description: '',
  steps: kind === 'step'
    ? [{ id: 's1', kind: 'message', name: 'New step', text: '', next: '' }]
    : [{ id: 's1', kind: 'question', name: 'First question', text: '', buttons: [{ label: 'Option 1', next: 's2' }] }, { id: 's2', kind: 'handoff', name: 'To a person', text: 'One of our team will reply shortly.' }],
})
const draftOf = (l: LibraryItem): Draft => ({ id: l.id, kind: l.kind, ver: l.ver, name: l.name, description: l.description, steps: l.steps })

export default function LibraryView({ items, ready, initialId, canEdit }: { items: LibraryItem[]; ready: boolean; initialId: string | null; canEdit: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'step' | 'flow'>('all')
  const first = items.find(l => l.id === initialId) ?? items[0] ?? null
  const [d, setD] = useState<Draft | null>(first ? draftOf(first) : null)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [busy, start] = useTransition()
  useEffect(() => {
    if (!dirty) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [dirty])

  const shown = items.filter(l => (kind === 'all' || l.kind === kind) && (!q.trim() || `${l.name} ${l.description}`.toLowerCase().includes(q.trim().toLowerCase())))
  const live = d ? items.find(l => l.id === d.id) ?? null : null
  const open = (next: Draft) => {
    if (dirty && !window.confirm('Leave this item without saving its changes?')) return
    setD(next); setDirty(next.id.startsWith('new-')); setError('')
  }
  const edit = (fn: (x: Draft) => Draft) => { setD(x => (x ? fn(x) : x)); setDirty(true); setError('') }
  const setStep = (i: number, o: Partial<TemplateStep>) => edit(x => ({ ...x, steps: x.steps.map((st, j) => (j === i ? { ...st, ...o } : st)) }))
  const save = () => {
    if (!d) return
    const problem = templateProblem(d.steps)
    if (problem) { setError(problem); return }
    start(async () => {
      const isNew = d.id.startsWith('new-')
      const r = await saveLibraryItem(isNew ? null : d.id, { kind: d.steps.length > 1 ? 'flow' : 'step', name: d.name, description: d.description, steps: d.steps })
      if (!r.ok) { setError(r.reason); return }
      setD(x => (x ? { ...x, id: r.data, ver: x.ver + 1, kind: x.steps.length > 1 ? 'flow' : 'step' } : x))
      setDirty(false)
      router.refresh()
    })
  }
  const remove = () => {
    if (!d || !live) return
    if (!window.confirm(`Delete “${live.name}” from the library? Templates keep their copies.`)) return
    start(async () => {
      const r = await removeLibraryItem(live.id)
      if (!r.ok) { setError(r.reason); return }
      setDirty(false)
      const next = items.find(l => l.id !== live.id)
      setD(next ? draftOf(next) : null)
      router.refresh()
    })
  }
  const dis = !canEdit
  const goes = (value: string | null | undefined, onChange: (v: string) => void, self: string) => (
    <select className={s.select} value={value ?? ''} disabled={dis} onChange={e => onChange(e.target.value)} aria-label="Goes to">
      <option value="">end</option>
      {d!.steps.map((x, j) => (x.id === self ? null : <option key={x.id} value={x.id}>step {j + 1}</option>))}
    </select>
  )

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.titles}>
          <span className={s.eyebrow}>REPLIES</span>
          <h1 className={s.title}>Step library</h1>
        </div>
        <span className={s.status}><span className={s.dot} aria-hidden="true" />Meta not connected · auto replies run in test conversations only</span>
      </div>
      <div className={s.panel}>
        <div className={s.libSplit}>
          <aside className={s.libSide} aria-label="Library">
            <div className={s.libSideHead}>
              <span className={s.kicker}>LIBRARY</span>
              <input className={s.input} value={q} onChange={e => setQ(e.target.value)} placeholder="Search steps and flows" aria-label="Search the library" />
              <span className={s.seg} style={{ alignSelf: 'stretch', display: 'flex' }}>
                {(['all', 'step', 'flow'] as const).map(k => <button key={k} type="button" className={s.segBtn} style={{ flex: 1 }} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'step' ? 'Steps' : 'Flows'}</button>)}
              </span>
            </div>
            <div className={s.libRows}>
              {shown.map(l => (
                <button key={l.id} type="button" className={s.libRow} aria-current={d?.id === l.id} onClick={() => d?.id !== l.id && open(draftOf(l))}>
                  <span className={s.listName}>{l.name}</span>
                  <span className={s.ver}>v{l.ver}</span>
                  <span className={s.listSub} style={{ gridColumn: '1 / -1' }}>
                    {l.kind === 'flow' ? `Flow · ${l.steps.length} steps` : `${kindOf(l.steps[0]?.kind ?? 'message').short} step`} · {l.usedIn.length ? `in ${l.usedIn.length} template${l.usedIn.length === 1 ? '' : 's'}` : 'not used yet'}
                  </span>
                </button>
              ))}
              {d?.id.startsWith('new-') ? <button type="button" className={s.libRow} aria-current><span className={s.listName}>{d.name}</span><span className={s.ver}>new</span></button> : null}
              {shown.length === 0 && !d?.id.startsWith('new-') ? <span className={s.small} style={{ padding: 10 }}>Nothing here yet. Save a step from a template (right-click it), or start one below.</span> : null}
            </div>
            {canEdit ? (
              <div className={s.libSideFoot}>
                <button type="button" className={s.link} onClick={() => open(newDraft('step'))}>+ New step</button>
                <button type="button" className={s.link} onClick={() => open(newDraft('flow'))}>+ New flow</button>
              </div>
            ) : null}
          </aside>

          {d ? (
            <section className={s.libMain}>
              {!ready ? <div className={s.note}>Waiting for the database update — you can try the page, but nothing is saved yet.</div> : null}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <input className={s.libTitle} value={d.name} maxLength={60} disabled={dis} aria-label="Name" onChange={e => edit(x => ({ ...x, name: e.target.value }))} />
                  <input className={s.bare} style={{ maxWidth: 420 }} value={d.description} maxLength={200} disabled={dis} placeholder="When to use it" aria-label="When to use it" onChange={e => edit(x => ({ ...x, description: e.target.value }))} />
                  <span className={s.small}>{d.steps.length > 1 ? `Flow · ${d.steps.length} steps` : `${kindOf(d.steps[0]?.kind ?? 'message').short} step`} · {d.ver ? `v${d.ver}` : 'not saved yet'}</span>
                </div>
                {canEdit ? (
                  <>
                    {live ? <button type="button" className={s.iconBtn} title="Delete" onClick={remove} disabled={busy}><LeadIcon name="trash" size={13} /></button> : null}
                    <button type="button" className={s.btn} data-quiet="" disabled={!dirty || busy} onClick={() => { setD(live ? draftOf(live) : null); setDirty(false) }}>Discard</button>
                    <button type="button" className={s.btn} data-strong="" disabled={!dirty || busy || !ready} onClick={save}>{busy ? 'Saving…' : `Save as v${d.ver + 1}`}</button>
                  </>
                ) : null}
              </div>
              {error ? <div className={s.error} role="alert">{error}</div> : null}

              <span className={s.kicker}>STEPS</span>
              {d.steps.map((st, i) => (
                <div key={st.id} className={s.libStep}>
                  <span className={s.num}>{i + 1}</span>
                  <div className={s.libStepBody}>
                    <div className={s.libStepTop}>
                      <input className={s.input} value={st.name ?? ''} maxLength={40} disabled={dis} placeholder="Step name" aria-label="Step name" onChange={e => setStep(i, { name: e.target.value })} />
                      <select className={s.select} value={st.kind} disabled={dis} aria-label="Type"
                        onChange={e => {
                          const k = e.target.value as StepKind
                          setStep(i, { kind: k, ...(k === 'question' && !st.buttons?.length ? { buttons: [{ label: 'Option 1', next: '' }] } : {}), ...(k === 'phone' && !st.retryText ? { retryText: RETRY_PHONE, retryMax: '2', failNext: 'person' } : {}) })
                        }}>
                        {KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                      </select>
                    </div>
                    <textarea className={s.textarea} rows={2} value={st.text ?? ''} maxLength={1000} disabled={dis} placeholder="What the customer reads" aria-label="Message" onChange={e => setStep(i, { text: e.target.value })} />
                    {st.kind === 'question' ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        {(st.buttons ?? []).map((b, j) => (
                          <span key={j} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input className={s.input} style={{ width: 120 }} value={b.label} maxLength={20} disabled={dis} aria-label={`Option ${j + 1}`}
                              onChange={e => setStep(i, { buttons: st.buttons!.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} />
                            → {goes(b.next, v => setStep(i, { buttons: st.buttons!.map((x, k) => (k === j ? { ...x, next: v } : x)) }), st.id)}
                            {canEdit && st.buttons!.length > 1 ? <button type="button" className={s.x} onClick={() => setStep(i, { buttons: st.buttons!.filter((_, k) => k !== j) })}>×</button> : null}
                          </span>
                        ))}
                        {canEdit ? <button type="button" className={s.link} onClick={() => setStep(i, { buttons: [...(st.buttons ?? []), { label: `Option ${(st.buttons ?? []).length + 1}`, next: '' }] })}>+ Option</button> : null}
                      </div>
                    ) : st.kind !== 'handoff' && st.kind !== 'ai' ? (
                      <span className={s.small} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Then → {goes(st.next, v => setStep(i, { next: v }), st.id)}</span>
                    ) : null}
                    {(st.kind === 'question' ? (st.buttons ?? []).some(b => !b.next) : !['handoff', 'ai'].includes(st.kind) && !st.next) ? (
                      <label className={s.field}>Closing message when it ends here · empty uses the template’s
                        <input className={s.input} value={st.endMsg ?? ''} maxLength={1000} disabled={dis} placeholder="e.g. Thanks! Our salesperson will WhatsApp you soon 😊" onChange={e => setStep(i, { endMsg: e.target.value })} />
                      </label>
                    ) : null}
                  </div>
                  {canEdit && d.steps.length > 1 ? (
                    <button type="button" className={s.x} title="Remove step"
                      onClick={() => edit(x => ({ ...x, steps: x.steps.filter((_, j) => j !== i).map(y => ({ ...y, ...(y.next === st.id ? { next: '' } : {}), ...(y.buttons ? { buttons: y.buttons.map(b => (b.next === st.id ? { ...b, next: '' } : b)) } : {}) })) }))}>
                      <LeadIcon name="trash" size={12} />
                    </button>
                  ) : <span />}
                </div>
              ))}
              {canEdit ? (
                <button type="button" className={s.link} style={{ alignSelf: 'flex-start' }}
                  onClick={() => edit(x => {
                    const id = freshId(x.steps)
                    const last = x.steps[x.steps.length - 1]
                    const steps = x.steps.map(y => (y.id === last.id && y.kind !== 'question' && y.kind !== 'handoff' && y.kind !== 'ai' && !y.next ? { ...y, next: id } : y))
                    return { ...x, steps: [...steps, { id, kind: 'message', name: '', text: '', next: '' }] }
                  })}>+ Add a step after</button>
              ) : null}

              <span className={s.kicker}>USED IN <span className={s.small} style={{ fontWeight: 400, letterSpacing: 0 }}>· Each template keeps its own copy and asks before taking a new version.</span></span>
              <div className={s.used}>
                {live && live.usedIn.length ? live.usedIn.map(u => (
                  <div key={u.flowId} className={s.usedRow}>
                    <Link className={s.link} href={`/leads/flows?t=${u.flowId}`}>{u.flowName}</Link>
                    <span>{u.steps.join(', ')}</span>
                    {u.outdated ? <Link className={`${s.link} ${s.amber}`} href={`/leads/flows?t=${u.flowId}`}>{u.outdated} waiting to update</Link> : <span className={s.green}>Up to date</span>}
                  </div>
                )) : <div className={s.usedRow}><span className={s.small}>Not used yet — add it from a template’s “+ Step” or Library.</span></div>}
              </div>
            </section>
          ) : (
            <section className={s.libMain}><span className={s.small}>The library is empty. Right-click a step on a template to save it here, or start a new step.</span></section>
          )}
        </div>
      </div>
    </div>
  )
}
