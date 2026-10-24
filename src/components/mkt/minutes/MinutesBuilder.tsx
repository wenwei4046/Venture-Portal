'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteMktMinutes, publishMktMinutes, saveMktMinutes } from '@/lib/marketing/actions'
import {
  ADDABLE_TYPES, COL_GLYPH, MAX_MINUTES_FIELDS, MINUTES_COL_TYPES, RULES, addMinutesField, colTypeOf, minutesFieldsPayload, minutesPatch,
  minutesProblems, minutesSummary, minutesWarnings, newMinutesFields, newMinutesName, NEW_RULES, type MinutesEdit, type MinutesField,
  type MinutesTemplate, type MinutesType,
} from '@/lib/marketing/minutes'
import DeleteDraft from '../builder/DeleteDraft'
import MinutesPreview from './MinutesPreview'
import m from './minutes.module.css'

// The Minutes Builder (`Minutes Builder.dc.html`; the manager's — Marketing · Manage): the minutes templates down the
// left (+ New minutes template); the one open — its name, its version, Edit · Preview. Edit: its form fields (drag to
// order; each one's kind, Required, whether the PIC sees it, ✕ — the project and the attendees are kept; a table's
// columns, each named and of a kind) and a field added by name and kind; the completion rules beside them. Preview:
// the minutes as the staff fill them in or the PIC reads them. At the foot what it asks, the warnings, Publish. A
// draft is saved as it is typed — only what changed, never over somebody else's save (as the Workflow Builder's).

type SaveState = { state: 'saved' } | { state: 'saving' } | { state: 'error'; reason: string; stale: boolean }

const editOf = (t: MinutesTemplate): MinutesEdit => ({ name: t.name, fields: t.fields, rules: t.rules })

export default function MinutesBuilder({ initial, first, attendees }: {
  initial: MinutesTemplate[]
  /** The template to open (?t=); else the first. */
  first: string | null
  /** Who the Preview's sample minutes list as attending. */
  attendees: string[]
}) {
  const router = useRouter()
  const start = (first ? initial.find(t => t.id === first) : undefined) ?? initial[0] ?? null
  const [list, setList] = useState<MinutesTemplate[]>(initial)
  const [selId, setSelId] = useState<string | null>(start?.id ?? null)
  const [edit, setEdit] = useState<MinutesEdit | null>(start ? editOf(start) : null)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [kind, setKind] = useState<MinutesType>('Short text')
  const [drag, setDrag] = useState<number | null>(null)
  const [col, setCol] = useState<[number, number] | null>(null)

  const selRef = useRef<string | null>(start?.id ?? null)
  const editRef = useRef<MinutesEdit | null>(start ? editOf(start) : null)
  const savedRef = useRef<MinutesEdit | null>(start ? editOf(start) : null)
  const revRef = useRef<number>(start?.rev ?? 1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = useCallback((words: string) => {
    setToast(words)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
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
        setSave({ state: 'error', reason: r.reason, stale: /since you opened it/.test(r.reason) })
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
    if (save.state === 'error' && save.stale) return
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

  const open = async (id: string, from: MinutesTemplate[] = list) => {
    if (id === selRef.current) return
    if (!(await flush())) {
      flash('This template is not saved — reload before opening another')
      return
    }
    const t = from.find(x => x.id === id)
    if (!t) return
    const e = editOf(t)
    selRef.current = id
    editRef.current = e
    savedRef.current = e
    revRef.current = t.rev
    setSelId(id)
    setEdit(e)
    setCol(null)
    setSave({ state: 'saved' })
    // Through the router: a URL changed behind its back is put back by the next save's refresh.
    router.replace(`/marketing/minutes?t=${id}`, { scroll: false })
  }

  const newTemplate = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const name = newMinutesName(list.map(t => t.name))
      const r = await saveMktMinutes(null, null, { name, fields: minutesFieldsPayload(newMinutesFields()), rules: NEW_RULES })
      if (!r.ok) return flash(r.reason)
      const fresh = r.templates ?? list
      setList(fresh)
      await open(r.id, fresh)
      setMode('edit')
    } finally {
      setBusy(false)
    }
  }

  const sel = list.find(t => t.id === selId) ?? null
  const fields = edit?.fields ?? []
  const rules = edit?.rules ?? NEW_RULES
  const changed = !!sel?.changed || save.state === 'saving'
  const problems = edit ? minutesProblems(fields) : []
  const warnings = edit ? [...new Set([...minutesWarnings(fields, rules), ...problems])] : []
  const verLabel = !sel ? '' : changed ? `Draft v${sel.version + 1}` : sel.version ? `v${sel.version} · live` : 'Draft v1'

  const setFields = (next: MinutesField[]) => edit && change({ ...edit, fields: next })
  const setField = (i: number, patch: Partial<MinutesField>) => setFields(fields.map((f, k) => (k === i ? { ...f, ...patch } : f)))
  const add = () => {
    if (!draft.trim() || fields.length >= MAX_MINUTES_FIELDS) return
    setFields(addMinutesField(fields, draft, kind))
    setDraft('')
  }
  const move = (from: number, to: number) => {
    if (from === to) return
    const next = [...fields]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    setFields(next)
  }

  const publish = async () => {
    if (!sel || !edit || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await publishMktMinutes(sel.id, revRef.current)
      if (!r.ok) return flash(r.reason)
      setList(l => l.map(t => (t.id === sel.id ? { ...t, version: r.version, changed: false } : t)))
      flash(`${edit.name.trim() || sel.name} v${r.version} published · new minutes use it from now`)
    } finally {
      setBusy(false)
    }
  }
  const publishOff = !sel || !changed || problems.length > 0 || save.state === 'error' || busy
  const publishWhy = !sel ? undefined : !changed ? `Nothing has changed since v${sel.version}` : problems[0] ?? (save.state === 'error' ? save.reason : undefined)

  /** A template never published, deleted (the user's answer 8) — the next one opens, or none is left. */
  const remove = async () => {
    if (!sel || busy) return
    setBusy(true)
    try {
      if (!(await flush())) return
      const r = await deleteMktMinutes(sel.id, revRef.current)
      if (!r.ok) return flash(r.reason)
      const fresh = r.templates ?? list.filter(t => t.id !== sel.id)
      setList(fresh)
      selRef.current = null
      editRef.current = null
      savedRef.current = null
      setSelId(null)
      setEdit(null)
      if (fresh[0]) await open(fresh[0].id, fresh)
      else router.replace('/marketing/minutes', { scroll: false })
      flash(`Deleted “${sel.name}”`)
    } finally {
      setBusy(false)
    }
  }

  const colOpen = col && fields[col[0]]?.type === 'Table' && fields[col[0]].cols?.[col[1]] ? col : null

  return (
    <div className={m.page}>
      <div className={m.head}>
        <span className={m.headIcon} aria-hidden="true">📝</span>
        <span className={m.title}>Minutes Builder</span>
        <span className={m.grow} />
        <button type="button" className={m.newBtn} disabled={busy} onClick={() => void newTemplate()}>+ New minutes template</button>
      </div>

      <div className={m.grid}>
        <nav className={m.list} aria-label="Minutes templates">
          <div className={m.listLabel}>Minutes templates</div>
          {list.map(t => {
            const on = t.id === selId
            const n = on ? fields.length : t.fields.length
            return (
              <button key={t.id} type="button" className={`${m.tpl}${on ? ` ${m.tplOn}` : ''}`} aria-current={on ? 'true' : undefined} onClick={() => void open(t.id)}>
                <span className={m.tplName}>{on ? edit?.name || t.name : t.name}</span>
                <span className={m.tplMeta}>{t.version ? `v${t.version}` : 'draft'}{t.version && t.changed ? ' · draft' : ''} · {n} field{n === 1 ? '' : 's'}</span>
              </button>
            )
          })}
          {list.length === 0 ? <div className={m.empty}>No minutes templates yet</div> : null}
        </nav>

        <div className={m.main}>
          {sel && edit ? (
            <>
              <div className={m.top}>
                <input className={m.name} value={edit.name} maxLength={60} aria-label="Template name" onChange={e => change({ ...edit, name: e.target.value })} />
                <span className={m.ver}>{verLabel}</span>
                {save.state === 'error' ? (
                  <span className={m.notSaved} role="alert">
                    Not saved · {save.reason}
                    {save.stale ? <button type="button" className={m.reload} onClick={() => window.location.reload()}>Reload</button> : null}
                  </span>
                ) : (
                  <span className={m.saved}>{save.state === 'saving' ? 'Saving…' : 'Saved'}</span>
                )}
                <span className={m.grow} />
                <div className={m.modes}>
                  {([['edit', 'Edit'], ['preview', 'Preview']] as const).map(([k, label]) => (
                    <button key={k} type="button" className={`${m.mode}${mode === k ? ` ${m.modeOn}` : ''}`} aria-pressed={mode === k} onClick={() => setMode(k)}>{label}</button>
                  ))}
                </div>
              </div>

              {mode === 'preview' ? (
                <MinutesPreview name={edit.name} version={verLabel} fields={fields} rules={rules} attendees={attendees} />
              ) : (
                <div className={m.editGrid}>
                  <section className={m.card} aria-label="Form fields">
                    <div className={m.cardHead}><span className={m.cardTitle}>Form fields</span></div>
                    <div className={`${m.row} ${m.rowHead}`}>
                      <span>Field</span><span>Type</span><span>Required</span><span>PIC sees</span><span />
                    </div>
                    {fields.map((f, i) => (
                      <div key={f.key} className={m.fieldWrap}>
                        <div
                          className={`${m.row}${drag === i ? ` ${m.rowDrag}` : ''}`}
                          draggable
                          onDragStart={() => setDrag(i)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => {
                            if (drag !== null) move(drag, i)
                            setDrag(null)
                          }}
                          onDragEnd={() => setDrag(null)}
                        >
                          <span className={m.fieldName}>
                            <span className={m.grip} title="Drag to reorder">⋮⋮</span>
                            <input className={m.fieldInput} value={f.name} maxLength={60} readOnly={f.lock} aria-label="Field name" onChange={e => setField(i, { name: e.target.value })} />
                          </span>
                          <span><span className={m.type}>{f.type}</span></span>
                          <span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={f.req || f.lock}
                              aria-label={`${f.name} is required`}
                              className={`${m.sw}${f.req || f.lock ? ` ${m.swOn}` : ''}`}
                              disabled={f.lock}
                              title={f.lock ? 'Every minutes keeps it' : undefined}
                              onClick={() => setField(i, { req: !f.req })}
                            />
                          </span>
                          <span>
                            <button type="button" className={`${m.picToggle}${f.pic ? ` ${m.picOn}` : ''}`} aria-pressed={f.pic} aria-label={`The PIC sees ${f.name}`} onClick={() => setField(i, { pic: !f.pic })}>
                              {f.pic ? '👁 Yes' : '— No'}
                            </button>
                          </span>
                          <span>
                            <button type="button" className={m.x} disabled={f.lock} aria-label="Remove field" title={f.lock ? 'Every minutes keeps it' : 'Remove'} onClick={() => setFields(fields.filter((_, k) => k !== i))}>×</button>
                          </span>
                        </div>
                        {f.type === 'Table' ? (
                          <div className={m.tbl}>
                            <div className={m.tblHead}><span>Table columns</span><span className={m.tblCount}>{(f.cols ?? []).length} columns</span></div>
                            <div className={m.cols}>
                              {(f.cols ?? []).map((c, ci) => {
                                const on = colOpen?.[0] === i && colOpen?.[1] === ci
                                return (
                                  <button key={ci} type="button" className={`${m.col}${on ? ` ${m.colOn}` : ''}`} aria-expanded={on} onClick={() => setCol(on ? null : [i, ci])}>
                                    <span className={m.colTop}><span className={m.colGlyph}>{COL_GLYPH[c.type]}</span><span className={m.colName}>{c.name || '…'}</span></span>
                                    <span className={m.colKind}>{c.type}</span>
                                  </button>
                                )
                              })}
                              {(f.cols ?? []).length < 8 ? (
                                <button
                                  type="button"
                                  className={m.colAdd}
                                  aria-label="Add column"
                                  onClick={() => {
                                    const cols = [...(f.cols ?? []), { name: `Column ${(f.cols ?? []).length + 1}`, type: 'Text' as const }]
                                    setField(i, { cols })
                                    setCol([i, cols.length - 1])
                                  }}
                                >
                                  +
                                </button>
                              ) : null}
                            </div>
                            {colOpen && colOpen[0] === i ? (() => {
                              const ci = colOpen[1]
                              const c = (f.cols ?? [])[ci]
                              const setCols = (next: NonNullable<MinutesField['cols']>) => setField(i, { cols: next })
                              return (
                                <div className={m.colPanel}>
                                  <div className={m.colPanelHead}><span>Column settings</span><button type="button" className={m.x} aria-label="Close" onClick={() => setCol(null)}>×</button></div>
                                  <label className={m.colLabel}>
                                    <span>What&apos;s this column called?</span>
                                    <input
                                      className={m.colInput}
                                      value={c.name}
                                      maxLength={40}
                                      onChange={e => setCols((f.cols ?? []).map((x, k) => (k === ci ? { name: e.target.value, type: x.type === 'Text' ? colTypeOf(undefined, e.target.value) : x.type } : x)))}
                                    />
                                  </label>
                                  <div className={m.colLabel}>
                                    <span>What kind of answer?</span>
                                    <div className={m.chips}>
                                      {MINUTES_COL_TYPES.map(k => (
                                        <button key={k} type="button" className={`${m.chip}${c.type === k ? ` ${m.chipDark}` : ''}`} onClick={() => setCols((f.cols ?? []).map((x, j) => (j === ci ? { ...x, type: k } : x)))}>
                                          {COL_GLYPH[k]} {k}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  {(f.cols ?? []).length > 1 ? (
                                    <button
                                      type="button"
                                      className={m.colRemove}
                                      onClick={() => {
                                        setCols((f.cols ?? []).filter((_, k) => k !== ci))
                                        setCol(null)
                                      }}
                                    >
                                      Remove column
                                    </button>
                                  ) : null}
                                </div>
                              )
                            })() : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {fields.length < MAX_MINUTES_FIELDS ? (
                      <div className={m.addRow}>
                        <input
                          className={m.addInput}
                          value={draft}
                          maxLength={60}
                          placeholder="New field name"
                          aria-label="New field name"
                          onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && add()}
                        />
                        <div className={m.chips}>
                          {ADDABLE_TYPES.filter(t => t !== 'Project link' || !fields.some(f => f.type === 'Project link')).map(t => (
                            <button key={t} type="button" className={`${m.chip}${kind === t ? ` ${m.chipOn}` : ''}`} aria-pressed={kind === t} onClick={() => setKind(t)}>{t}</button>
                          ))}
                        </div>
                        <button type="button" className={m.addBtn} disabled={!draft.trim()} onClick={add}>Add field</button>
                      </div>
                    ) : null}
                  </section>

                  <section className={m.card} aria-label="Completion rules">
                    <div className={m.cardHead}><span className={m.cardTitle}>Completion rules</span></div>
                    {RULES.filter(r => !r.under || rules[r.under]).map(r => (
                      <button
                        key={r.key}
                        type="button"
                        role="switch"
                        aria-checked={rules[r.key]}
                        className={`${m.rule}${r.under ? ` ${m.ruleUnder}` : ''}`}
                        title={r.hint}
                        // A rule turned off takes the ones beneath it with it (Both PICs sign off under PIC signs off).
                        onClick={() => change({ ...edit, rules: { ...rules, [r.key]: !rules[r.key],
                          ...(rules[r.key] ? Object.fromEntries(RULES.filter(x => x.under === r.key).map(x => [x.key, false])) : {}) } })}
                      >
                        <span className={`${m.sw}${rules[r.key] ? ` ${m.swOn}` : ''}`} aria-hidden="true" />
                        <span className={m.ruleName}>{r.name}</span>
                      </button>
                    ))}
                  </section>
                </div>
              )}
            </>
          ) : (
            <div className={m.empty}>{list.length ? 'Pick a template' : 'No minutes templates yet'}</div>
          )}
        </div>
      </div>

      {sel && edit ? (
        <div className={m.foot}>
          <span>{minutesSummary(fields)}</span>
          {warnings.map(w => <span key={w} className={m.warn}>⚠️ {w}</span>)}
          <span className={m.grow} />
          {sel.version ? null : <DeleteDraft key={sel.id} what="template" busy={busy} onDelete={() => void remove()} />}
          <button type="button" className={m.publish} disabled={publishOff} title={publishWhy} onClick={() => void publish()}>
            {changed ? `Publish v${sel.version + 1}` : 'Published ✓'}
          </button>
        </div>
      ) : null}

      {toast ? <div className={m.toast} role="status">{toast}</div> : null}
    </div>
  )
}
